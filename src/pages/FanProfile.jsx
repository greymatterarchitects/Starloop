import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Palette, Brain, Camera, Crown, LogOut, Megaphone, MessageCircle, MessagesSquare, PenLine, Pencil, Ticket, Trophy } from 'lucide-react';
import { fanGet, fanPost, readImage, useFan } from '../fan.js';
import { Avatar, BottomNavHome, Skel } from '../components/ui.jsx';
import { AuthSheet } from './StarClub.jsx';
import FeedCard from '../components/FeedCard.jsx';

const BADGE_ICONS = { palette: Palette, pen: PenLine, ticket: Ticket, megaphone: Megaphone, brain: Brain, message: MessagesSquare, crown: Crown };

export default function FanProfile() {
  const { id } = useParams();
  const nav = useNavigate();
  const fan = useFan();
  const isMe = !!fan.id && id === fan.id;
  const [p, setP] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('all');
  const [showClubs, setShowClubs] = useState(false);
  const [need, setNeed] = useState(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(() => fanGet(`/api/fans/users/${id}`).then((j) => { setP(j); setError(''); }).catch((e) => setError(e.message)), [id, fan.id]);
  useEffect(() => { setP(null); load(); }, [load]);

  const act = async (fn) => {
    if (!fan.registered) return setNeed(() => fn);
    try { await fn(); await load(); } catch (e) { if (e.status === 401) setNeed(() => fn); else setError(e.message); }
  };
  const follow = () => act(() => fanPost(`/api/fans/users/${id}/follow`));

  if (error && !p) {
    return (
      <div className="page page--club">
        <header className="club-hero club-hero--fan"><button className="club-hero__btn" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={20} /></button></header>
        <section className="club-sheet"><p className="empty" style={{ paddingTop: 50 }}>{error}</p></section>
        <BottomNavHome />
      </div>
    );
  }

  const photos = (p?.posts || []).filter((x) => x.image);
  return (
    <div className="page page--club page--fan">
      <header className="club-hero club-hero--fan">
        <button className="club-hero__btn" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={20} /></button>
        {isMe
          ? <button className="club-hero__btn" onClick={async () => { await fan.logout(); nav('/profile'); }} aria-label="Log out"><LogOut size={18} /></button>
          : <Link className="club-hero__btn" to="/chat/all" aria-label="Fan chat"><MessageCircle size={19} /></Link>}
      </header>

      <section className="club-sheet">
        <span className="club-avatar"><span className="ring ring--violet">{p ? <Avatar src={p.avatar} name={p.name} size={88} /> : <Skel w={92} h={92} r={99} />}</span></span>
        <div className="club-stats">
          <div><b>{p ? p.stats.posts : '–'}</b><small>Posts</small></div>
          <div><b>{p ? p.stats.followers : '–'}</b><small>Followers</small></div>
        </div>
        <h1 className="club-handle">{p ? `@${p.handle}` : <Skel w={120} h={16} />}</h1>
        {p && <p className="club-role"><Trophy size={13} /> {p.stats.points} fan points · {p.stats.clubs} clubs</p>}
        <p className="club-bio">{p ? p.bio || (isMe ? 'Add a short bio so other fans know you.' : `${p.name} is a StarLoop fan.`) : <Skel h={30} />}</p>
        {p?.badges?.length > 0 && (
          <div className="badges">
            {p.badges.map((b) => { const I = BADGE_ICONS[b.icon] || Trophy; return <span key={b.id} className={`badge badge--${b.id}`} title={b.label}><I size={13} /> {b.label}</span>; })}
          </div>
        )}
        <div className="club-actions">
          {isMe ? (
            <button className="club-btn club-btn--primary" onClick={() => setEditing(true)}><Pencil size={14} /> Edit profile</button>
          ) : (
            <>
              <button className={`club-btn club-btn--primary ${p?.following ? 'is-on' : ''}`} onClick={follow}>{p?.following ? 'Following' : 'Follow'}</button>
              <button className="club-btn" onClick={() => act(async () => nav(`/messages/${id}`))}><MessageCircle size={14} /> Message</button>
            </>
          )}
          <button className="club-btn" onClick={() => setShowClubs((v) => !v)}>Clubs · {p?.stats.clubs ?? 0}</button>
        </div>
        {showClubs && p && (
          <div className="fan-clubs">
            {p.clubs.length === 0 && <p className="empty">Not in any club yet.</p>}
            {p.clubs.map((c) => (
              <Link key={c.starId} to={`/star/${encodeURIComponent(c.starId)}`} className="topfan">
                <span className="topfan__ring"><Avatar src={c.starImage} name={c.starName} size={46} /></span>
                <span>{(c.starName || '').split(' ')[0]}</span>
              </Link>
            ))}
          </div>
        )}
        <nav className="club-tabs">
          {[['all', 'All'], ['photos', 'Photos'], ['campaigns', 'Campaigns']].map(([k, l]) => (
            <button key={k} className={tab === k ? 'is-active' : ''} onClick={() => setTab(k)}>{l}</button>
          ))}
        </nav>
      </section>

      <div className="club-feed">
        {!p && <Skel h={200} r={24} />}
        {p && tab === 'photos' && (
          <div className="photo-grid">
            {photos.length === 0 && <p className="empty">No photos yet.</p>}
            {photos.map((x, i) => (
              <Link key={x.id} className={`photo-grid__cell ${i % 5 === 0 ? 'is-big' : ''}`} to={`/star/${encodeURIComponent(x.starId)}`}>
                <img src={x.image} alt="" loading="lazy" />
                <em className="glass-chip photo-grid__by">{x.starName}</em>
              </Link>
            ))}
          </div>
        )}
        {p && tab !== 'photos' && (
          <>
            {(tab === 'campaigns' ? p.posts.filter((x) => x.kind === 'campaign') : p.posts).map((x) => (
              <FeedCard key={x.id} item={{ type: 'fan', post: x }} fan={fan} onChange={load} requireFan={act} />
            ))}
            {p.posts.length === 0 && <p className="empty">No posts yet.</p>}
          </>
        )}
      </div>

      {need && <AuthSheet fan={fan} onClose={() => setNeed(null)} onDone={async () => { const fn = need; setNeed(null); await act(fn); }} />}
      {editing && p && <EditSheet fan={fan} profile={p} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load(); }} />}
      <BottomNavHome />
    </div>
  );
}

function EditSheet({ fan, profile, onClose, onSaved }) {
  const [name, setName] = useState(profile.name);
  const [bio, setBio] = useState(profile.bio || '');
  const [avatar, setAvatar] = useState(null);
  const [err, setErr] = useState('');
  const file = useRef();
  return (
    <div className="sheet" onClick={onClose}>
      <form className="sheet__panel" onClick={(e) => e.stopPropagation()} onSubmit={async (e) => {
        e.preventDefault();
        try { await fan.updateMe({ name, bio, avatar: avatar || undefined }); onSaved(); } catch (x) { setErr(x.message); }
      }}>
        <header><b>Edit fan profile</b></header>
        <button type="button" className="sheet__avatar" onClick={() => file.current.click()}>
          <Avatar src={avatar || profile.avatar} name={name} size={72} /><span><Camera size={14} /> Change photo</span>
        </button>
        <input ref={file} type="file" accept="image/*" hidden onChange={async (e) => { try { setAvatar(await readImage(e.target.files[0], 400)); } catch (x) { setErr(x.message); } }} />
        <input className="sheet__input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Display name" maxLength={30} />
        <textarea value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Short bio" maxLength={160} rows={3} />
        {err && <p className="error-note">{err}</p>}
        <footer><button type="button" className="club-btn" onClick={onClose}>Cancel</button><button className="club-btn club-btn--primary">Save</button></footer>
      </form>
    </div>
  );
}
