import { INDUSTRIES, INDUSTRY_IDS } from './industries.js';
import { cached, chunk, clamp, getJson, limiter } from './util.js';
import { discoveredStars } from './discover.js';
import { tmdbPortrait } from './portraits.js';

const H = 3600_000;
const wikiLimit = limiter(6);

const ROLE_WORDS = [
  ['actress', 'Actress'], ['actor', 'Actor'], ['producer', 'Producer'], ['director', 'Director'],
  ['screenwriter', 'Writer'], ['playback singer', 'Singer'], ['singer', 'Singer'], ['dancer', 'Dancer'],
  ['politician', 'Politician'], ['model', 'Model'], ['television personality', 'TV Host'], ['wrestler', 'Wrestler'],
];

function rolesFrom(text = '') {
  const t = text.toLowerCase();
  const found = [];
  for (const [w, label] of ROLE_WORDS) {
    const i = t.indexOf(w);
    if (i >= 0 && !found.some((f) => f.label === label || (label === 'Actor' && f.label === 'Actress'))) found.push({ i, label });
  }
  return found.sort((a, b) => a.i - b.i).slice(0, 2).map((f) => f.label).join(' · ') || 'Actor';
}

const cleanImg = (u) => (u ? u.replace(/\?utm_[^]*$/, '') : null);

/** Live Wikipedia profile data (photo, description, intro, regional-language title) for a set of titles. */
export async function wikiProfiles(titles, regionalLang) {
  const out = {};
  for (const group of chunk(titles, 20)) {
    const params = new URLSearchParams({
      action: 'query', format: 'json', formatversion: '2', redirects: '1',
      prop: 'pageimages|description|extracts|langlinks|pageprops', ppprop: 'wikibase_item',
      piprop: 'thumbnail|original', pithumbsize: '720', pilicense: 'any',
      exintro: '1', explaintext: '1', exsentences: '2', exlimit: 'max', lllimit: 'max',
      titles: group.join('|'),
    });
    if (regionalLang) params.set('lllang', regionalLang);
    const j = await wikiLimit(() => getJson(`https://en.wikipedia.org/w/api.php?${params}`));
    const q = j.query || {};
    const norm = Object.fromEntries((q.normalized || []).map((n) => [n.from, n.to]));
    const redir = Object.fromEntries((q.redirects || []).map((n) => [n.from, n.to]));
    const pages = Object.fromEntries((q.pages || []).map((p) => [p.title, p]));
    for (const t of group) {
      let k = norm[t] || t.replace(/_/g, ' ');
      k = redir[k] || k;
      const p = pages[k];
      if (!p || p.missing) continue;
      out[t] = {
        title: p.title,
        description: p.description || '',
        extract: p.extract || '',
        image: cleanImg(p.thumbnail?.source || p.original?.source),
        imageOriginal: cleanImg(p.original?.source),
        regionalTitle: p.langlinks?.[0]?.title || null,
        qid: p.pageprops?.wikibase_item || null,
        wikiUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, '_'))}`,
      };
    }
  }
  return out;
}

const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');

/** Daily human page views (last 14 days) – the real-world popularity signal behind trend scores. */
export async function pageviews(project, title) {
  return cached(`pv:${project}:${title}`, 3 * H, async () => {
    const end = new Date(Date.now() - 86400_000);
    const start = new Date(end.getTime() - 13 * 86400_000);
    const art = encodeURIComponent(title.replace(/ /g, '_'));
    const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/${project}/all-access/user/${art}/daily/${ymd(start)}00/${ymd(end)}00`;
    try {
      const j = await wikiLimit(() => getJson(url));
      return (j.items || []).map((i) => ({ day: i.timestamp.slice(0, 8), views: i.views }));
    } catch {
      return [];
    }
  });
}

function scoreFrom(series, ceiling) {
  const views = series.map((s) => s.views);
  const last7 = views.slice(-7).reduce((a, b) => a + b, 0);
  const prev7 = views.slice(-14, -7).reduce((a, b) => a + b, 0);
  const growth = prev7 ? (last7 - prev7) / prev7 : 0;
  const trend = clamp(Math.round((100 * Math.log10(last7 + 1)) / Math.log10(ceiling)), 1, 99);
  const engagement = clamp(Math.round(70 + 29 * Math.tanh(growth * 1.5)), 1, 99);
  const score = Math.round(trend * 0.65 + engagement * 0.35) / 10;
  return { trend, engagement, score: Number(score.toFixed(1)), weeklyViews: last7, growthPct: Math.round(growth * 100) };
}

const norm = (t) => t.replace(/ /g, '_').toLowerCase();

/** Canonical Wikipedia page title → industry, for every curated headliner (so no star appears twice). */
function curatedHome() {
  return cached('curatedHome', 24 * H, async () => {
    const all = INDUSTRY_IDS.flatMap((id) => INDUSTRIES[id].stars.map((s) => [s[1], id]));
    const prof = await wikiProfiles(all.map((x) => x[0]));
    return new Map(all.filter(([t]) => prof[t]).map(([t, id]) => [prof[t].title, id]));
  });
}

/** Curated headliners + everyone Wikipedia readers are trending on right now for this industry. */
export async function roster(id) {
  const ind = INDUSTRIES[id];
  const list = ind.stars.map(([name, title, newsQuery]) => ({ name, title, newsQuery, discovered: false }));
  let found = [];
  try {
    const timeout = new Promise((r) => setTimeout(() => r(null), 6000));
    const d = await Promise.race([discoveredStars(), timeout]); // keeps running in the background if slow
    found = d?.[id] || [];
  } catch (e) { console.warn('discovery failed:', e.message); }
  const seen = new Set(list.map((s) => norm(s.title)));
  for (const d of found.slice(0, 30)) {
    if (seen.has(norm(d.title))) continue;
    seen.add(norm(d.title));
    list.push({ name: d.name, title: d.title, newsQuery: d.qualified ? `${d.name} actor` : d.name, discovered: true });
  }
  return list;
}

export async function industryProfiles(id, titles) {
  const ind = INDUSTRIES[id];
  return cached(`profiles:${id}:${titles.join('|')}`, 12 * H, () => wikiProfiles(titles, ind.lang));
}

/** Ranked stars for an industry. scope: 'india' (regional-language Wikipedia readers) | 'global' (English Wikipedia). */
export async function industryStars(id, scope = 'global') {
  return cached(`stars:${id}:${scope}`, 2 * H, async () => {
    const ind = INDUSTRIES[id];
    const list = await roster(id);
    const profiles = await industryProfiles(id, list.map((x) => x.title));
    const seenPages = new Set();
    const rows = await Promise.all(
      list.map(async ({ name, title, newsQuery, discovered }) => {
        const p = profiles[title];
        if (!p || seenPages.has(p.title)) return null;
        seenPages.add(p.title);
        if (discovered) {
          if (!p.image) return null; // only people with a real photo
          if (!/actor|actress|film|director|singer|filmmaker/i.test(p.description)) return null; // film people only
          if ((await curatedHome()).get(p.title)) return null; // already headlining an industry
        }
        const useRegional = scope === 'india' && p.regionalTitle;
        const project = useRegional ? `${ind.lang}.wikipedia` : 'en.wikipedia';
        const series = await pageviews(project, useRegional ? p.regionalTitle : p.title);
        const s = scoreFrom(series, useRegional ? 10_000 : 1_000_000);
        return {
          id: title, name, fullName: p.title.replace(/ \(.*\)$/, ''), industry: id, industryLabel: ind.label,
          role: rolesFrom(`${p.description}. ${p.extract}`), description: p.description, bio: p.extract,
          image: p.image, imageOriginal: p.imageOriginal, wikiUrl: p.wikiUrl, qid: p.qid,
          portrait: (await tmdbPortrait(p.title.replace(/ (.*)$/, ''))) || null,
          newsQuery: newsQuery || name, discovered, source: project, series, ...s,
        };
      }),
    );
    return rows.filter(Boolean).sort((a, b) => b.score - a.score || b.weeklyViews - a.weeklyViews).map((r, i) => ({ ...r, rank: i + 1 }));
  });
}

export async function allStars(scope = 'global') {
  const lists = await Promise.all(INDUSTRY_IDS.map((id) => industryStars(id, scope)));
  return lists.flat().sort((a, b) => b.score - a.score || b.weeklyViews - a.weeklyViews).map((r, i) => ({ ...r, rank: i + 1 }));
}

export async function findStar(id) {
  for (const ind of INDUSTRY_IDS) {
    const s = (await industryStars(ind, 'global')).find((x) => x.id === id);
    if (s) return s;
  }
  return null;
}

/** Current & upcoming films from Wikidata, enriched with Wikipedia posters/descriptions, ordered by global coverage. */
export async function movies(id) {
  return cached(`movies:${id}`, 6 * H, async () => {
    const ind = INDUSTRIES[id];
    const from = new Date(Date.now() - 365 * 86400_000).toISOString().slice(0, 10);
    const to = new Date(Date.now() + 240 * 86400_000).toISOString().slice(0, 10);
    const country = ind.wdCountry ? `?film wdt:P495 wd:${ind.wdCountry}.` : '';
    const sparql = `SELECT ?film ?filmLabel (MIN(?date) AS ?release) ?article ?links WHERE {
      ?film wdt:P31 wd:Q11424; wdt:P364 wd:${ind.wdLang}; wdt:P577 ?date; wikibase:sitelinks ?links. ${country}
      FILTER(?date >= "${from}T00:00:00Z"^^xsd:dateTime && ?date <= "${to}T00:00:00Z"^^xsd:dateTime)
      ?article schema:about ?film; schema:isPartOf <https://en.wikipedia.org/>.
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    } GROUP BY ?film ?filmLabel ?article ?links ORDER BY DESC(?links) LIMIT 30`;
    const j = await getJson(`https://query.wikidata.org/sparql?query=${encodeURIComponent(sparql)}`, { Accept: 'application/sparql-results+json' });
    const rows = j.results.bindings.map((b) => ({
      wikidata: b.film.value.split('/').pop(),
      title: b.filmLabel.value,
      release: b.release.value.slice(0, 10),
      wikiTitle: decodeURIComponent(b.article.value.split('/wiki/')[1]),
      links: Number(b.links.value),
    }));
    const seen = new Set();
    const unique = rows.filter((r) => !seen.has(r.wikidata) && seen.add(r.wikidata));
    const prof = await wikiProfiles(unique.map((r) => r.wikiTitle));
    const today = new Date().toISOString().slice(0, 10);
    return unique.map((r) => {
      const p = prof[r.wikiTitle] || {};
      return {
        ...r, industry: id, industryLabel: ind.label, language: ind.language,
        poster: p.image || null, description: p.description || '', synopsis: p.extract || '',
        wikiUrl: p.wikiUrl, status: r.release > today ? 'Upcoming' : 'Released',
      };
    });
  });
}

/** Free-text search across Wikipedia (people/films) with photos. */
export async function searchWiki(q) {
  return cached(`search:${q.toLowerCase()}`, 2 * H, async () => {
    const params = new URLSearchParams({
      action: 'query', format: 'json', formatversion: '2', generator: 'search', gsrsearch: q, gsrlimit: '8',
      prop: 'pageimages|description', piprop: 'thumbnail', pithumbsize: '200', pilicense: 'any',
    });
    const j = await getJson(`https://en.wikipedia.org/w/api.php?${params}`);
    return (j.query?.pages || [])
      .sort((a, b) => a.index - b.index)
      .map((p) => ({ id: p.title.replace(/ /g, '_'), name: p.title, description: p.description || '', image: cleanImg(p.thumbnail?.source) }));
  });
}
