import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Camera, Check, ImagePlus, Megaphone, Palette, PenLine, Search, X } from 'lucide-react';
import { useApi } from '../api.js';
import { fanGet, fanPost, readImage, useFan } from '../fan.js';
import { Avatar, BottomNavHome, Skel } from '../components/ui.jsx';
import { FanCard } from '../components/FeedCard.jsx';
import { AuthSheet } from './StarClub.jsx';

const enc = encodeURIComponent;

/* ---------- One post, full page with all comments ---------- */
export function PostPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const fan = useFan();
  const [post, setPost] = useState(null);
  const [error, setError] = useState('');
  const [need, setNeed] = useState(null);
  const load = useCallback(() => fanGet(`/api/fans/posts/${id}`).then((p) => { setPost(p); setError(''); }).catch((e) => setError(e.message)), [id, fan.id]);
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);
  const requireFan = async (fn) => { if (!fan.registered) return setNeed(() => fn); try { await fn(); } catch (e) { if (e.status === 401) setNeed(() => fn); else setError(e.message); } };
  return (
    <div className="page page--home page--post">
      <header className="post-top">
        <button className="club-hero__btn" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={20} /></button>
        <b>Post</b>
        {post ? <Link to={`/star/${enc(post.starId)}`} className="post-top__club"><Avatar src={post.starImage} name={post.starName} size={30} /><span>{post.starName}</span></Link> : <span />}
      </header>
      {error && !post && <p className="empty">{error}</p>}
      {!post && !error && <Skel h={360} r={28} />}
      {post && <FanCard post={post} fan={fan} requireFan={requireFan} onChange={load} defaultOpen />}
      {need && <AuthSheet fan={fan} onClose={() => setNeed(null)} onDone={async () => { const fn = need; setNeed(null); await fn(); load(); }} />}
      <BottomNavHome />
    </div>
  );
}

/* ---------- Create a post: pick a club, then post / campaign / fan art ---------- */
export function NewPost() {
  const nav = useNavigate();
  const fan = useFan();
  const [sp] = useSearchParams();
  const [star, setStar] = useState(null);
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [kind, setKind] = useState('post');
  const [text, setText] = useState('');
  const [image, setImage] = useState(null);
  const [goal, setGoal] = useState(100);
  const [endsAt, setEndsAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [auth, setAuth] = useState(!fan.registered);
  const file = useRef();
  const trending = useApi('/api/stars?scope=global&limit=12');

  useEffect(() => {
    const id = sp.get('star');
    if (id) fetch(`/api/stars/${enc(id)}`).then((r) => r.json()).then((s) => s.id && setStar(s)).catch(() => {});
  }, [sp]);
  useEffect(() => {
    if (q.trim().length < 2) return setResults([]);
    const t = setTimeout(() => fetch(`/api/search?q=${enc(q.trim())}`).then((r) => r.json()).then((d) => setResults((d || []).filter((x) => x.kind === 'star'))).catch(() => {}), 220);
    return () => clearTimeout(t);
  }, [q]);

  const submit = async (e) => {
    e.preventDefault();
    if (!fan.registered) return setAuth(true);
    if (!star) return setErr('Pick which star’s club to post in');
    if (!text.trim() && !image) return setErr('Write something or add a photo');
    if (kind === 'art' && !image) return setErr('Fan art needs an image');
    if (kind === 'campaign' && !(Number(goal) >= 2)) return setErr('Set a goal of at least 2 fans');
    setBusy(true); setErr('');
    try {
      const p = await fanPost(`/api/fans/club/${enc(star.id)}/posts`, { text, kind, image, goal: Number(goal), endsAt: endsAt || null, starName: star.name, starImage: star.image });
      nav(`/post/${p.id}`, { replace: true });
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };

  const KINDS = [['post', 'Post', PenLine], ['campaign', 'Campaign', Megaphone], ['art', 'Fan art', Palette]];
  return (
    <div className="page page--home page--new">
      <header className="post-top">
        <button className="club-hero__btn" onClick={() => nav(-1)} aria-label="Close"><X size={20} /></button>
        <b>Create</b>
        <button className="club-btn club-btn--primary post-top__go" onClick={submit} disabled={busy}>{busy ? 'Posting…' : kind === 'campaign' ? 'Launch' : 'Post'}</button>
      </header>

      <section className="new-card">
        <h2 className="new-label">1 · Choose a club</h2>
        {star ? (
          <div className="new-star">
            <Avatar src={star.image} name={star.name} size={44} />
            <span><b>{star.name}</b><small>{star.industryLabel} · {star.role}</small></span>
            <button onClick={() => setStar(null)} aria-label="Change star"><X size={16} /></button>
          </div>
        ) : (
          <>
            <label className="msgs-search"><Search size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a star…" /></label>
            <div className="new-picks">
              {(results.length ? results : trending.data?.stars || []).slice(0, 12).map((s) => (
                <button key={s.id} onClick={() => setStar(s)} className="new-pick">
                  <Avatar src={s.image} name={s.name} size={48} /><span>{s.name}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="new-card">
        <h2 className="new-label">2 · What are you sharing?</h2>
        <div className="new-kinds">
          {KINDS.map(([k, l, I]) => (
            <button key={k} className={kind === k ? 'is-active' : ''} onClick={() => setKind(k)}>
              <I size={18} /><b>{l}</b>{kind === k && <Check size={14} />}
            </button>
          ))}
        </div>
        <div className="new-compose">
          <Avatar src={fan.me.avatar} name={fan.me.name || 'You'} size={36} />
          <textarea value={text} onChange={(e) => { setErr(''); setText(e.target.value); }} rows={5} maxLength={1000}
            placeholder={kind === 'campaign' ? 'Rally fans: “500 fans for First Day First Show!”' : kind === 'art' ? 'Tell fans about your poster or edit…' : star ? `What's on your mind about ${star.name}?` : 'What’s on your mind?'} />
        </div>
        {kind === 'campaign' && (
          <div className="sheet__row">
            <label>Goal (fans)<input type="number" min="2" max="1000000" value={goal} onChange={(e) => setGoal(e.target.value)} /></label>
            <label>Ends (optional)<input type="date" value={endsAt} min={new Date(Date.now() + 864e5).toISOString().slice(0, 10)} onChange={(e) => setEndsAt(e.target.value)} /></label>
          </div>
        )}
        {image ? (
          <span className="new-preview"><img src={image} alt="" /><button onClick={() => setImage(null)} aria-label="Remove image"><X size={16} /></button></span>
        ) : (
          <button className="new-drop" onClick={() => file.current.click()}>
            <ImagePlus size={26} /><b>{kind === 'art' ? 'Upload your artwork' : 'Add a photo'}</b><small>JPG, PNG or WebP · resized automatically</small>
          </button>
        )}
        <input ref={file} type="file" accept="image/*" hidden onChange={async (e) => { try { setImage(await readImage(e.target.files[0])); } catch (x) { setErr(x.message); } }} />
        {err && <p className="error-note">{err}</p>}
        <button className="club-btn club-btn--primary new-submit" onClick={submit} disabled={busy}><Camera size={16} /> {busy ? 'Posting…' : kind === 'campaign' ? 'Launch campaign' : kind === 'art' ? 'Submit fan art' : 'Share post'}</button>
      </section>

      {auth && <AuthSheet fan={fan} onClose={() => setAuth(false)} onDone={() => setAuth(false)} />}
    </div>
  );
}
