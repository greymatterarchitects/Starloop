// Fan accounts (email + password), celebrity clubs, posts & goal campaigns, comments, shares,
// release check-ins, daily quizzes, badges and notifications. Persisted to server/.data/db.json.
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DATA_DIR } from './paths.js';
import { redis, storageKind } from './storage.js';
import { findStar, industryStars, allStars } from './wiki.js';
import { news } from './news.js';
import { dailyQuiz, nextRelease } from './facts.js';

const DIR = DATA_DIR;
const FILE = path.join(DIR, 'db.json');
export const UPLOADS = path.join(DIR, 'uploads');
fs.mkdirSync(UPLOADS, { recursive: true });

const empty = () => ({ users: {}, sessions: {}, clubs: {}, starFollows: {}, fanFollows: {}, posts: [], checkins: {}, quiz: {}, notifications: [], bestRank: {}, battles: {}, dms: {}, dmRead: {} });
let db = empty();
if (!redis) { try { db = { ...empty(), ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; } catch { db = empty(); } }
console.log(`Fan data storage: ${storageKind}`);

/* Redis mode: the whole fan database is one JSON document plus a version stamp.
   Every request reloads it if another server instance changed it, and writes it back before responding. */
const DB_KEY = 'starloop:db', VER_KEY = 'starloop:ver';
let loadedVer = null, dirty = false;
export async function ensureFresh() {
  if (!redis) return;
  const ver = await redis.get(VER_KEY);
  if (ver !== null && String(ver) === String(loadedVer)) return;
  const doc = ver === null ? null : await redis.get(DB_KEY);
  db = { ...empty(), ...(typeof doc === 'string' ? JSON.parse(doc) : doc || {}) };
  loadedVer = ver;
}
export async function flush() {
  if (!redis || !dirty) return;
  dirty = false;
  const ver = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  await redis.mset({ [DB_KEY]: JSON.stringify(db), [VER_KEY]: ver });
  loadedVer = ver;
}
// Local mode: write-through on every change (atomic rename). Redis mode: mark dirty; flush() persists.
const save = () => {
  if (redis) { dirty = true; return; }
  fs.writeFileSync(`${FILE}.tmp`, JSON.stringify(db));
  fs.renameSync(`${FILE}.tmp`, FILE);
};

const POINTS = { post: 5, campaign: 8, comment: 2, share: 1, like: 1, join: 1, backed: 3, going: 1, watched: 2, quiz: 2 };
const newId = () => crypto.randomBytes(8).toString('hex');
const clean = (s, n) => String(s ?? '').trim().slice(0, n);
const starKey = (s) => clean(s, 200);
const now = () => new Date().toISOString();
const err = (msg, status = 400) => Object.assign(new Error(msg), { status });
const need = (cond, msg, status = 400) => { if (!cond) throw err(msg, status); };

/* ---------- passwords & sessions ---------- */
const hashPassword = (pw, salt = crypto.randomBytes(16).toString('hex')) => `${salt}:${crypto.scryptSync(pw, salt, 64).toString('hex')}`;
function checkPassword(pw, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const a = Buffer.from(hash, 'hex'), b = crypto.scryptSync(pw, salt, 64);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function newSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.sessions[crypto.createHash('sha256').update(token).digest('hex')] = { userId, at: now() };
  return token;
}
function userFromReq(req) {
  const m = /^Bearer ([a-f0-9]{64})$/.exec(req.get('authorization') || '');
  if (!m) return null;
  const s = db.sessions[crypto.createHash('sha256').update(m[1]).digest('hex')];
  return s && db.users[s.userId] ? s.userId : null;
}

function publicUser(u) {
  if (!u) return null;
  return { id: u.id, name: u.name, handle: u.handle, bio: u.bio, avatar: u.avatar, createdAt: u.createdAt };
}

const pendingImages = [];
/** Serve an uploaded image stored in Redis (used by /uploads when the file isn't on disk). */
export async function readImage(name) {
  if (!redis || !/^[a-f0-9]{16}.(jpg|png|webp|gif)$/.test(name)) return null;
  const b64 = await redis.get(`starloop:img:${name}`);
  return b64 ? Buffer.from(String(b64), 'base64') : null;
}
async function flushImages() {
  while (pendingImages.length) { const [k, v] = pendingImages.shift(); await redis.set(k, v); }
}

function saveImage(dataUrl) {
  if (!dataUrl) return null;
  const m = /^data:image\/(png|jpe?g|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  need(m, 'Image must be a PNG, JPEG, WebP or GIF');
  const buf = Buffer.from(m[2], 'base64');
  need(buf.length <= 3 * 1024 * 1024, 'Image too large (max 3 MB)');
  const name = `${newId()}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
  if (redis) {
    need(buf.length <= 700 * 1024, 'Image too large for cloud storage (max 700 KB after resizing)');
    pendingImages.push([`starloop:img:${name}`, m[2]]);
  } else fs.writeFileSync(path.join(UPLOADS, name), buf);
  return `/uploads/${name}`;
}

/* ---------- notifications ---------- */
function notify(userId, type, text, link, actorId) {
  if (!userId || userId === actorId || !db.users[userId]) return;
  db.notifications.push({ id: newId(), userId, type, text, link, actorId: actorId || null, at: now(), read: false });
  if (db.notifications.length > 5000) db.notifications.splice(0, db.notifications.length - 5000);
}

/* ---------- engagement & ranking ---------- */
function fanScores(star) {
  const scores = new Map();
  const add = (uid, kind, n = 1) => {
    if (!db.users[uid]) return;
    const s = scores.get(uid) || { points: 0, posts: 0, campaigns: 0, comments: 0, shares: 0, likes: 0, backed: 0, checkins: 0, quiz: 0, joined: false };
    s.points += POINTS[kind] * n;
    if (kind === 'post') s.posts += n;
    else if (kind === 'campaign') s.campaigns += n;
    else if (kind === 'comment') s.comments += n;
    else if (kind === 'share') s.shares += n;
    else if (kind === 'like') s.likes += n;
    else if (kind === 'backed') s.backed += n;
    else if (kind === 'going' || kind === 'watched') s.checkins += 1;
    else if (kind === 'quiz') s.quiz += n;
    else if (kind === 'join') s.joined = true;
    scores.set(uid, s);
  };
  (db.clubs[star]?.members || []).forEach((uid) => add(uid, 'join'));
  for (const p of db.posts.filter((x) => x.starId === star)) {
    add(p.userId, p.kind === 'campaign' ? 'campaign' : 'post');
    (p.artVotes || []).forEach((uid) => add(uid, 'like'));
    p.comments.forEach((c) => add(c.userId, 'comment'));
    Object.entries(p.shares).forEach(([uid, n]) => add(uid, 'share', Math.min(n, 3)));
    p.likes.forEach((uid) => add(uid, 'like'));
    (p.backers || []).forEach((uid) => add(uid, 'backed'));
  }
  for (const c of Object.values(db.checkins).filter((x) => x.starId === star)) {
    Object.entries(c.fans).forEach(([uid, f]) => add(uid, f.status));
  }
  Object.entries(db.quiz[star] || {}).forEach(([uid, days]) => Object.values(days).forEach((d) => add(uid, 'quiz', d.correct)));
  return [...scores].map(([uid, s]) => ({ user: publicUser(db.users[uid]), ...s })).sort((a, b) => b.points - a.points);
}

/** After any engagement, tell fans who climbed to a new best rank (top 10) in that club. */
function rankAlerts(star, starName) {
  fanScores(star).slice(0, 10).forEach((f, i) => {
    const key = `${star}|${f.user.id}`;
    const best = db.bestRank[key];
    if (best === undefined || i + 1 < best) {
      db.bestRank[key] = i + 1;
      if (best !== undefined || i === 0) notify(f.user.id, 'rank', `You're now #${i + 1} in ${starName || star}'s Top Fans`, `/star/${encodeURIComponent(star)}`);
    }
  });
}

function badgesFor(uid) {
  const myPosts = db.posts.filter((p) => p.userId === uid);
  const comments = db.posts.reduce((n, p) => n + p.comments.filter((c) => c.userId === uid).length, 0);
  const perfect = Object.values(db.quiz).reduce((n, byUser) => n + Object.values(byUser[uid] || {}).filter((d) => d.correct === d.total && d.total > 0).length, 0);
  const goingEarly = Object.values(db.checkins).some((c) => c.fans[uid]?.status === 'going' || (c.fans[uid]?.status === 'watched' && c.date && c.fans[uid].at.slice(0, 10) <= c.date));
  const ledCampaign = myPosts.some((p) => p.kind === 'campaign' && p.goal && (p.backers || []).length >= p.goal);
  const topFan = Object.keys(db.clubs).some((star) => fanScores(star)[0]?.user?.id === uid);
  const list = [];
  if (myPosts.length) list.push({ id: 'first-post', label: 'First Post', icon: 'pen' });
  if (goingEarly) list.push({ id: 'day-1', label: 'Day-1 Fan', icon: 'ticket' });
  if (ledCampaign) list.push({ id: 'campaign-leader', label: 'Campaign Leader', icon: 'megaphone' });
  if (perfect >= 3) list.push({ id: 'quiz-master', label: 'Quiz Master', icon: 'brain' });
  if (comments >= 10) list.push({ id: 'voice', label: 'Voice of the Club', icon: 'message' });
  if (topFan) list.push({ id: 'top-fan', label: 'Top Fan', icon: 'crown' });
  if (myPosts.some((p) => p.kind === 'art' && isFeaturedArt(p))) list.push({ id: 'featured-artist', label: 'Featured Artist', icon: 'palette' });
  return list;
}

function postView(p, viewer) {
  return {
    id: p.id, starId: p.starId, starName: p.starName, starImage: p.starImage, kind: p.kind, text: p.text, image: p.image, at: p.at,
    artVotes: (p.artVotes || []).length, voted: !!viewer && (p.artVotes || []).includes(viewer),
    goal: p.goal || null, endsAt: p.endsAt || null, backers: (p.backers || []).length, backed: !!viewer && (p.backers || []).includes(viewer),
    user: publicUser(db.users[p.userId]),
    likes: p.likes.length, liked: !!viewer && p.likes.includes(viewer),
    shares: Object.values(p.shares).reduce((a, b) => a + b, 0),
    comments: p.comments.map((c) => ({ ...c, user: publicUser(db.users[c.userId]) })),
  };
}

/* ---------- router ---------- */
export const fanRouter = express.Router();
fanRouter.use(express.json({ limit: '5mb' }));
fanRouter.use(async (req, res, next) => {
  try { await ensureFresh(); } catch (e) { return res.status(503).json({ error: `Storage unavailable: ${e.message}` }); }
  req.uid = userFromReq(req);
  next();
});

const route = (fn) => async (req, res) => {
  try {
    const out = await fn(req, res);
    if (redis) { await flushImages(); await flush(); }
    if (out !== undefined) res.json(out);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
};
const authed = (req) => { need(req.uid, 'Please sign in first', 401); return req.uid; };

// ----- auth -----
fanRouter.post('/auth/signup', route((req) => {
  const email = clean(req.body?.email, 120).toLowerCase(), pw = String(req.body?.password || ''), name = clean(req.body?.name, 30);
  need(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 'Enter a valid email');
  need(!Object.values(db.users).some((u) => u.email === email), 'An account with this email already exists — log in instead', 409);
  need(pw.length >= 8, 'Password must be at least 8 characters');
  need(name.length >= 2, 'Pick a display name (2+ characters)');
  const id = newId();
  db.users[id] = { id, email, pass: hashPassword(pw), name, handle: name.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 18) + id.slice(0, 4), createdAt: now() };
  const token = newSession(id);
  save();
  return { token, user: publicUser(db.users[id]) };
}));

fanRouter.post('/auth/login', route((req) => {
  const email = clean(req.body?.email, 120).toLowerCase(), pw = String(req.body?.password || '');
  const u = Object.values(db.users).find((x) => x.email === email);
  need(u && checkPassword(pw, u.pass), 'Wrong email or password', 401);
  const token = newSession(u.id);
  save();
  return { token, user: publicUser(u) };
}));

fanRouter.post('/auth/logout', route((req) => {
  const m = /^Bearer ([a-f0-9]{64})$/.exec(req.get('authorization') || '');
  if (m) delete db.sessions[crypto.createHash('sha256').update(m[1]).digest('hex')];
  save();
  return { ok: true };
}));

fanRouter.get('/me', route((req) => publicUser(db.users[authed(req)])));

fanRouter.post('/me', route((req) => {
  const u = db.users[authed(req)];
  const { name, bio, avatar } = req.body || {};
  if (name !== undefined) { const n = clean(name, 30); need(n.length >= 2, 'Name too short'); u.name = n; }
  if (bio !== undefined) u.bio = clean(bio, 160);
  if (avatar) u.avatar = saveImage(avatar);
  save();
  return publicUser(u);
}));

// ----- users -----
fanRouter.get('/users/:id', route((req) => {
  const u = db.users[req.params.id];
  need(u, 'Fan not found', 404);
  const viewer = req.uid;
  const posts = db.posts.filter((p) => p.userId === u.id).sort((a, b) => b.at.localeCompare(a.at));
  const clubs = Object.entries(db.clubs).filter(([, c]) => c.members.includes(u.id)).map(([starId, c]) => ({ starId, starName: c.starName, starImage: c.starImage }));
  const followers = Object.values(db.fanFollows).filter((list) => list.includes(u.id)).length;
  const stars = new Set([...Object.keys(db.clubs), ...db.posts.map((p) => p.starId), ...Object.values(db.checkins).map((c) => c.starId), ...Object.keys(db.quiz)]);
  const points = [...stars].map((s) => fanScores(s).find((x) => x.user?.id === u.id)?.points || 0).reduce((a, b) => a + b, 0);
  return {
    ...publicUser(u),
    stats: { posts: posts.length, clubs: clubs.length, followers, following: (db.fanFollows[u.id] || []).length, points },
    badges: badgesFor(u.id),
    following: !!viewer && (db.fanFollows[viewer] || []).includes(u.id),
    clubs,
    posts: posts.map((p) => postView(p, viewer)),
  };
}));

fanRouter.post('/users/:id/follow', route((req) => {
  const by = authed(req), target = req.params.id;
  need(db.users[target] && by !== target, 'Invalid follow');
  const list = (db.fanFollows[by] ||= []);
  const i = list.indexOf(target);
  if (i >= 0) list.splice(i, 1);
  else { list.push(target); notify(target, 'follow', `${db.users[by].name} started following you`, `/fan/${by}`, by); }
  save();
  return { following: i < 0 };
}));

// ----- celebrity clubs -----
fanRouter.get('/club/:starId', route((req) => {
  const star = starKey(req.params.starId), viewer = req.uid;
  const club = db.clubs[star] || { members: [] };
  const followers = db.starFollows[star] || [];
  return {
    starId: star, members: club.members.length, followers: followers.length,
    champion: battleChampion(star), artTop: weeklyArt(star).slice(0, 3).map((p) => postView(p, viewer)),
    joined: !!viewer && club.members.includes(viewer), following: !!viewer && followers.some((f) => (f.id || f) === viewer),
    topFans: fanScores(star).slice(0, 20),
    posts: db.posts.filter((p) => p.starId === star).sort((a, b) => b.at.localeCompare(a.at)).map((p) => postView(p, viewer)),
  };
}));

const starMeta = (body) => ({ starName: clean(body?.starName, 80), starImage: clean(body?.starImage, 500) });

fanRouter.post('/club/:starId/join', route((req) => {
  const by = authed(req), star = starKey(req.params.starId);
  const club = (db.clubs[star] ||= { members: [] });
  Object.assign(club, starMeta(req.body));
  const i = club.members.indexOf(by);
  i >= 0 ? club.members.splice(i, 1) : club.members.push(by);
  rankAlerts(star, club.starName);
  save();
  return { joined: i < 0, members: club.members.length };
}));

fanRouter.post('/club/:starId/follow', route((req) => {
  const by = authed(req), star = starKey(req.params.starId);
  const list = (db.starFollows[star] ||= []);
  const i = list.findIndex((f) => (f.id || f) === by);
  if (i >= 0) list.splice(i, 1);
  else list.push({ id: by, at: now(), ...starMeta(req.body) });
  save();
  return { following: i < 0, followers: list.length };
}));

fanRouter.post('/club/:starId/posts', route((req) => {
  const userId = authed(req), star = starKey(req.params.starId), { text, kind, image, goal, endsAt } = req.body || {};
  const t = clean(text, 1000);
  need(t || image, 'Write something or add a photo');
  if (kind === 'art') need(image, 'Fan art needs a photo or image');
  const isCampaign = kind === 'campaign';
  const g = isCampaign ? Math.round(Number(goal) || 0) : 0;
  if (isCampaign) need(g >= 2 && g <= 1000000, 'Set a goal between 2 and 1,000,000 fans');
  const end = isCampaign && endsAt ? new Date(endsAt) : null;
  if (end) need(!isNaN(end) && end > new Date(), 'End date must be in the future');
  const p = {
    id: newId(), starId: star, ...starMeta(req.body), userId, kind: isCampaign ? 'campaign' : kind === 'art' ? 'art' : 'post', ...(kind === 'art' ? { artVotes: [] } : {}),
    text: t, image: saveImage(image), at: now(), likes: [], shares: {}, comments: [],
    ...(isCampaign ? { goal: g, endsAt: end ? end.toISOString() : null, backers: [userId] } : {}),
  };
  db.posts.push(p);
  rankAlerts(star, p.starName);
  save();
  return postView(p, userId);
}));

const findPost = (id) => { const p = db.posts.find((x) => x.id === id); need(p, 'Post not found', 404); return p; };
const postLink = (p) => `/star/${encodeURIComponent(p.starId)}`;

fanRouter.post('/posts/:id/comments', route((req) => {
  const userId = authed(req), p = findPost(req.params.id), t = clean(req.body?.text, 500);
  need(t, 'Comment is empty');
  p.comments.push({ id: newId(), userId, text: t, at: now() });
  notify(p.userId, 'comment', `${db.users[userId].name} commented: “${t.slice(0, 60)}”`, postLink(p), userId);
  rankAlerts(p.starId, p.starName);
  save();
  return postView(p, userId);
}));

fanRouter.post('/posts/:id/like', route((req) => {
  const by = authed(req), p = findPost(req.params.id);
  const i = p.likes.indexOf(by);
  if (i >= 0) p.likes.splice(i, 1);
  else { p.likes.push(by); notify(p.userId, 'like', `${db.users[by].name} liked your post`, postLink(p), by); }
  rankAlerts(p.starId, p.starName);
  save();
  return postView(p, by);
}));

fanRouter.post('/posts/:id/share', route((req) => {
  const by = authed(req), p = findPost(req.params.id);
  p.shares[by] = (p.shares[by] || 0) + 1;
  if (p.shares[by] === 1) notify(p.userId, 'share', `${db.users[by].name} shared your post`, postLink(p), by);
  rankAlerts(p.starId, p.starName);
  save();
  return postView(p, by);
}));

fanRouter.post('/posts/:id/back', route((req) => {
  const by = authed(req), p = findPost(req.params.id);
  need(p.kind === 'campaign', 'Only campaigns can be joined');
  need(!p.endsAt || new Date(p.endsAt) > new Date(), 'This campaign has ended');
  p.backers ||= [];
  const i = p.backers.indexOf(by);
  if (i >= 0) { need(by !== p.userId, 'You started this campaign'); p.backers.splice(i, 1); }
  else {
    p.backers.push(by);
    notify(p.userId, 'campaign', `${db.users[by].name} joined your campaign (${p.backers.length}/${p.goal})`, postLink(p), by);
    if (p.backers.length === p.goal) p.backers.forEach((u) => notify(u, 'campaign', `Campaign goal reached: ${p.goal} fans for ${p.starName}!`, postLink(p)));
  }
  rankAlerts(p.starId, p.starName);
  save();
  return postView(p, by);
}));

// ----- release countdown & check-ins -----
fanRouter.get('/club/:starId/release', route(async (req) => {
  const star = await findStar(starKey(req.params.starId));
  need(star, 'Unknown star', 404);
  const film = await nextRelease(star);
  if (!film) return { film: null };
  const c = db.checkins[film.qid] || { fans: {} };
  const fans = Object.values(c.fans);
  const ratings = fans.filter((f) => f.rating).map((f) => f.rating);
  const mine = req.uid ? c.fans[req.uid] || null : null;
  return {
    film,
    going: fans.filter((f) => f.status === 'going').length,
    watched: fans.filter((f) => f.status === 'watched').length,
    rating: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null,
    ratings: ratings.length,
    mine,
  };
}));

fanRouter.post('/club/:starId/release/:filmQid', route(async (req) => {
  const uid = authed(req), starId = starKey(req.params.starId), qid = clean(req.params.filmQid, 20);
  const { status, rating } = req.body || {};
  need(['going', 'watched', 'none'].includes(status), 'Invalid status');
  const star = await findStar(starId);
  need(star, 'Unknown star', 404);
  const film = await nextRelease(star);
  need(film && film.qid === qid, 'That film is not the current release for this star');
  if (status === 'watched') need(!film.date || film.date <= new Date().toISOString().slice(0, 10), 'You can rate it once it has released');
  const c = (db.checkins[qid] ||= { starId, title: film.title, date: film.date, fans: {} });
  if (status === 'none') delete c.fans[uid];
  else {
    const r = status === 'watched' && rating ? Math.round(Number(rating)) : null;
    if (r !== null) need(r >= 1 && r <= 5, 'Rating must be 1–5');
    c.fans[uid] = { status, rating: r, at: now() };
  }
  rankAlerts(starId, star.name);
  save();
  return { ok: true };
}));

// ----- daily quiz (answers graded on the server) -----
fanRouter.get('/club/:starId/quiz', route(async (req) => {
  const star = await findStar(starKey(req.params.starId));
  need(star, 'Unknown star', 404);
  const quiz = await dailyQuiz(star);
  const done = req.uid ? db.quiz[star.id]?.[req.uid]?.[quiz.day] || null : null;
  return { day: quiz.day, questions: quiz.questions.map(({ q, options }) => ({ q, options })), done };
}));

fanRouter.post('/club/:starId/quiz', route(async (req) => {
  const uid = authed(req);
  const star = await findStar(starKey(req.params.starId));
  need(star, 'Unknown star', 404);
  const quiz = await dailyQuiz(star);
  const byUser = ((db.quiz[star.id] ||= {})[uid] ||= {});
  need(!byUser[quiz.day], 'You already played today’s quiz — come back tomorrow');
  const answers = Array.isArray(req.body?.answers) ? req.body.answers : [];
  const results = quiz.questions.map((q, i) => ({ correct: q.answer, chosen: Number.isInteger(answers[i]) ? answers[i] : null }));
  const correct = results.filter((r) => r.correct === r.chosen).length;
  byUser[quiz.day] = { correct, total: quiz.questions.length, at: now() };
  rankAlerts(star.id, star.name);
  save();
  return { correct, total: quiz.questions.length, results, points: correct * POINTS.quiz };
}));

// ----- notifications (stored + live news for followed stars) -----
fanRouter.get('/notifications', route(async (req) => {
  const uid = authed(req), u = db.users[uid];
  const stored = db.notifications.filter((n) => n.userId === uid).slice(-60);
  const since = u.lastNewsSeen || new Date(Date.now() - 48 * 3600_000).toISOString();
  const followed = Object.entries(db.starFollows).filter(([, list]) => list.some((f) => (f.id || f) === uid)).slice(0, 8);
  const newsItems = (await Promise.all(followed.map(async ([starId, list]) => {
    const meta = list.find((f) => (f.id || f) === uid);
    const name = meta.starName || starId.replace(/_/g, ' ').replace(/ \(.*\)$/, '');
    const items = await news(name, 3, name).catch(() => []);
    return items.filter((n) => n.publishedAt && n.publishedAt > new Date(Date.now() - 72 * 3600_000).toISOString())
      .map((n) => ({ id: `news:${n.url}`, type: 'news', text: `${name}: ${n.title}`, link: n.url, external: true, image: meta.starImage, at: n.publishedAt, read: n.publishedAt <= since }));
  }))).flat();
  const all = [...stored.map((n) => ({ ...n, actor: publicUser(db.users[n.actorId]) })), ...newsItems].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 50);
  return { unread: all.filter((n) => !n.read).length, items: all };
}));

fanRouter.post('/notifications/read', route((req) => {
  const uid = authed(req);
  db.notifications.forEach((n) => { if (n.userId === uid) n.read = true; });
  db.users[uid].lastNewsSeen = now();
  save();
  return { ok: true };
}));

/* =====================================================================
   Weeks (Monday 00:00 IST), fan art of the week, star vs star battles,
   personal feed, release-day watch parties
   ===================================================================== */
const IST = 5.5 * 3600_000;
function weekStart(offsetWeeks = 0, at = Date.now()) {
  const d = new Date(at + IST);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - day + offsetWeeks * 7);
  return new Date(d.getTime() - IST);
}
const weekKey = (offset = 0) => new Date(weekStart(offset).getTime() + IST).toISOString().slice(0, 10);
const todayIST = () => new Date(Date.now() + IST).toISOString().slice(0, 10);

/* ---------- fan art ---------- */
function weeklyArt(star, offset = 0) {
  const from = weekStart(offset).toISOString(), to = weekStart(offset + 1).toISOString();
  return db.posts
    .filter((p) => p.kind === 'art' && (!star || p.starId === star) && p.at >= from && p.at < to)
    .sort((a, b) => (b.artVotes?.length || 0) - (a.artVotes?.length || 0) || a.at.localeCompare(b.at));
}
function isFeaturedArt(p) {
  const at = new Date(p.at).getTime();
  const offset = Math.round((weekStart(0, at).getTime() - weekStart(0).getTime()) / (7 * 86400_000));
  if (offset >= 0) return false; // only finished weeks award the badge
  const top = weeklyArt(p.starId, offset).slice(0, 3);
  return top.some((x) => x.id === p.id) && (p.artVotes?.length || 0) >= 1;
}

fanRouter.post('/posts/:id/vote', route((req) => {
  const by = authed(req), p = findPost(req.params.id);
  need(p.kind === 'art', 'Only fan art can be voted on');
  p.artVotes ||= [];
  const i = p.artVotes.indexOf(by);
  if (i >= 0) p.artVotes.splice(i, 1);
  else {
    need(by !== p.userId, 'You cannot vote for your own art');
    p.artVotes.push(by);
    notify(p.userId, 'like', `${db.users[by].name} voted for your fan art`, postLink(p), by);
  }
  rankAlerts(p.starId, p.starName);
  save();
  return postView(p, by);
}));

fanRouter.get('/art/top', route((req) => {
  const star = req.query.starId ? starKey(req.query.starId) : null;
  return weeklyArt(star).slice(0, 3).map((p) => postView(p, req.uid));
}));

/* ---------- star vs star battles (one per industry per week) ---------- */
const BATTLE_INDUSTRIES = ['tollywood', 'kollywood', 'bollywood', 'sandalwood', 'mollywood', 'hollywood'];
async function battleFor(industry, offset = 0) {
  const key = `${weekKey(offset)}|${industry}`;
  if (db.battles[key]) return db.battles[key];
  if (offset !== 0) return null;
  const top = (await industryStars(industry, 'global')).slice(0, 2);
  if (top.length < 2) return null;
  const pick = (s) => ({ id: s.id, name: s.name, image: s.image, score: s.score });
  db.battles[key] = { week: weekKey(), industry, a: pick(top[0]), b: pick(top[1]), votes: {} };
  save();
  return db.battles[key];
}
function tally(b) {
  const t = { a: { votes: 0, weighted: 0 }, b: { votes: 0, weighted: 0 } };
  Object.values(b.votes).forEach((v) => { t[v.pick].votes += 1; t[v.pick].weighted += v.weight; });
  return t;
}
function battleChampion(star) {
  for (const ind of BATTLE_INDUSTRIES) {
    const b = db.battles[`${weekKey(-1)}|${ind}`];
    if (!b) continue;
    const t = tally(b);
    if (t.a.weighted === t.b.weighted) continue;
    const winner = t.a.weighted > t.b.weighted ? b.a : b.b;
    if (winner.id === star) return { week: b.week, against: (winner === b.a ? b.b : b.a).name, weighted: Math.max(t.a.weighted, t.b.weighted) };
  }
  return null;
}
const battleView = (b, viewer) => b && ({
  week: b.week, industry: b.industry, endsAt: weekStart(1).toISOString(),
  a: { ...b.a, ...tally(b).a }, b: { ...b.b, ...tally(b).b },
  myVote: viewer ? b.votes[viewer]?.pick || null : null,
});

fanRouter.get('/battle', route(async (req) => {
  const ind = BATTLE_INDUSTRIES.includes(req.query.industry) ? req.query.industry : 'tollywood';
  const [cur, last] = await Promise.all([battleFor(ind), battleFor(ind, -1)]);
  return { current: battleView(cur, req.uid), last: battleView(last, req.uid) };
}));

fanRouter.post('/battle/vote', route(async (req) => {
  const uid = authed(req);
  const ind = BATTLE_INDUSTRIES.includes(req.body?.industry) ? req.body.industry : null;
  need(ind, 'Unknown industry');
  const pick = req.body?.pick;
  need(pick === 'a' || pick === 'b', 'Pick a or b');
  const b = await battleFor(ind);
  need(b, 'No battle this week');
  need(!b.votes[uid], 'You already voted in this battle');
  const starId = b[pick].id;
  const isTopFan = fanScores(starId).slice(0, 10).some((f) => f.user?.id === uid);
  b.votes[uid] = { pick, weight: isTopFan ? 2 : 1, at: now() };
  save();
  return battleView(b, uid);
}));

/* ---------- personal feed ---------- */
function interestsOf(uid) {
  const w = new Map();
  const bump = (star, n, why) => {
    if (!star) return;
    const cur = w.get(star) || { score: 0, why, top: 0 };
    cur.score += n;
    if (n > cur.top) { cur.why = why; cur.top = n; }
    w.set(star, cur);
  };
  Object.entries(db.starFollows).forEach(([star, list]) => { if (list.some((f) => (f.id || f) === uid)) bump(star, 5, 'follow'); });
  Object.entries(db.clubs).forEach(([star, c]) => { if (c.members.includes(uid)) bump(star, 4, 'club'); });
  Object.entries(db.quiz).forEach(([star, byUser]) => { if (byUser[uid]) bump(star, 2, 'quiz'); });
  db.posts.forEach((p) => { if (p.likes.includes(uid) || p.comments.some((c) => c.userId === uid) || (p.artVotes || []).includes(uid)) bump(p.starId, 1, 'liked'); });
  Object.values(db.checkins).forEach((c) => { if (c.fans[uid]) bump(c.starId, 2, 'checkin'); });
  return [...w].sort((a, b) => b[1].score - a[1].score);
}
const REASON = { follow: 'Because you follow', club: 'From your club:', quiz: 'Because you played the quiz on', liked: 'Because you engaged with', checkin: 'Because you are going to see' };

fanRouter.get('/feed', route(async (req) => {
  const uid = req.uid;
  const industry = clean(req.query.industry, 20);
  const interests = uid ? interestsOf(uid).slice(0, 8) : [];
  const followSet = new Set(uid ? Object.entries(db.starFollows).filter(([, l]) => l.some((f) => (f.id || f) === uid)).map(([s]) => s) : []);
  let stars = [];
  for (const [id, info] of interests) {
    const s = await findStar(id).catch(() => null);
    if (s) stars.push({ s, reason: `${REASON[info.why]} ${s.name}` });
  }
  const personal = stars.length > 0;
  if (!personal) {
    const list = BATTLE_INDUSTRIES.includes(industry) ? await industryStars(industry, 'global') : await allStars('global');
    stars = list.slice(0, 6).map((s) => ({ s, reason: null }));
  }
  const pickStar = (s) => ({ id: s.id, name: s.name, fullName: s.fullName, image: s.image, industry: s.industry, role: s.role });
  const newsItems = (await Promise.all(stars.map(async ({ s, reason }) => {
    const items = await news(s.newsQuery, 12, s.fullName).catch(() => []);
    return [...items.filter((n) => n.image), ...items.filter((n) => !n.image)].slice(0, personal ? 4 : 3)
      .map((n) => ({ type: 'news', key: n.url, at: n.publishedAt, ...n, star: pickStar(s), following: followSet.has(s.id), reason }));
  }))).flat();
  const starIds = new Set(stars.map((x) => x.s.id));
  const reasonFor = Object.fromEntries(stars.map((x) => [x.s.id, x.reason]));
  const fanItems = db.posts
    .filter((p) => (personal ? starIds.has(p.starId) : true) && p.userId !== uid)
    .sort((a, b) => b.at.localeCompare(a.at)).slice(0, 20)
    .map((p) => ({ type: 'fan', key: p.id, at: p.at, post: postView(p, uid), reason: reasonFor[p.starId] || null }));
  const art = weeklyArt(null).slice(0, 3).map((p, i) => ({ type: 'fan', key: `art-${p.id}`, at: p.at, post: postView(p, uid), reason: `Fan Art of the Week · #${i + 1}` }));
  const seen = new Set(art.map((a) => a.post.id));
  const rest = [...newsItems, ...fanItems].filter((x) => !seen.has(x.key) && seen.add(x.key)).sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  return { personal, items: [...art, ...rest].slice(0, 40) };
}));

/* ---------- release-day watch parties (live over Server-Sent Events) ---------- */
const parties = new Map();
const REACTIONS = ['🔥', '❤️', '😂', '😭', '👏', '🤯', '⭐', '🎉'];
const partyRoom = (qid) => { if (!parties.has(qid)) parties.set(qid, { clients: new Set(), messages: [], poll: null }); return parties.get(qid); };
const broadcast = (room, event, data) => { for (const c of room.clients) c.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };

async function partyInfo(starId) {
  const star = await findStar(starId);
  need(star, 'Unknown star', 404);
  const film = await nextRelease(star);
  if (!film?.date) return { star, film, open: false };
  const today = todayIST();
  const closesOn = new Date(new Date(film.date).getTime() + 3 * 86400_000).toISOString().slice(0, 10);
  const open = process.env.STARLOOP_PARTY_ALWAYS_OPEN === '1' || (today >= film.date && today < closesOn);
  return { star, film, open, closesOn };
}
const pollView = (poll, viewer) => poll && ({
  id: poll.id, question: poll.question, options: poll.options, by: publicUser(db.users[poll.by]),
  counts: poll.options.map((_, i) => Object.values(poll.votes).filter((v) => v === i).length),
  mine: viewer != null && poll.votes[viewer] !== undefined ? poll.votes[viewer] : null,
});
const canTalk = (uid, film) => !!uid && !!db.checkins[film.qid]?.fans[uid];

fanRouter.get('/party/:starId', route(async (req) => {
  const { star, film, open, closesOn } = await partyInfo(starKey(req.params.starId));
  const room = film?.qid ? partyRoom(film.qid) : null;
  return {
    star: { id: star.id, name: star.name, image: star.image }, film, open, closesOn,
    online: room?.clients.size || 0, canTalk: film ? canTalk(req.uid, film) : false,
    messages: open && room ? room.messages.slice(-80) : [], poll: open && room ? pollView(room.poll, req.uid) : null,
    reactions: REACTIONS,
  };
}));

fanRouter.get('/party/:starId/stream', async (req, res) => {
  try {
    const { film, open } = await partyInfo(starKey(req.params.starId));
    if (!open) return res.status(403).json({ error: 'The party opens on release day' });
    const room = partyRoom(film.qid);
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.flushHeaders();
    room.clients.add(res);
    broadcast(room, 'presence', { online: room.clients.size });
    const ping = setInterval(() => res.write(': ping\n\n'), 25000);
    req.on('close', () => { clearInterval(ping); room.clients.delete(res); broadcast(room, 'presence', { online: room.clients.size }); });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

async function openParty(req) {
  const uid = authed(req);
  const info = await partyInfo(starKey(req.params.starId));
  need(info.open, 'The party opens on release day', 403);
  need(canTalk(uid, info.film), 'Check in as Going or Watched to join the party', 403);
  return { uid, ...info, room: partyRoom(info.film.qid) };
}

fanRouter.post('/party/:starId/message', route(async (req) => {
  const { uid, room } = await openParty(req);
  const text = clean(req.body?.text, 300);
  need(text, 'Message is empty');
  const last = room.messages.filter((m) => m.user.id === uid).at(-1);
  need(!last || Date.now() - new Date(last.at).getTime() > 1500, 'Slow down a little');
  const msg = { id: newId(), user: publicUser(db.users[uid]), text, at: now() };
  room.messages.push(msg);
  if (room.messages.length > 300) room.messages.shift();
  broadcast(room, 'message', msg);
  return msg;
}));

fanRouter.post('/party/:starId/react', route(async (req) => {
  const { uid, room } = await openParty(req);
  need(REACTIONS.includes(req.body?.emoji), 'Unknown reaction');
  broadcast(room, 'reaction', { emoji: req.body.emoji, by: uid });
  return { ok: true };
}));

fanRouter.post('/party/:starId/poll', route(async (req) => {
  const { uid, room } = await openParty(req);
  const question = clean(req.body?.question, 120);
  const options = (Array.isArray(req.body?.options) ? req.body.options : []).map((o) => clean(o, 40)).filter(Boolean).slice(0, 4);
  need(question && options.length >= 2, 'Add a question and at least 2 options');
  need(!room.poll || Date.now() - new Date(room.poll.at).getTime() > 3 * 60_000, 'A poll is already running, try again in a few minutes');
  room.poll = { id: newId(), question, options, by: uid, votes: {}, at: now() };
  broadcast(room, 'poll', pollView(room.poll, null));
  return pollView(room.poll, uid);
}));

fanRouter.post('/party/:starId/vote', route(async (req) => {
  const { uid, room } = await openParty(req);
  need(room.poll, 'No poll running');
  const i = Number(req.body?.option);
  need(Number.isInteger(i) && i >= 0 && i < room.poll.options.length, 'Invalid option');
  room.poll.votes[uid] = i;
  broadcast(room, 'poll', pollView(room.poll, null));
  return pollView(room.poll, uid);
}));

/* =====================================================================
   Direct messages between fans (persisted, live over SSE) + single post
   ===================================================================== */
const convKey = (a, b) => [a, b].sort().join(':');
const userStreams = new Map(); // uid -> Set(res)
const pushTo = (uid, event, data) => { for (const r of userStreams.get(uid) || []) r.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };

function unreadIn(conv, uid) {
  const seen = db.dmRead?.[uid]?.[conv.key] || '';
  return conv.messages.filter((m) => m.from !== uid && m.at > seen).length;
}

fanRouter.get('/dm', route((req) => {
  const uid = authed(req);
  db.dms ||= {};
  const list = Object.values(db.dms)
    .filter((c) => c.members.includes(uid) && c.messages.length)
    .map((c) => {
      const other = c.members.find((m) => m !== uid);
      const last = c.messages.at(-1);
      return { user: publicUser(db.users[other]), last: { text: last.text, at: last.at, mine: last.from === uid }, unread: unreadIn(c, uid) };
    })
    .filter((c) => c.user)
    .sort((a, b) => b.last.at.localeCompare(a.last.at));
  return { conversations: list, unread: list.reduce((n, c) => n + c.unread, 0) };
}));

fanRouter.get('/dm/stream', (req, res) => {
  const t = /^[a-f0-9]{64}$/.test(String(req.query.token || '')) ? String(req.query.token) : null;
  const s = t ? db.sessions[crypto.createHash('sha256').update(t).digest('hex')] : null;
  if (!s || !db.users[s.userId]) return res.status(401).json({ error: 'Please sign in first' });
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  if (!userStreams.has(s.userId)) userStreams.set(s.userId, new Set());
  userStreams.get(s.userId).add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => { clearInterval(ping); userStreams.get(s.userId)?.delete(res); });
});

fanRouter.get('/dm/:userId', route((req) => {
  const uid = authed(req), other = req.params.userId;
  need(db.users[other] && other !== uid, 'Fan not found', 404);
  db.dms ||= {};
  const key = convKey(uid, other);
  const conv = db.dms[key];
  ((db.dmRead ||= {})[uid] ||= {})[key] = now();
  save();
  return {
    user: publicUser(db.users[other]),
    followsYou: (db.fanFollows[other] || []).includes(uid),
    youFollow: (db.fanFollows[uid] || []).includes(other),
    messages: (conv?.messages || []).slice(-200).map((m) => ({ ...m, mine: m.from === uid })),
  };
}));

fanRouter.post('/dm/:userId', route((req) => {
  const uid = authed(req), other = req.params.userId;
  need(db.users[other] && other !== uid, 'Fan not found', 404);
  const text = clean(req.body?.text, 1000);
  need(text, 'Message is empty');
  db.dms ||= {};
  const key = convKey(uid, other);
  const conv = (db.dms[key] ||= { key, members: [uid, other], messages: [] });
  const last = conv.messages.filter((m) => m.from === uid).at(-1);
  need(!last || Date.now() - new Date(last.at).getTime() > 800, 'Slow down a little');
  const msg = { id: newId(), from: uid, text, at: now() };
  conv.messages.push(msg);
  if (conv.messages.length > 2000) conv.messages.shift();
  ((db.dmRead ||= {})[uid] ||= {})[key] = msg.at;
  const isNew = conv.messages.length === 1 || !conv.messages.slice(0, -1).some((m) => m.from === uid);
  if (isNew) notify(other, 'message', `${db.users[uid].name} sent you a message`, `/messages/${uid}`, uid);
  save();
  pushTo(other, 'dm', { ...msg, mine: false, user: publicUser(db.users[uid]) });
  pushTo(uid, 'dm', { ...msg, mine: true, to: other });
  return { ...msg, mine: true };
}));

fanRouter.get('/posts/:id', route((req) => {
  const p = findPost(req.params.id);
  return postView(p, req.uid);
}));

fanRouter.get('/dm-contacts', route((req) => {
  const uid = authed(req);
  const following = db.fanFollows[uid] || [];
  const followers = Object.entries(db.fanFollows).filter(([, l]) => l.includes(uid)).map(([id]) => id);
  const q = clean(req.query.q, 40).toLowerCase();
  const ids = q
    ? Object.keys(db.users).filter((id) => id !== uid && `${db.users[id].name} ${db.users[id].handle}`.toLowerCase().includes(q)).slice(0, 20)
    : [...new Set([...following, ...followers])];
  return ids.map((id) => ({ ...publicUser(db.users[id]), youFollow: following.includes(id), followsYou: followers.includes(id) })).filter((u) => u.id);
}));
