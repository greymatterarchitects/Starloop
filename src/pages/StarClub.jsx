import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Brain, CalendarClock, Camera, Check, Clapperboard, Megaphone, MessageCircle, Palette, PartyPopper, Plus, Star, Ticket, Trophy, Users, X } from 'lucide-react';
import { timeAgo, useApi } from '../api.js';
import { fanGet, fanPost, readImage, useFan } from '../fan.js';
import { Avatar, BottomNavHome, ErrorNote, Skel, Verified } from '../components/ui.jsx';
import { useStory } from '../components/StoryViewer.jsx';
import FeedCard from '../components/FeedCard.jsx';

const compact = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k` : String(n));
const enc = encodeURIComponent;

function useFanData(url, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => (url ? fanGet(url).then((d) => { setData(d); setError(''); }).catch((e) => setError(e.message)) : Promise.resolve()), [url, ...deps]);
  useEffect(() => { setData(null); load(); }, [load]);
  return [data, load, error];
}

export default function StarClub() {
  const { id } = useParams();
  const nav = useNavigate();
  const { openStory } = useStory();
  const fan = useFan();
  const star = useApi(`/api/stars/${enc(id)}`, 30 * 60_000);
  const s = star.data;
  const [club, reload] = useFanData(`/api/fans/club/${enc(id)}`, [fan.id]);
  useEffect(() => { const t = setInterval(reload, 20000); return () => clearInterval(t); }, [reload]);
  const news = useApi(s ? `/api/news?q=${enc(s.newsQuery)}&name=${enc(s.fullName)}&limit=24` : null);
  const [tab, setTab] = useState('all');
  const [composer, setComposer] = useState(false);
  const [quiz, setQuiz] = useState(false);
  const [need, setNeed] = useState(null);
  const [err, setErr] = useState('');

  const meta = s ? { starName: s.name, starImage: s.image } : {};
  const act = async (fn) => {
    setErr('');
    if (!fan.registered) return setNeed(() => fn);
    try { await fn(); await reload(); } catch (e) { if (e.status === 401) setNeed(() => fn); else setErr(e.message); }
  };
  const toggleFollow = () => act(() => fanPost(`/api/fans/club/${enc(id)}/follow`, meta));
  const toggleJoin = () => act(() => fanPost(`/api/fans/club/${enc(id)}/join`, meta));
  const openComposer = () => act(async () => setComposer(true));

  const rating = s ? Math.max(1, Math.min(5, Math.round(s.score / 2))) : 0;
  const handle = s ? `@${s.name.replace(/[^A-Za-z0-9]/g, '')}` : '';
  const fanPosts = club?.posts || [];
  const starCard = s ? { id: s.id, name: s.name, fullName: s.fullName, image: s.image, industry: s.industry, role: s.role } : null;
  const newsPosts = (news.data || []).map((n) => ({ type: 'news', key: n.url, ...n, star: starCard, following: !!club?.following, at: n.publishedAt }));
  const fanItems = fanPosts.map((p) => ({ type: 'fan', key: p.id, post: p, at: p.at }));
  const allItems = [...fanItems, ...newsPosts].sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  const photos = [...fanPosts.filter((p) => p.image).map((p) => ({ key: p.id, src: p.image, href: null, by: p.user?.name })), ...newsPosts.filter((n) => n.image).map((n) => ({ key: n.url, src: n.image, href: n.url, by: n.source }))];

  return (
    <div className="page page--club">
      <header className="club-hero">
        <button className="club-hero__btn" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={20} /></button>
        <Link className="club-hero__btn" to={`/chat/${s?.industry || 'all'}`} aria-label="Fan chat"><MessageCircle size={19} /></Link>
        <div className="club-rating" title={s ? `Popularity ${s.score.toFixed(1)}/10 from this week's Wikipedia readers` : ''}>
          {[1, 2, 3, 4, 5].map((i) => <Star key={i} size={14} fill={i <= rating ? '#f4b400' : 'none'} color={i <= rating ? '#e0a100' : '#c9b2bc'} strokeWidth={1.8} />)}
        </div>
      </header>

      <section className="club-sheet">
        <button className="club-avatar" onClick={() => s && openStory(s)} aria-label="View stories">
          <span className="ring ring--sunset">{s ? <Avatar src={s.image} name={s.name} size={88} /> : <Skel w={92} h={92} r={99} />}</span>
        </button>
        <div className="club-stats">
          <div><b>{club ? compact(club.followers) : '–'}</b><small>Followers</small></div>
          <div><b>{club ? compact(club.members) : '–'}</b><small>Club members</small></div>
        </div>
        <h1 className="club-handle">{s ? <>{handle} <Verified size={16} /></> : <Skel w={120} h={16} />}</h1>
        {s && <p className="club-role">{s.role} · {s.industryLabel}</p>}
        {club?.champion && <p className="champion"><Trophy size={13} /> Battle champion · beat {club.champion.against} last week</p>}
        <p className="club-bio">{s ? s.bio || s.description : <Skel h={30} />}</p>
        <div className="club-actions">
          <button className={`club-btn club-btn--primary ${club?.following ? 'is-on' : ''}`} onClick={toggleFollow}>{club?.following ? 'Following' : 'Follow'}</button>
          <button className={`club-btn ${club?.joined ? 'is-on' : ''}`} onClick={toggleJoin}>{club?.joined ? 'Joined ✓' : 'Join Club'}</button>
        </div>
        {err && <p className="error-note">{err}</p>}
        <ErrorNote error={star.error} />

        <div className="club-tools">
          <ReleaseCard starId={id} fan={fan} act={act} onParty={() => nav(`/party/${enc(id)}`)} />
          <button className="quiz-cta" onClick={() => setQuiz(true)}>
            <span className="quiz-cta__icon"><Brain size={20} /></span>
            <span><b>Daily fan quiz</b><small>5 questions · +2 pts each</small></span>
          </button>
        </div>

        {club?.artTop?.length > 0 && (
          <>
            <h2 className="club-sec"><Palette size={15} /> Fan Art of the Week</h2>
            <div className="art-top">
              {club.artTop.map((p, i) => (
                <Link key={p.id} to={`/fan/${p.user?.id}`} className="art-top__item">
                  <img src={p.image} alt="" loading="lazy" />
                  <em className="art-top__rank">#{i + 1}</em>
                  <span className="glass-chip art-top__by">{p.user?.name} · {p.artVotes} {p.artVotes === 1 ? "vote" : "votes"}</span>
                </Link>
              ))}
            </div>
          </>
        )}

        <h2 className="club-sec">Top Fans</h2>
        <div className="topfans">
          <button className="topfan" onClick={openComposer}>
            <span className="topfan__ring topfan__ring--you"><Avatar src={fan.me.avatar} name={fan.me.name || 'You'} size={50} /><i><Plus size={12} strokeWidth={3} /></i></span>
            <span>You</span>
          </button>
          {(club?.topFans || []).map((f, i) => (
            <Link key={f.user.id} to={`/fan/${f.user.id}`} className="topfan" title={`${f.points} pts · ${f.posts} posts · ${f.campaigns} campaigns · ${f.comments} comments · ${f.shares} shares · ${f.quiz} quiz answers`}>
              <span className={`topfan__ring ${i < 3 ? `topfan__ring--${i + 1}` : ''}`}><Avatar src={f.user.avatar} name={f.user.name} size={50} /><em>{f.points}</em></span>
              <span>{f.user.name.split(' ')[0]}</span>
            </Link>
          ))}
          {club && !club.topFans.length && <p className="topfans__empty">No fans yet. Post, comment, take the quiz or check in to become #1.</p>}
        </div>

        <nav className="club-tabs">
          {[['all', 'All'], ['photos', 'Photos'], ['fans', 'By Fans']].map(([k, l]) => (
            <button key={k} className={tab === k ? 'is-active' : ''} onClick={() => setTab(k)}>{l}</button>
          ))}
        </nav>
      </section>

      {need && <AuthSheet fan={fan} onClose={() => setNeed(null)} onDone={async () => { const fn = need; setNeed(null); try { await fn(); await reload(); } catch (e) { setErr(e.message); } }} />}
      {composer && <Composer starId={id} meta={meta} onClose={() => setComposer(false)} onPosted={() => { setComposer(false); setTab('fans'); reload(); }} />}
      {quiz && <QuizSheet starId={id} star={s} fan={fan} act={act} onClose={() => { setQuiz(false); reload(); }} />}

      <div className="club-feed">
        {tab === 'photos' && (
          <div className="photo-grid">
            {photos.length === 0 && <p className="empty">No photos yet.</p>}
            {photos.map((p, i) => (
              <a key={p.key} className={`photo-grid__cell ${i % 5 === 0 ? 'is-big' : ''}`} href={p.href || p.src} target="_blank" rel="noreferrer">
                <img src={p.src} alt="" loading="lazy" referrerPolicy="no-referrer" />
                {p.by && <em className="glass-chip photo-grid__by">{p.by}</em>}
              </a>
            ))}
          </div>
        )}
        {tab === 'fans' && (
          <>
            <button className="compose-cta" onClick={openComposer}>
              <Avatar src={fan.me.avatar} name={fan.me.name || 'You'} size={34} /><span>Post or start a campaign for {s?.name || 'this star'}…</span><Camera size={18} />
            </button>
            {fanPosts.length === 0 && <p className="empty">No fan posts yet. Be the first!</p>}
            {fanItems.map((it) => <FeedCard key={it.key} item={it} fan={fan} onChange={reload} requireFan={act} />)}
          </>
        )}
        {tab === 'all' && (
          <>
            {news.loading && !news.data && <Skel h={240} r={26} />}
            {allItems.map((it) => <FeedCard key={it.key} item={it} fan={fan} onChange={reload} requireFan={act} />)}
          </>
        )}
      </div>
      <BottomNavHome />
    </div>
  );
}

/* ---------- Release countdown + check-ins ---------- */
function useCountdown(date) {
  const [t, setT] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setT(Date.now()), 1000); return () => clearInterval(i); }, []);
  if (!date) return null;
  const ms = new Date(`${date}T00:00:00+05:30`).getTime() - t;
  if (ms <= 0) return null;
  const d = Math.floor(ms / 864e5), h = Math.floor((ms % 864e5) / 36e5), m = Math.floor((ms % 36e5) / 6e4), sec = Math.floor((ms % 6e4) / 1e3);
  return { d, h, m, s: sec };
}

function ReleaseCard({ starId, fan, act, onParty }) {
  const [rel, load] = useFanData(`/api/fans/club/${enc(starId)}/release`, [fan.id]);
  const film = rel?.film;
  const cd = useCountdown(film?.date);
  const [pickRating, setPickRating] = useState(false);
  const released = film && film.date && !cd;
  const mine = rel?.mine;
  const check = (status, rating) => act(async () => { await fanPost(`/api/fans/club/${enc(starId)}/release/${film.qid}`, { status, rating }); await load(); setPickRating(false); });

  if (!rel) return <div className="release release--loading"><Skel h={88} r={20} /></div>;
  if (!film) return <div className="release release--none"><CalendarClock size={18} /><span>No upcoming release announced yet</span></div>;
  return (
    <div className="release">
      <div className="release__poster">{film.poster ? <img src={film.poster} alt={film.title} referrerPolicy="no-referrer" /> : <Clapperboard size={26} />}</div>
      <div className="release__body">
        <small className="release__kicker">{released ? 'Now in cinemas' : film.date ? 'Next release' : 'Announced'}</small>
        <b>{film.title}</b>
        {cd ? (
          <span className="release__cd">{[['d', cd.d], ['h', cd.h], ['m', cd.m], ['s', cd.s]].map(([k, v]) => <span key={k}><b>{String(v).padStart(2, '0')}</b><i>{k}</i></span>)}</span>
        ) : (
          <small className="release__date">{film.date ? new Date(film.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Date to be announced'}</small>
        )}
        <span className="release__stats">
          <span><Users size={12} /> {rel.going} going</span>
          <span><Ticket size={12} /> {rel.watched} watched</span>
          {rel.rating && <span><Star size={12} fill="#f4b400" color="#e0a100" /> {rel.rating} ({rel.ratings})</span>}
        </span>
        <div className="release__actions">
          <button className={mine?.status === 'going' ? 'is-on' : ''} onClick={() => check(mine?.status === 'going' ? 'none' : 'going')}>{mine?.status === 'going' ? <><Check size={13} /> Going</> : 'I’m going'}</button>
          {(released || !film.date) && <button className={mine?.status === 'watched' ? 'is-on' : ''} onClick={() => setPickRating((v) => !v)}>{mine?.status === 'watched' ? <><Check size={13} /> Watched {mine.rating ? `· ${mine.rating}★` : ''}</> : 'Watched it'}</button>}
        </div>
        {released && <button className="release__party" onClick={onParty}><PartyPopper size={14} /> Join the watch party</button>}
        {!released && film.date && <small className="release__partynote"><PartyPopper size={11} /> Watch party opens on release day</small>}
        {pickRating && (
          <div className="release__rate">
            {[1, 2, 3, 4, 5].map((r) => <button key={r} onClick={() => check('watched', r)} aria-label={`${r} stars`}><Star size={20} fill={(mine?.rating || 0) >= r ? '#f4b400' : 'none'} color="#e0a100" /></button>)}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Daily quiz ---------- */
function QuizSheet({ starId, star, fan, act, onClose }) {
  const [quiz] = useFanData(`/api/fans/club/${enc(starId)}/quiz`, [fan.id]);
  const [answers, setAnswers] = useState([]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const submit = () => {
    if (answers.filter((a) => a !== undefined).length < quiz.questions.length) return setError('Answer every question first');
    act(async () => setResult(await fanPost(`/api/fans/club/${enc(starId)}/quiz`, { answers })));
  };
  const done = result || quiz?.done;
  return (
    <div className="sheet" onClick={onClose}>
      <div className="sheet__panel sheet__panel--tall" onClick={(e) => e.stopPropagation()}>
        <header><b><Brain size={16} /> {star?.name || ''} daily quiz</b><button onClick={onClose} aria-label="Close"><X size={20} /></button></header>
        {!quiz && <Skel h={180} r={16} />}
        {quiz && !quiz.questions.length && <p className="empty">Not enough facts for a quiz about this star today.</p>}
        {quiz?.done && !result && <p className="quiz-done">You scored {quiz.done.correct}/{quiz.done.total} today. A new quiz unlocks tomorrow.</p>}
        {quiz && !quiz.done && quiz.questions.map((q, i) => (
          <div key={i} className="quiz-q">
            <p><b>{i + 1}.</b> {q.q}</p>
            <div className="quiz-opts">
              {q.options.map((o, j) => {
                const r = result?.results[i];
                const cls = r ? (j === r.correct ? 'is-right' : j === r.chosen ? 'is-wrong' : '') : answers[i] === j ? 'is-picked' : '';
                return <button key={j} className={cls} disabled={!!result} onClick={() => { setError(''); setAnswers((a) => { const n = [...a]; n[i] = j; return n; }); }}>{o}</button>;
              })}
            </div>
          </div>
        ))}
        {error && <p className="error-note">{error}</p>}
        {result && <p className="quiz-done">You got {result.correct}/{result.total} right · +{result.points} fan points</p>}
        <footer><span />{quiz && !done && quiz.questions.length > 0 ? <button className="club-btn club-btn--primary" onClick={submit}>Submit answers</button> : <button className="club-btn" onClick={onClose}>Close</button>}</footer>
      </div>
    </div>
  );
}



function Composer({ starId, meta, onClose, onPosted }) {
  const [text, setText] = useState('');
  const [kind, setKind] = useState('post');
  const [goal, setGoal] = useState(100);
  const [endsAt, setEndsAt] = useState('');
  const [image, setImage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const file = useRef();
  const submit = async (e) => {
    e.preventDefault();
    if (kind === 'campaign' && !(Number(goal) >= 2)) return setErr('Set a goal of at least 2 fans');
    if (kind === 'art' && !image) return setErr('Add your poster, edit or artwork first');
    setBusy(true); setErr('');
    try {
      await fanPost(`/api/fans/club/${enc(starId)}/posts`, { text, kind, image, goal: Number(goal), endsAt: endsAt || null, ...meta });
      onPosted();
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <div className="sheet" onClick={onClose}>
      <form className="sheet__panel" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <header><b>New in {meta.starName}’s club</b><button type="button" onClick={onClose} aria-label="Close"><X size={20} /></button></header>
        <div className="seg seg--wide">
          <button type="button" className={kind === 'post' ? 'is-active' : ''} onClick={() => setKind('post')}>Post</button>
          <button type="button" className={kind === 'campaign' ? 'is-active' : ''} onClick={() => setKind('campaign')}><Megaphone size={13} /> Campaign</button>
          <button type="button" className={kind === 'art' ? 'is-active' : ''} onClick={() => setKind('art')}><Palette size={13} /> Fan art</button>
        </div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} rows={4} autoFocus
          placeholder={kind === 'campaign' ? 'Rally fans: e.g. “500 fans for First Day First Show!”' : `Say something about ${meta.starName}…`} />
        {kind === 'campaign' && (
          <div className="sheet__row">
            <label>Goal (fans)<input type="number" min="2" max="1000000" value={goal} onChange={(e) => setGoal(e.target.value)} /></label>
            <label>Ends (optional)<input type="date" value={endsAt} min={new Date(Date.now() + 864e5).toISOString().slice(0, 10)} onChange={(e) => setEndsAt(e.target.value)} /></label>
          </div>
        )}
        {image && <span className="sheet__preview"><img src={image} alt="" /><button type="button" onClick={() => setImage(null)} aria-label="Remove photo"><X size={14} /></button></span>}
        {err && <p className="error-note">{err}</p>}
        <footer>
          <button type="button" className="sheet__icon" onClick={() => file.current.click()}><Camera size={18} /> Photo</button>
          <input ref={file} type="file" accept="image/*" hidden onChange={async (e) => { try { setImage(await readImage(e.target.files[0])); } catch (x) { setErr(x.message); } }} />
          <button className="club-btn club-btn--primary" disabled={busy || (!text.trim() && !image)}>{busy ? 'Posting…' : kind === 'campaign' ? 'Launch' : kind === 'art' ? 'Submit art' : 'Post'}</button>
        </footer>
      </form>
    </div>
  );
}

/* ---------- Sign up / log in ---------- */
export function AuthSheet({ fan, onClose, onDone }) {
  const [mode, setMode] = useState('signup');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      if (mode === 'signup') await fan.signup(email, password, name);
      else await fan.login(email, password);
      onDone?.();
    } catch (x) { setErr(x.message); if (x.status === 409) setMode('login'); } finally { setBusy(false); }
  };
  return (
    <div className="sheet" onClick={onClose}>
      <form className="sheet__panel" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <header><b>{mode === 'signup' ? 'Create your fan account' : 'Welcome back'}</b><button type="button" onClick={onClose} aria-label="Close"><X size={20} /></button></header>
        <div className="seg seg--wide">
          <button type="button" className={mode === 'signup' ? 'is-active' : ''} onClick={() => setMode('signup')}>Sign up</button>
          <button type="button" className={mode === 'login' ? 'is-active' : ''} onClick={() => setMode('login')}>Log in</button>
        </div>
        {mode === 'signup' && <input className="sheet__input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Display name" maxLength={30} autoComplete="nickname" />}
        <input className="sheet__input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" autoComplete="email" />
        <input className="sheet__input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === 'signup' ? 'Password (8+ characters)' : 'Password'} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
        {err && <p className="error-note">{err}</p>}
        <footer><small className="page-sub" style={{ margin: 0 }}>Your password is stored hashed.</small><button className="club-btn club-btn--primary" disabled={busy}>{busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Log in'}</button></footer>
      </form>
    </div>
  );
}
export const JoinSheet = AuthSheet;
