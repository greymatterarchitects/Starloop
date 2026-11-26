import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLUBS, INDUSTRIES, INDUSTRY_IDS, industryTag } from './industries.js';
import { allStars, findStar, industryStars, movies, searchWiki } from './wiki.js';
import { news } from './news.js';
import { fanRouter, readImage, UPLOADS } from './fans.js';
import { redis, storageKind } from './storage.js';
import { OUTLETS, outletItems } from './outlets.js';
import { discoveredStars } from './discover.js';

const app = express();
// Fan profiles, clubs, posts (larger body limit for photo uploads) – mounted before the default JSON parser.
app.use('/api/fans', fanRouter);
app.use('/uploads', express.static(UPLOADS, { maxAge: '7d' }));
app.get('/uploads/:name', async (req, res) => {
  const img = await readImage(req.params.name).catch(() => null);
  if (!img) return res.status(404).end();
  res.type(req.params.name.split('.').pop()).set('Cache-Control', 'public, max-age=604800, immutable').send(img);
});
app.use(express.json({ limit: '20kb' }));
const PORT = process.env.API_PORT || process.env.PORT || 5050;

const wrap = (fn) => async (req, res) => {
  try {
    res.json(await fn(req, res));
  } catch (e) {
    console.error(req.path, e.message);
    res.status(502).json({ error: 'Live source unavailable, please retry', detail: e.message });
  }
};
const validIndustry = (x) => (INDUSTRY_IDS.includes(x) ? x : null);
const scopeOf = (x) => (x === 'india' ? 'india' : 'global');
const starsFor = (industry, scope) => (validIndustry(industry) ? industryStars(industry, scope) : allStars(scope));

// Health: which fan-data storage is active and whether it responds (no data returned).
app.get('/api/health', async (req, res) => {
  const out = { ok: true, storage: storageKind, platform: process.env.VERCEL ? 'vercel' : 'local' };
  if (redis) {
    const t = Date.now();
    try { await redis.get('starloop:ver'); out.redis = { reachable: true, ms: Date.now() - t }; }
    catch (e) { out.ok = false; out.redis = { reachable: false, error: e.message }; }
  }
  res.json(out);
});

app.get('/api/industries', (req, res) =>
  res.json(INDUSTRY_IDS.map((id) => ({ id, label: INDUSTRIES[id].label, language: INDUSTRIES[id].language }))),
);

// Ranked stars – scores computed from live Wikimedia pageview data.
app.get('/api/stars', wrap(async (req) => {
  const list = await starsFor(req.query.industry, scopeOf(req.query.scope));
  return { updatedAt: new Date().toISOString(), stars: list.slice(0, Number(req.query.limit) || 50) };
}));

app.get('/api/stars/:id', wrap(async (req) => {
  const s = await findStar(req.params.id);
  if (!s) throw new Error('Unknown star');
  return s;
}));

// Where the data comes from, with live counts.
app.get('/api/sources', wrap(async () => {
  const [items, disc] = await Promise.all([outletItems(), discoveredStars().catch(() => ({}))]);
  const perOutlet = Object.fromEntries(OUTLETS.map(([n]) => [n, 0]));
  items.forEach((i) => { perOutlet[i.source] = (perOutlet[i.source] || 0) + 1; });
  const aggregated = new Set(items.map((i) => i.source));
  return {
    wikipedias: ['English', 'Hindi', 'Telugu', 'Tamil', 'Kannada', 'Malayalam'],
    discoveredStars: Object.fromEntries(Object.entries(disc).map(([k, v]) => [k, v.length])),
    outlets: perOutlet,
    outletArticles: items.length,
    aggregators: ['Bing News (hundreds of publishers)', 'Google News (hundreds of publishers)'],
    structured: ['Wikidata', 'Wikimedia Pageviews', 'Wikimedia Top Articles'],
    publishersSeen: aggregated.size,
  };
}));

// Live headlines for any query (used by stories).
app.get('/api/news', wrap(async (req) => {
  const q = String(req.query.q || '').slice(0, 120);
  if (!q) return [];
  return news(q, Math.min(Number(req.query.limit) || 12, 30), String(req.query.name || '').slice(0, 80) || null);
}));

// Home feed / For You: latest headlines about the currently trending stars.
app.get('/api/feed', wrap(async (req) => {
  const stars = (await starsFor(req.query.industry, 'global')).slice(0, Number(req.query.stars) || 6);
  const per = await Promise.all(stars.map(async (s) => {
    const items = await news(s.newsQuery, 12, s.fullName);
    const best = [...items.filter((n) => n.image), ...items.filter((n) => !n.image)].slice(0, 3);
    return best.map((n) => ({ ...n, star: pickStar(s) }));
  }));
  const seen = new Set();
  return per
    .flat()
    .filter((n) => !seen.has(n.url) && seen.add(n.url))
    .sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''));
}));

const pickStar = (s) => ({ id: s.id, name: s.name, fullName: s.fullName, image: s.image, industry: s.industry, role: s.role });

// Hot Now clubs – each club is a live news channel; cover = latest real photo.
app.get('/api/clubs', wrap(async (req) => {
  const tag = industryTag(validIndustry(req.query.industry));
  return Promise.all(CLUBS.map(async (c) => {
    const items = await news(c.query(tag), 12);
    let cover = items.find((i) => i.image)?.image;
    if (!cover) cover = (await news(`${tag} film ${c.title}`, 12)).find((i) => i.image)?.image;
    if (!cover) cover = (await news(`${tag} cinema`, 12)).find((i) => i.image)?.image || null;
    return { key: c.key, title: c.title, cover, count: items.length, latest: items[0] || null };
  }));
}));

app.get('/api/clubs/:key', wrap(async (req) => {
  const c = CLUBS.find((x) => x.key === req.params.key);
  if (!c) throw new Error('Unknown club');
  const tag = industryTag(validIndustry(req.query.industry));
  return { key: c.key, title: c.title, items: await news(c.query(tag), 20) };
}));

app.get('/api/movies', wrap(async (req) => {
  const ids = validIndustry(req.query.industry) ? [req.query.industry] : INDUSTRY_IDS;
  const lists = await Promise.allSettled(ids.map((id) => movies(id)));
  return lists.flatMap((l) => (l.status === 'fulfilled' ? l.value : [])).sort((a, b) => b.links - a.links);
}));

app.get('/api/search', wrap(async (req) => {
  const q = String(req.query.q || '').trim().slice(0, 80);
  if (q.length < 2) return [];
  const local = (await allStars('global')).filter((s) => `${s.name} ${s.fullName}`.toLowerCase().includes(q.toLowerCase())).map((s) => ({ ...pickStar(s), description: s.description, kind: 'star' }));
  let wiki = [];
  try { wiki = (await searchWiki(q)).filter((w) => !local.some((l) => l.fullName === w.name)).map((w) => ({ ...w, kind: 'wiki', newsQuery: w.name })); } catch {}
  return [...local, ...wiki].slice(0, 10);
}));

// ---- Fan chat: real-time rooms over Server-Sent Events (messages live in server memory). ----
const rooms = new Map();
const room = (id) => {
  if (!rooms.has(id)) rooms.set(id, { messages: [], clients: new Set() });
  return rooms.get(id);
};
const roomId = (x) => String(x).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);

app.get('/api/chat/rooms', (req, res) =>
  res.json(['all', ...INDUSTRY_IDS].map((id) => {
    const r = room(id);
    return { id, label: id === 'all' ? 'StarLoop Lounge' : `${INDUSTRIES[id].label} Fans`, online: r.clients.size, messages: r.messages.length, last: r.messages.at(-1) || null };
  })),
);

app.get('/api/chat/:room/stream', (req, res) => {
  const r = room(roomId(req.params.room));
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  res.write(`event: init\ndata: ${JSON.stringify(r.messages.slice(-100))}\n\n`);
  r.clients.add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => { clearInterval(ping); r.clients.delete(res); });
});

app.post('/api/chat/:room', (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 30);
  const text = String(req.body?.text || '').trim().slice(0, 500);
  if (!name || !text) return res.status(400).json({ error: 'name and text required' });
  const r = room(roomId(req.params.room));
  const msg = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, text, at: new Date().toISOString() };
  r.messages.push(msg);
  if (r.messages.length > 500) r.messages.shift();
  for (const c of r.clients) c.write(`event: message\ndata: ${JSON.stringify(msg)}\n\n`);
  res.json(msg);
});

// Production: serve the built React app.
const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

export default app;

// Locally (not on Vercel) run a normal long-lived server.
if (!process.env.VERCEL) app.listen(PORT, () => {
  console.log(`StarLoop API on http://localhost:${PORT}`);
  // Warm the caches so the first page load is fast.
  outletItems().catch(() => {});
  Promise.allSettled(INDUSTRY_IDS.map((id) => industryStars(id, 'global'))).then(() => console.log('Live star data warmed'));
});
