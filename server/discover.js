// Auto-discovers the film celebrities people are actually reading about right now.
// Source: Wikimedia "most viewed articles" for the last 3 days on 6 Wikipedias (English, Hindi,
// Telugu, Tamil, Kannada, Malayalam), filtered through Wikidata to real people with film occupations.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cached, chunk, getJson, limiter } from './util.js';

const CACHE_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'cache', 'discovered.json');

const H = 3600_000;
const UA = { 'User-Agent': 'StarLoop/1.0 (local development app)' };
const lim = limiter(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function sparql(q) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch('https://query.wikidata.org/sparql', {
      method: 'POST',
      headers: { ...UA, Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `query=${encodeURIComponent(q)}`,
      signal: AbortSignal.timeout(45000),
    });
    if (r.ok) return r.json();
    await sleep(Number(r.headers.get('retry-after')) * 1000 || 4000 * (attempt + 1));
  }
  throw new Error('Wikidata busy');
}

const PROJECTS = { en: null, hi: 'bollywood', te: 'tollywood', ta: 'kollywood', kn: 'sandalwood', ml: 'mollywood' };
const LANG_TO_IND = { Q8097: 'tollywood', Q5885: 'kollywood', Q33673: 'sandalwood', Q36236: 'mollywood', Q1568: 'bollywood' };
const INDIA = 'Q668';
// actor, film actor, television actor, film director, playback singer, voice actor
const OCCUPATIONS = ['Q33999', 'Q10800557', 'Q10798782', 'Q2526255', 'Q2643890', 'Q2405480'];

async function topArticles(project, daysAgo) {
  const d = new Date(Date.now() - daysAgo * 86400_000).toISOString().slice(0, 10).split('-');
  try {
    const j = await lim(() => getJson(`https://wikimedia.org/api/rest_v1/metrics/pageviews/top/${project}.wikipedia/all-access/${d[0]}/${d[1]}/${d[2]}`));
    return j.items?.[0]?.articles || [];
  } catch {
    return [];
  }
}

async function classify(project, articles) {
  const out = [];
  for (const group of chunk(articles, 150)) {
    const vals = group.map((a) => `<https://${project}.wikipedia.org/wiki/${encodeURIComponent(a.article).replace(/%2F/g, '/')}>`).join(' ');
    const q = `SELECT ?a ?p ?en (GROUP_CONCAT(DISTINCT ?c;separator=",") AS ?cs) (GROUP_CONCAT(DISTINCT ?l;separator=",") AS ?ls) WHERE {
      VALUES ?a { ${vals} } ?a schema:about ?p. ?p wdt:P31 wd:Q5; wdt:P106 ?o. VALUES ?o { ${OCCUPATIONS.map((o) => `wd:${o}`).join(' ')} }
      FILTER NOT EXISTS { ?p wdt:P570 ?died }
      OPTIONAL { ?p wdt:P27 ?c } OPTIONAL { ?p wdt:P1412 ?l }
      ?en schema:about ?p; schema:isPartOf <https://en.wikipedia.org/>.
    } GROUP BY ?a ?p ?en`;
    try {
      const r = await lim(() => sparql(q));
      for (const b of r.results.bindings) {
        out.push({
          qid: b.p.value.split('/').pop(),
          local: decodeURIComponent(b.a.value.split('/wiki/')[1]),
          enTitle: decodeURIComponent(b.en.value.split('/wiki/')[1]),
          countries: b.cs.value.split(',').filter(Boolean).map((x) => x.split('/').pop()),
          langs: b.ls.value.split(',').filter(Boolean).map((x) => x.split('/').pop()),
        });
      }
    } catch (e) {
      console.warn('wikidata classify failed:', e.message);
    }
  }
  return out;
}

function industryFor(project, person) {
  if (PROJECTS[project]) return PROJECTS[project];
  if (!person.countries.includes(INDIA)) return person.countries.length ? 'hollywood' : null;
  for (const l of person.langs) if (LANG_TO_IND[l] && l !== 'Q1568') return LANG_TO_IND[l];
  return 'bollywood';
}

/** { industryId: [{ title, name, views }] } – people trending on Wikipedia over the last 3 days. */
export async function discoveredStars() {
  return cached('discovered', 6 * H, async () => {
    try {
      const disk = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      if (Date.now() - disk.at < 6 * H) return disk.data;
    } catch {}
    const people = new Map();
    await Promise.all(Object.keys(PROJECTS).map(async (project) => {
      const days = await Promise.all([1, 2, 3].map((d) => topArticles(project, d)));
      const views = new Map();
      days.flat().forEach((a) => {
        if (/^(Special|Wikipedia|Main_Page|File|Portal|Help|Category|विशेष|ప్రత్యేక|சிறப்பு|ವಿಶೇಷ|പ്രത്യേകം)/.test(a.article)) return;
        views.set(a.article, (views.get(a.article) || 0) + a.views);
      });
      const top = [...views].sort((a, b) => b[1] - a[1]).slice(0, 600).map(([article, v]) => ({ article, views: v }));
      const found = await classify(project, top);
      for (const p of found) {
        const ind = industryFor(project, p);
        if (!ind) continue;
        const v = views.get(p.local) || 0;
        const cur = people.get(p.qid) || { title: p.enTitle, votes: {}, views: 0 };
        cur.votes[ind] = (cur.votes[ind] || 0) + v;
        cur.views += v;
        people.set(p.qid, cur);
      }
    }));
    const byInd = {};
    for (const p of people.values()) {
      const ind = Object.entries(p.votes).sort((a, b) => b[1] - a[1])[0][0];
      const name = p.title.replace(/_/g, ' ').replace(/ \(.*\)$/, '');
      (byInd[ind] ||= []).push({ title: p.title, name, qualified: /\(/.test(p.title), views: p.views });
    }
    for (const k of Object.keys(byInd)) byInd[k].sort((a, b) => b.views - a.views);
    console.log('Discovered trending celebrities:', Object.fromEntries(Object.entries(byInd).map(([k, v]) => [k, v.length])));
    if (Object.keys(byInd).length) {
      fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
      fs.writeFileSync(CACHE_FILE, JSON.stringify({ at: Date.now(), data: byInd }));
    }
    return byInd;
  });
}
