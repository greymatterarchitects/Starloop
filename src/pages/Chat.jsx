import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, MessageSquareMore, Send } from 'lucide-react';
import { timeAgo, useApi, useLocal } from '../api.js';
import { Avatar, BottomNavDiscover, Logo, ProfileAvatar, Skel } from '../components/ui.jsx';

export default function Chat() {
  const { data } = useApi('/api/chat/rooms', 15_000);
  return (
    <div className="page page--disc">
      <header className="topbar topbar--disc"><Logo variant="solid" /><div className="topbar__right"><ProfileAvatar ring="orange" /></div></header>
      <h1 className="disc-title">Chat</h1>
      <p className="disc-sub">Real-time fan rooms · messages appear instantly for everyone</p>
      <div className="rooms">
        {!data && Array.from({ length: 5 }, (_, i) => <Skel key={i} h={66} r={16} />)}
        {(data || []).map((r) => (
          <Link key={r.id} to={`/chat/${r.id}`} className="room">
            <span className="room__icon"><MessageSquareMore size={22} /></span>
            <span className="room__body">
              <b>{r.label}</b>
              <small>{r.last ? `${r.last.name}: ${r.last.text}` : 'No messages yet — start the conversation'}</small>
            </span>
            <span className="room__meta">{r.online > 0 && <i>{r.online} online</i>}{r.last && <small>{timeAgo(r.last.at)}</small>}</span>
          </Link>
        ))}
      </div>
      <BottomNavDiscover />
    </div>
  );
}

export function ChatRoom() {
  const { room } = useParams();
  const nav = useNavigate();
  const [me, setMe] = useLocal('starloop:me', { name: '', favorite: null });
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [name, setName] = useState(me.name);
  const [live, setLive] = useState(false);
  const end = useRef();

  useEffect(() => {
    const es = new EventSource(`/api/chat/${room}/stream`);
    es.addEventListener('init', (e) => { setMsgs(JSON.parse(e.data)); setLive(true); });
    es.addEventListener('message', (e) => setMsgs((m) => [...m, JSON.parse(e.data)]));
    es.onerror = () => setLive(false);
    return () => es.close();
  }, [room]);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs.length]);

  const send = async (e) => {
    e.preventDefault();
    if (!me.name) { if (name.trim()) setMe({ ...me, name: name.trim() }); return; }
    if (!text.trim()) return;
    await fetch(`/api/chat/${room}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: me.name, text }) });
    setText('');
  };

  return (
    <div className="page page--disc page--chat">
      <button className="back" onClick={() => nav('/chat')}><ChevronLeft size={22} /> Rooms</button>
      <h1 className="disc-title" style={{ fontSize: 28, textTransform: 'capitalize' }}>{room === 'all' ? 'StarLoop Lounge' : `${room} Fans`}</h1>
      <p className="disc-sub"><span className={`live-dot ${live ? 'on' : ''}`} /> {live ? 'Live' : 'Connecting…'}</p>
      <div className="msgs">
        {msgs.length === 0 && <p className="empty">No messages yet. Say hi 👋</p>}
        {msgs.map((m) => (
          <div key={m.id} className={`msg ${m.name === me.name ? 'msg--me' : ''}`}>
            <Avatar name={m.name} size={30} />
            <div><small>{m.name} · {timeAgo(m.at)}</small><p>{m.text}</p></div>
          </div>
        ))}
        <div ref={end} />
      </div>
      <form className="composer" onSubmit={send}>
        {me.name ? (
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={`Message as ${me.name}…`} maxLength={500} />
        ) : (
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Pick a display name to join" maxLength={30} />
        )}
        <button aria-label="Send"><Send size={20} /></button>
      </form>
    </div>
  );
}
