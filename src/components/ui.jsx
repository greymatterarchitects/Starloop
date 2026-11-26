import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Bell, House, UsersRound, MessageSquareMore, Plus, Star, User } from 'lucide-react';
import { timeAgo, useLocal, useSeen } from '../api.js';
import { fanGet, fanPost, useFan } from '../fan.js';

/* ---------- Logo ---------- */
export function Logo({ variant = 'outline' }) {
  if (variant === 'solid') {
    return (
      <div className="logo logo--solid">
        <svg viewBox="0 0 48 44" width="46" height="42" aria-hidden>
          <defs>
            <linearGradient id="lgS" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stopColor="#c8102e" />
              <stop offset=".55" stopColor="#f0521f" />
              <stop offset="1" stopColor="#ffbf2f" />
            </linearGradient>
          </defs>
          <path fill="url(#lgS)" d="M27 2l4.6 12.6L45 15.3l-10.6 8.4L38 37l-11-7.6-11.8 7.4 4-13.2L1 21.8l17.6-1.6z" />
          <path fill="#fff" opacity=".22" d="M27 2l4.6 12.6L45 15.3 27 20z" />
        </svg>
        <span>StarLoop</span>
      </div>
    );
  }
  return (
    <div className="logo logo--outline">
      <svg viewBox="0 0 48 48" width="44" height="44" aria-hidden>
        <defs>
          <linearGradient id="lgO" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#e2557a" />
            <stop offset=".5" stopColor="#9b2a5c" />
            <stop offset="1" stopColor="#e7a33e" />
          </linearGradient>
        </defs>
        <path fill="none" stroke="url(#lgO)" strokeWidth="3.4" strokeLinejoin="round" d="M24 4l5.6 12.6 13.6 1.3-10.3 9 3 13.4L24 33.2l-11.9 7.1 3-13.4-10.3-9 13.6-1.3z" />
        <path fill="none" stroke="url(#lgO)" strokeWidth="2.4" strokeLinecap="round" d="M6 34c8 6 24 8 36-6" opacity=".85" />
      </svg>
      <span>StarLoop</span>
    </div>
  );
}

/* ---------- Avatar with graceful fallback (initials) ---------- */
export function Avatar({ src, name = '', size = 48, className = '', style }) {
  const [broken, setBroken] = useState(false);
  const initials = name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  return (
    <span className={`avatar ${className}`} style={{ width: size, height: size, ...style }}>
      {src && !broken ? (
        <img src={src} alt={name} loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
      ) : (
        <span className="avatar__initials" style={{ fontSize: size * 0.36 }}>{initials || <User size={size * 0.5} />}</span>
      )}
    </span>
  );
}

export function ProfileAvatar({ ring = 'pink' }) {
  const [me] = useLocal('starloop:me', { name: '', favorite: null });
  const nav = useNavigate();
  return (
    <button className={`me-avatar me-avatar--${ring}`} onClick={() => nav('/profile')} aria-label="Your profile">
      <Avatar src={me.favorite?.image} name={me.name || 'You'} size={ring === 'orange' ? 54 : 44} />
    </button>
  );
}

/* Alerts bell: news about stars you follow + likes, comments, shares, follows, campaign and rank updates. */
export function BellButton({ dot = 'red', plain }) {
  const fan = useFan();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const box = useRef();
  const load = useCallback(() => { if (fan.registered) fanGet('/api/fans/notifications').then(setData).catch(() => {}); }, [fan.registered]);
  useEffect(() => { load(); const t = setInterval(load, 60_000); return () => clearInterval(t); }, [load]);
  useEffect(() => {
    const h = (e) => open && !box.current?.contains(e.target) && setOpen(false);
    document.addEventListener('pointerdown', h);
    return () => document.removeEventListener('pointerdown', h);
  }, [open]);
  const toggle = () => {
    setOpen((o) => !o);
    if (!open && data?.unread) fanPost('/api/fans/notifications/read').then(() => setTimeout(load, 800)).catch(() => {});
  };
  const unread = data?.unread || 0;
  return (
    <div className="bell-wrap" ref={box}>
      <button className={`bell ${plain ? 'bell--plain' : ''}`} aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`} onClick={toggle}>
        <Bell size={plain ? 28 : 21} strokeWidth={1.8} />
        {unread > 0 ? <i className={`bell__count bell__count--${dot}`}>{unread > 9 ? '9+' : unread}</i> : null}
      </button>
      {open && (
        <div className="alerts" role="dialog" aria-label="Notifications">
          <header><b>Alerts</b>{fan.registered && <small>{data?.items?.length || 0} recent</small>}</header>
          {!fan.registered && <p className="alerts__empty">Sign in on your <button onClick={() => { setOpen(false); nav('/profile'); }}>Profile</button> to get alerts about stars you follow and fans who engage with your posts.</p>}
          {fan.registered && !data?.items?.length && <p className="alerts__empty">No alerts yet. Follow a star to get their breaking news here.</p>}
          {fan.registered && (data?.items || []).map((n) => {
            const content = (
              <>
                <Avatar src={n.actor?.avatar || n.image} name={n.actor?.name || n.text} size={34} />
                <span><b className={`alerts__type alerts__type--${n.type}`}>{ALERT_LABEL[n.type] || n.type}</b><span className="alerts__text">{n.text}</span><small>{timeAgo(n.at)}</small></span>
                {!n.read && <i className="alerts__dot" />}
              </>
            );
            return n.external
              ? <a key={n.id} className="alerts__item" href={n.link} target="_blank" rel="noreferrer">{content}</a>
              : <button key={n.id} className="alerts__item" onClick={() => { setOpen(false); nav(n.link); }}>{content}</button>;
          })}
        </div>
      )}
    </div>
  );
}
const ALERT_LABEL = { news: 'Breaking', like: 'Like', comment: 'Comment', share: 'Share', follow: 'New follower', campaign: 'Campaign', rank: 'Top Fans' };

/* ---------- Laurel rank badge ---------- */
const LAUREL = { 1: '#d6a243', 2: '#a3a3ad', 3: '#c27a4e' };
export function Laurel({ rank }) {
  const c = LAUREL[rank] || '#c9a6b4';
  const leaves = [];
  for (let i = 0; i < 6; i++) {
    const deg = 128 + i * 22; // left side of the wreath, top → bottom
    const a = (deg * Math.PI) / 180;
    const x = 20 + 13.5 * Math.cos(a);
    const y = 21 - 13.5 * Math.sin(a);
    const rot = -deg + 25;
    leaves.push(<ellipse key={`l${i}`} cx={x} cy={y} rx="1.7" ry="3.6" fill={c} transform={`rotate(${rot} ${x} ${y})`} />);
    const x2 = 40 - x;
    leaves.push(<ellipse key={`r${i}`} cx={x2} cy={y} rx="1.7" ry="3.6" fill={c} transform={`rotate(${-rot} ${x2} ${y})`} />);
  }
  leaves.push(<path key="stem" d="M9 32 Q20 39 31 32" fill="none" stroke={c} strokeWidth="1.2" />);
  return (
    <svg className="laurel" viewBox="0 0 40 40" width="38" height="38" aria-label={`Rank ${rank}`}>
      {leaves}
      <text x="20" y="25.5" textAnchor="middle" fontSize="15" fontWeight="700" fill={c} fontFamily="Outfit, sans-serif">{rank}</text>
    </svg>
  );
}

export function Verified({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="verified" aria-label="Verified">
      <path fill="#7c4dbe" d="M12 1.5l2.6 1.9 3.2-.2 1 3.1 2.6 1.9-1 3.1 1 3.1-2.6 1.9-1 3.1-3.2-.2L12 22.5l-2.6-1.9-3.2.2-1-3.1L2.6 15.8l1-3.1-1-3.1 2.6-1.9 1-3.1 3.2.2z" />
      <path fill="none" stroke="#fff" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" d="M8 12.3l2.7 2.7L16.3 9.4" />
    </svg>
  );
}

export const Skel = ({ w = '100%', h = 16, r = 8, style }) => <span className="skel" style={{ width: w, height: h, borderRadius: r, ...style }} />;

export function ErrorNote({ error }) {
  if (!error) return null;
  return <p className="error-note">Couldn’t reach the live source ({error}). Retrying automatically…</p>;
}

/* ---------- Bottom navigation (two variants from the designs) ---------- */
export function BottomNavHome() {
  const nav = useNavigate();
  return (
    <nav className="bnav bnav--home">
      <NavLink to="/" end className="bnav__item"><House size={24} fill="currentColor" strokeWidth={1.6} /><span>Home</span></NavLink>
      <NavLink to="/clubs" className="bnav__item"><UsersRound size={24} strokeWidth={1.6} /><span>Clubs</span></NavLink>
      <button className="bnav__fab bnav__fab--plum" aria-label="New message in the Lounge" onClick={() => nav('/chat/all')}><Plus size={30} strokeWidth={2.2} /></button>
      <NavLink to="/chat" className="bnav__item"><MessageSquareMore size={24} strokeWidth={1.6} /><span>Chat</span></NavLink>
      <NavLink to="/profile" className="bnav__item"><User size={24} strokeWidth={1.6} /><span>Profile</span></NavLink>
    </nav>
  );
}

export function BottomNavDiscover({ onStar }) {
  return (
    <nav className="bnav bnav--disc">
      <NavLink to="/" end className="bnav__item"><House size={26} strokeWidth={1.6} /><span>Home</span></NavLink>
      <NavLink to="/clubs" className="bnav__item"><UsersRound size={26} strokeWidth={1.6} /><span>Clubs</span></NavLink>
      <button className="bnav__fab bnav__fab--orange" aria-label="Star spotlight" onClick={onStar}><Star size={30} fill="#fff" strokeWidth={0} /></button>
      <NavLink to="/chat" className="bnav__item"><MessageSquareMore size={26} strokeWidth={1.6} /><span>Chat</span></NavLink>
      <NavLink to="/profile" className="bnav__item"><User size={26} strokeWidth={1.6} /><span>Profile</span></NavLink>
    </nav>
  );
}

export function Chips({ items, value, onChange, variant = 'home' }) {
  return (
    <div className={`chips chips--${variant}`}>
      {items.map(([id, label]) => (
        <button key={id} className={`chip ${value === id ? 'is-active' : ''}`} onClick={() => onChange(id)}>{label}</button>
      ))}
    </div>
  );
}

/* Story ring: gradient when unseen, soft grey once viewed; ▲ badge when the star's page views are rising this week. */
export function StoryRing({ star, size = 60, ring = 'ring--sunset', onClick, label = star.name }) {
  const isSeen = useSeen()(star.id || star.name);
  return (
    <button className="story-ring" onClick={onClick} title={star.growthPct != null ? `${star.growthPct >= 0 ? '+' : ''}${star.growthPct}% page views this week` : undefined}>
      <span className={`ring ${isSeen ? 'ring--seen' : ring}`}>
        <Avatar src={star.image} name={star.name} size={size} />
        {star.growthPct > 0 && <i className="ring__badge" aria-label="Rising this week">▲</i>}
      </span>
      <span className="story-ring__name">{label}</span>
    </button>
  );
}

/* Overlapping avatar stack with a "+N" bubble. */
export function AvatarStack({ people = [], max = 3, size = 30, total }) {
  const shown = people.slice(0, max);
  const rest = (total ?? people.length) - shown.length;
  return (
    <span className="astack" style={{ '--s': `${size}px` }}>
      {shown.map((p) => <Avatar key={p.id || p.name} src={p.image} name={p.name} size={size} />)}
      {rest > 0 && <span className="astack__more">+{rest}</span>}
    </span>
  );
}
