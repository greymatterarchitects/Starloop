// Picks the cleanest portrait of a star from Wikimedia Commons (free, no key, commercially usable
// with attribution). Looks through the star's Commons category, prefers portrait-shaped, sharp,
// "portrait / photoshoot / promo" images, avoids busy event shots, then measures each candidate's
// edges and favours the lightest, most even (studio-like) background.
import sharp from 'sharp';
import { cached, getJson, limiter } from './util.js';

const DAY = 24 * 3600_000;
const UA = { 'User-Agent': 'StarLoop/1.0 (local development app)' };
const lim = limiter(4);

const GOOD = /portrait|photo ?shoot|photoshoot|headshot|promo|promotional|studio|press|magazine|cover|filmfare|vogue|elle|grazia|calendar/i;
const BUSY = /premiere|launch|event|award|ceremony|festival|rally|meet|celebrat|wedding|party|stage|concert|airport|spotted|crowd|press ?meet|trailer|audio|success|function|felicitat|inaugurat/i;
const NOT_PHOTO = /signature|logo|poster|autograph|\.svg$|screenshot|collage|map/i;
const strip = (s = '') => String(s).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

async function commonsCategory(qid) {
  const j = await lim(() => getJson(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qid}&props=claims&format=json`));
  const c = j.entities?.[qid]?.claims || {};
  return {
    category: c.P373?.[0]?.mainsnak?.datavalue?.value || null,
    main: c.P18?.[0]?.mainsnak?.datavalue?.value || null,
  };
}

async function candidates(category, main) {
  const files = [];
  if (category) {
    const p = new URLSearchParams({
      action: 'query', format: 'json', generator: 'categorymembers', gcmtitle: `Category:${category}`, gcmtype: 'file', gcmlimit: '60',
      prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '480', iiextmetadatafilter: 'Artist|LicenseShortName|ImageDescription|Categories',
    });
    const j = await lim(() => getJson(`https://commons.wikimedia.org/w/api.php?${p}`, UA));
    files.push(...Object.values(j.query?.pages || {}));
  }
  if (main && !files.some((f) => f.title === `File:${main}`)) {
    const p = new URLSearchParams({ action: 'query', format: 'json', titles: `File:${main}`, prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '480', iiextmetadatafilter: 'Artist|LicenseShortName|ImageDescription|Categories' });
    const j = await lim(() => getJson(`https://commons.wikimedia.org/w/api.php?${p}`, UA));
    files.push(...Object.values(j.query?.pages || {}).map((f) => ({ ...f, isMain: true })));
  }
  return files.map((f) => {
    const ii = f.imageinfo?.[0];
    if (!ii) return null;
    const meta = ii.extmetadata || {};
    const text = `${f.title} ${strip(meta.ImageDescription?.value)} ${meta.Categories?.value || ''}`;
    return {
      title: f.title, thumb: ii.thumburl, w: ii.width, h: ii.height, mime: ii.mime, text, isMain: !!f.isMain,
      credit: strip(meta.Artist?.value) || 'Wikimedia Commons', license: meta.LicenseShortName?.value || '',
      page: ii.descriptionurl,
    };
  }).filter(Boolean);
}

function textScore(c) {
  if (!/jpeg|png/.test(c.mime) || NOT_PHOTO.test(c.text) || c.w < 360) return -99;
  const ratio = c.h / c.w;
  let s = 0;
  if (ratio >= 1.05 && ratio <= 1.9) s += 2; else if (ratio < 0.9) s -= 2;
  if (GOOD.test(c.text)) s += 3;
  if (BUSY.test(c.text)) s -= 2;
  if (c.isMain) s += 1;
  s += Math.min(2, (c.w * c.h) / 2_000_000);
  return s;
}

/** Lightness and evenness of the image border (0..1 each). Studio / plain backdrops score high. */
async function backdrop(thumb) {
  const r = await lim(() => fetch(thumb, { headers: UA, signal: AbortSignal.timeout(12000) }));
  if (!r.ok) throw new Error(`thumb ${r.status}`);
  const { data, info } = await sharp(Buffer.from(await r.arrayBuffer())).resize(24, 32, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = [];
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const edge = x < 3 || x >= info.width - 3 || y < 3; // left, right and top bands (bottom is usually the body)
    if (!edge) continue;
    const i = (y * info.width + x) * 3;
    const [R, G, B] = [data[i], data[i + 1], data[i + 2]];
    px.push({ l: 0.2126 * R + 0.7152 * G + 0.0722 * B, sat: Math.max(R, G, B) - Math.min(R, G, B) });
  }
  const mean = px.reduce((a, p) => a + p.l, 0) / px.length;
  const sd = Math.sqrt(px.reduce((a, p) => a + (p.l - mean) ** 2, 0) / px.length);
  const sat = px.reduce((a, p) => a + p.sat, 0) / px.length;
  return { light: mean / 255, even: 1 - Math.min(1, sd / 70), calm: 1 - Math.min(1, sat / 120) };
}

/** Best Commons portrait for a star ({ url, credit, license, page }) or null. Cached for a week. */
export async function bestPortrait(star) {
  if (!star?.qid) return null;
  return cached(`portrait:${star.qid}`, 7 * DAY, async () => {
    try {
      const { category, main } = await commonsCategory(star.qid);
      const pool = (await candidates(category, main))
        .map((c) => ({ ...c, ts: textScore(c) }))
        .filter((c) => c.ts > -50)
        .sort((a, b) => b.ts - a.ts)
        .slice(0, 10);
      if (!pool.length) return null;
      const scored = await Promise.all(pool.map(async (c) => {
        try {
          const b = await backdrop(c.thumb);
          return { ...c, score: c.ts + b.light * 4 + b.even * 3 + b.calm * 1.5, b };
        } catch { return { ...c, score: c.ts }; }
      }));
      const best = scored.sort((a, b) => b.score - a.score)[0];
      return { url: best.thumb.split('?')[0], credit: best.credit, license: best.license, page: best.page };
    } catch {
      return null;
    }
  });
}
