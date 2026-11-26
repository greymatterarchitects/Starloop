// Real facts about a star from Wikidata: filmography with release dates, birth date, birthplace.
// Used for release countdowns and the daily fan quiz.
import crypto from 'node:crypto';
import { cached, limiter } from './util.js';
import { wikiProfiles, movies } from './wiki.js';

const H = 3600_000;
const UA = { 'User-Agent': 'StarLoop/1.0 (local development app)' };
const lim = limiter(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function sparql(q) {
  for (let i = 0; i < 3; i++) {
    const r = await lim(() => fetch('https://query.wikidata.org/sparql', {
      method: 'POST',
      headers: { ...UA, Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `query=${encodeURIComponent(q)}`,
      signal: AbortSignal.timeout(40000),
    }));
    if (r.ok) return (await r.json()).results.bindings;
    await sleep(Number(r.headers.get('retry-after')) * 1000 || 3000 * (i + 1));
  }
  throw new Error('Wikidata busy, try again shortly');
}

export async function starFacts(star) {
  if (!star?.qid) return { films: [], birth: null, birthplace: null };
  return cached(`facts:${star.qid}`, 12 * H, async () => {
    const [filmRows, bio] = await Promise.all([
      sparql(`SELECT ?film ?filmLabel (MIN(?d) AS ?date) ?article WHERE {
        ?film wdt:P161 wd:${star.qid}; wdt:P31 wd:Q11424. OPTIONAL { ?film wdt:P577 ?d }
        OPTIONAL { ?article schema:about ?film; schema:isPartOf <https://en.wikipedia.org/> }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } GROUP BY ?film ?filmLabel ?article`),
      sparql(`SELECT ?b ?placeLabel WHERE { OPTIONAL { wd:${star.qid} wdt:P569 ?b } OPTIONAL { wd:${star.qid} wdt:P19 ?place }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } LIMIT 1`),
    ]);
    const films = filmRows
      .map((b) => ({
        qid: b.film.value.split('/').pop(),
        title: b.filmLabel.value,
        date: b.date?.value?.slice(0, 10) || null,
        wikiTitle: b.article ? decodeURIComponent(b.article.value.split('/wiki/')[1]) : null,
      }))
      .filter((f) => !/^Q\d+$/.test(f.title))
      .sort((a, b) => (b.date || '9999').localeCompare(a.date || '9999'));
    return {
      films,
      birth: bio[0]?.b?.value?.slice(0, 10) || null,
      birthplace: bio[0]?.placeLabel?.value && !/^Q\d+$/.test(bio[0].placeLabel.value) ? bio[0].placeLabel.value : null,
    };
  });
}

/** Next upcoming film (or the latest release within 60 days), with poster. */
export async function nextRelease(star) {
  const { films } = await starFacts(star);
  const today = new Date().toISOString().slice(0, 10);
  const recent = new Date(Date.now() - 60 * 86400_000).toISOString().slice(0, 10);
  const dated = films.filter((f) => f.date && f.date.length === 10 && !f.date.endsWith('-01-01'));
  const upcoming = dated.filter((f) => f.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  // Films with no date only count if Wikipedia itself calls them upcoming.
  const undated = films.filter((f) => !f.date && f.wikiTitle).slice(0, 15);
  const prof = await wikiProfiles([...new Set([...upcoming, ...undated].map((f) => f.wikiTitle).filter(Boolean))]).catch(() => ({}));
  const isFilmPage = (f) => { const d = prof[f.wikiTitle]?.description || ''; return /film/i.test(d) && !/born|filmmaker|actor|actress/i.test(d); };
  const announced = undated.filter((f) => isFilmPage(f) && /upcoming|unreleased|forthcoming/i.test(`${prof[f.wikiTitle].description} ${prof[f.wikiTitle].extract}`));
  const pick = upcoming[0] || announced[0] || dated.filter((f) => f.date >= recent).sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!pick) return null;
  let p = pick.wikiTitle ? prof[pick.wikiTitle] : null;
  if (pick.wikiTitle && !p) p = (await wikiProfiles([pick.wikiTitle]).catch(() => ({})))[pick.wikiTitle];
  const ok = p && isFilmPage({ wikiTitle: pick.wikiTitle }) ;
  return { ...pick, poster: ok ? p.image || null : null, description: ok ? p.description : '', upcoming: !pick.date || pick.date >= today };
}

/* ---------- Daily quiz (deterministic per star per day; answers stay on the server) ---------- */
const CITIES = ['Chennai', 'Hyderabad', 'Mumbai', 'Bengaluru', 'Kochi', 'Delhi', 'Kolkata', 'Visakhapatnam', 'Mysuru', 'Thiruvananthapuram', 'Madurai', 'Pune', 'Los Angeles', 'New York City', 'London', 'Sydney', 'Toronto', 'Chicago'];

function rng(seed) {
  let h = crypto.createHash('sha256').update(seed).digest().readUInt32LE(0);
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 1e6) / 1e6; };
}
const shuffle = (arr, r) => arr.map((v) => [r(), v]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
const pickN = (arr, n, r) => shuffle(arr, r).slice(0, n);

export async function dailyQuiz(star, day = new Date().toISOString().slice(0, 10)) {
  return cached(`quiz:${star.id}:${day}`, 26 * H, async () => {
    const r = rng(`${star.id}|${day}`);
    const facts = await starFacts(star);
    const name = star.name;
    const qs = [];
    const add = (q, correct, wrong) => {
      const opts = shuffle([correct, ...wrong.filter((w) => w !== correct).slice(0, 3)], r);
      if (opts.length >= 3) qs.push({ q, options: opts.map(String), answer: opts.indexOf(correct) });
    };
    if (facts.birth) {
      const y = Number(facts.birth.slice(0, 4));
      add(`In which year was ${name} born?`, y, shuffle([y - 3, y - 1, y + 2, y + 4, y - 5], r));
    }
    if (facts.birthplace) add(`Where was ${name} born?`, facts.birthplace, pickN(CITIES.filter((c) => !facts.birthplace.includes(c)), 3, r));
    const own = facts.films.filter((f) => f.date);
    let industryTitles = [];
    try { industryTitles = (await movies(star.industry)).map((m) => m.title); } catch {}
    const ownTitles = new Set(facts.films.map((f) => f.title));
    const others = industryTitles.filter((t) => !ownTitles.has(t) && !/^Q\d+$/.test(t));
    if (own.length && others.length >= 3) {
      const f = pickN(own, 1, r)[0];
      add(`Which of these films features ${name}?`, f.title, pickN(others, 3, r));
    }
    const yearly = own.filter((f) => f.date < new Date().toISOString().slice(0, 10));
    for (const f of pickN(yearly, 2, r)) {
      const y = Number(f.date.slice(0, 4));
      add(`${name}'s film “${f.title}” released in which year?`, y, shuffle([y - 2, y - 1, y + 1, y + 2], r));
    }
    if (own.length >= 4) {
      const latest = own[0];
      add(`Which is ${name}'s most recent or upcoming film?`, latest.title, pickN(own.slice(2).map((f) => f.title), 3, r));
    }
    return { day, starId: star.id, questions: shuffle(qs, r).slice(0, 5) };
  });
}
