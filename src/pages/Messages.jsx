import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, CheckCheck, MessageSquarePlus, MessagesSquare, Search, Send, Users, X } from 'lucide-react';
import { timeAgo, useApi } from '../api.js';
import { fanGet, fanPost, useFan } from '../fan.js';
import { Avatar, BottomNavDiscover, Logo, ProfileAvatar, Skel } from '../components/ui.jsx';
import { AuthSheet } from './StarClub.jsx';

/* Live updates for the signed-in fan's direct messages. */
function useDmStream(onMessage) {
  const fan = useFan();
  const cb = useRef(onMessage);
  cb.current = onMessage;
  useEffect(() => {
    if (!fan.registered) return;
    const token = JSON.parse(localStorage.getItem('starloop:session') || 'null')?.token;
    if (!token) return;
    const es = new EventSource(`/api/fans/dm/stream?token=${token}`);
    es.addEventListener('dm', (e) => cb.current(JSON.parse(e.data)));
    return () => es.close();
  }, [fan.registered, fan.id]);
}

/* ---------- Inbox ---------- */
export default function Messages() {
  const fan = useFan();
  const nav = useNavigate();
  const [tab, setTab] = useState('direct');
  const [data, setData] = useState(null);
  const [q, setQ] = useState('');
  const [newChat, setNewChat] = useState(false);
  const [auth, setAuth] = useState(false);
  const rooms = useApi('/api/chat/rooms', 15_000);
  const load = useCallback(() => (fan.registered ? fanGet('/api/fans/dm').then(setData).catch(() => {}) : setData(null)), [fan.registered, fan.id]);
  useEffect(() => { load(); }, [load]);
  useDmStream(() => load());

  const convs = useMemo(() => (data?.conversations || []).filter((c) => !q || c.user.name.toLowerCase().includes(q.toLowerCase())), [data, q]);

  return (
    <div className="page page--disc page--msgs">
      <header className="topbar topbar--disc"><Logo variant="solid" /><div className="topbar__right"><ProfileAvatar ring="orange" /></div></header>
      <div className="msgs-head">
        <h1 className="disc-title">Messages</h1>
        {fan.registered && <button className="msgs-new" onClick={() => setNewChat(true)} aria-label="New message"><MessageSquarePlus size={20} /></button>}
      </div>
      <div className="seg seg--wide msgs-tabs">
        <button className={tab === 'direct' ? 'is-active' : ''} onClick={() => setTab('direct')}>Direct{data?.unread ? <i className="msgs-tabs__dot">{data.unread}</i> : null}</button>
        <button className={tab === 'rooms' ? 'is-active' : ''} onClick={() => setTab('rooms')}>Fan rooms</button>
      </div>

      {tab === 'direct' && (
        <>
          {!fan.registered ? (
            <div className="msgs-empty">
              <MessagesSquare size={34} />
              <b>Chat one-to-one with other fans</b>
              <p>Sign in to send private messages to fans you meet in clubs, battles and watch parties.</p>
              <button className="club-btn club-btn--primary" onClick={() => setAuth(true)}>Sign up / Log in</button>
            </div>
          ) : (
            <>
              <label className="msgs-search"><Search size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search conversations" /></label>
              {!data && Array.from({ length: 4 }, (_, i) => <Skel key={i} h={64} r={18} />)}
              {data && convs.length === 0 && (
                <div className="msgs-empty">
                  <MessagesSquare size={30} />
                  <b>No conversations yet</b>
                  <p>Open a fan’s profile and tap Message, or start one here.</p>
                  <button className="club-btn club-btn--primary" onClick={() => setNewChat(true)}>New message</button>
                </div>
              )}
              <div className="convs">
                {convs.map((c) => (
                  <Link key={c.user.id} to={`/messages/${c.user.id}`} className={`conv ${c.unread ? 'is-unread' : ''}`}>
                    <span className="conv__av"><Avatar src={c.user.avatar} name={c.user.name} size={50} /></span>
                    <span className="conv__body">
                      <b>{c.user.name}</b>
                      <small>{c.last.mine ? 'You: ' : ''}{c.last.text}</small>
                    </span>
                    <span className="conv__meta">
                      <small>{timeAgo(c.last.at)}</small>
                      {c.unread > 0 && <i>{c.unread}</i>}
                    </span>
                  </Link>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {tab === 'rooms' && (
        <div className="rooms">
          {!rooms.data && Array.from({ length: 5 }, (_, i) => <Skel key={i} h={66} r={16} />)}
          {(rooms.data || []).map((r) => (
            <Link key={r.id} to={`/chat/${r.id}`} className="room">
              <span className="room__icon"><Users size={20} /></span>
              <span className="room__body"><b>{r.label}</b><small>{r.last ? `${r.last.name}: ${r.last.text}` : 'No messages yet — start the conversation'}</small></span>
              <span className="room__meta">{r.online > 0 && <i>{r.online} online</i>}{r.last && <small>{timeAgo(r.last.at)}</small>}</span>
            </Link>
          ))}
        </div>
      )}

      {newChat && <NewChat onClose={() => setNewChat(false)} onPick={(u) => nav(`/messages/${u.id}`)} />}
      {auth && <AuthSheet fan={fan} onClose={() => setAuth(false)} onDone={() => setAuth(false)} />}
      <BottomNavDiscover />
    </div>
  );
}

function NewChat({ onClose, onPick }) {
  const [q, setQ] = useState('');
  const [list, setList] = useState(null);
  useEffect(() => {
    const t = setTimeout(() => fanGet(`/api/fans/dm-contacts${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`).then(setList).catch(() => setList([])), 200);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="sheet" onClick={onClose}>
      <div className="sheet__panel sheet__panel--tall" onClick={(e) => e.stopPropagation()}>
        <header><b>New message</b><button onClick={onClose} aria-label="Close"><X size={20} /></button></header>
        <label className="msgs-search"><Search size={16} /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search fans by name" /></label>
        {!q && <small className="page-sub" style={{ margin: 0 }}>Fans you follow and fans who follow you</small>}
        {list && list.length === 0 && <p className="empty">{q ? 'No fans found' : 'Follow some fans first, or search by name.'}</p>}
        {(list || []).map((u) => (
          <button key={u.id} className="contact" onClick={() => onPick(u)}>
            <Avatar src={u.avatar} name={u.name} size={40} />
            <span><b>{u.name}</b><small>@{u.handle}{u.followsYou ? ' · follows you' : ''}</small></span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------- One conversation ---------- */
const dayLabel = (iso) => {
  const d = new Date(iso), t = new Date();
  const y = new Date(Date.now() - 864e5);
  if (d.toDateString() === t.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
};
const clock = (iso) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

export function MessageThread() {
  const { userId } = useParams();
  const nav = useNavigate();
  const fan = useFan();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const end = useRef();
  const load = useCallback(() => fanGet(`/api/fans/dm/${userId}`).then((d) => { setData(d); setError(''); }).catch((e) => setError(e.message)), [userId, fan.id]);
  useEffect(() => { if (fan.registered) load(); }, [load, fan.registered]);
  useDmStream((m) => {
    if ((m.mine && m.to === userId) || (!m.mine && m.from === userId)) {
      setData((d) => (d && !d.messages.some((x) => x.id === m.id) ? { ...d, messages: [...d.messages, m] } : d));
      if (!m.mine) fanGet(`/api/fans/dm/${userId}`).catch(() => {}); // mark read
    }
  });
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [data?.messages.length]);

  const send = async (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t || sending) return;
    setSending(true); setError('');
    try {
      const m = await fanPost(`/api/fans/dm/${userId}`, { text: t });
      setText('');
      setData((d) => (d.messages.some((x) => x.id === m.id) ? d : { ...d, messages: [...d.messages, m] }));
    } catch (x) { setError(x.message); } finally { setSending(false); }
  };

  if (!fan.registered) return <div className="page page--disc"><button className="back" onClick={() => nav('/chat')}><ArrowLeft size={18} /> Messages</button><p className="empty">Sign in from the Messages tab to chat.</p></div>;

  const msgs = data?.messages || [];
  return (
    <div className="page page--thread">
      <header className="thread-head">
        <button className="club-hero__btn" onClick={() => nav('/chat')} aria-label="Back"><ArrowLeft size={20} /></button>
        {data ? (
          <Link to={`/fan/${data.user.id}`} className="thread-head__who">
            <Avatar src={data.user.avatar} name={data.user.name} size={40} />
            <span><b>{data.user.name}</b><small>@{data.user.handle}{data.followsYou ? ' · follows you' : ''}</small></span>
          </Link>
        ) : <Skel w={160} h={40} r={20} />}
      </header>
      <div className="thread">
        {data && msgs.length === 0 && (
          <div className="thread-hello">
            <Avatar src={data.user.avatar} name={data.user.name} size={72} />
            <b>{data.user.name}</b>
            <small>Say hi to start your conversation</small>
          </div>
        )}
        {msgs.map((m, i) => {
          const prev = msgs[i - 1];
          const newDay = !prev || new Date(prev.at).toDateString() !== new Date(m.at).toDateString();
          const grouped = prev && !newDay && prev.mine === m.mine && new Date(m.at) - new Date(prev.at) < 5 * 60_000;
          return (
            <div key={m.id}>
              {newDay && <p className="thread-day">{dayLabel(m.at)}</p>}
              <div className={`bubble ${m.mine ? 'bubble--me' : ''} ${grouped ? 'is-grouped' : ''}`}>
                <p>{m.text}</p>
                <small>{clock(m.at)}{m.mine && (i === msgs.length - 1 ? <CheckCheck size={12} /> : <Check size={12} />)}</small>
              </div>
            </div>
          );
        })}
        <div ref={end} />
      </div>
      {error && <p className="error-note">{error}</p>}
      <form className="composer thread-composer" onSubmit={send}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Message…" maxLength={1000} autoFocus />
        <button aria-label="Send" disabled={!text.trim() || sending}><Send size={19} /></button>
      </form>
    </div>
  );
}
