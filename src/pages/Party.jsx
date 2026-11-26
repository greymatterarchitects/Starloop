import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, BarChart3, Lock, PartyPopper, Plus, Send, Users, X } from 'lucide-react';
import { timeAgo } from '../api.js';
import { fanGet, fanPost, useFan } from '../fan.js';
import { Avatar, Skel } from '../components/ui.jsx';
import { AuthSheet } from './StarClub.jsx';

const enc = encodeURIComponent;

/** Release-day watch party: live chat, emoji bursts and live polls for fans who checked in. */
export default function Party() {
  const { id } = useParams();
  const nav = useNavigate();
  const fan = useFan();
  const [info, setInfo] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [poll, setPoll] = useState(null);
  const [online, setOnline] = useState(0);
  const [bursts, setBursts] = useState([]);
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [need, setNeed] = useState(null);
  const [pollForm, setPollForm] = useState(false);
  const end = useRef();

  const load = useCallback(() => fanGet(`/api/fans/party/${enc(id)}`).then((d) => {
    setInfo(d); setMsgs(d.messages); setPoll(d.poll); setOnline(d.online);
  }).catch((e) => setErr(e.message)), [id, fan.id]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!info?.open) return;
    const es = new EventSource(`/api/fans/party/${enc(id)}/stream`);
    es.addEventListener('message', (e) => setMsgs((m) => [...m.slice(-200), JSON.parse(e.data)]));
    es.addEventListener('poll', (e) => { const p = JSON.parse(e.data); setPoll((old) => ({ ...p, mine: old?.id === p.id ? old.mine : null })); });
    es.addEventListener('presence', (e) => setOnline(JSON.parse(e.data).online));
    es.addEventListener('reaction', (e) => {
      const { emoji } = JSON.parse(e.data);
      const b = { id: Math.random(), emoji, x: 10 + Math.random() * 80 };
      setBursts((list) => [...list.slice(-30), b]);
      setTimeout(() => setBursts((list) => list.filter((x) => x !== b)), 2600);
    });
    return () => es.close();
  }, [info?.open, id]);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [msgs.length]);

  const act = async (fn) => {
    setErr('');
    if (!fan.registered) return setNeed(() => fn);
    try { await fn(); } catch (e) { if (e.status === 401) setNeed(() => fn); else setErr(e.message); }
  };
  const send = (e) => { e.preventDefault(); if (text.trim()) act(async () => { await fanPost(`/api/fans/party/${enc(id)}/message`, { text }); setText(''); }); };
  const react = (emoji) => act(() => fanPost(`/api/fans/party/${enc(id)}/react`, { emoji }));
  const vote = (option) => act(async () => setPoll(await fanPost(`/api/fans/party/${enc(id)}/vote`, { option })));

  const film = info?.film;
  return (
    <div className="page page--party">
      <header className="party-head">
        <button className="club-hero__btn" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={20} /></button>
        <div className="party-head__title">
          <small><PartyPopper size={12} /> Watch party</small>
          <b>{film?.title || <Skel w={120} h={16} />}</b>
          {info && <span>{info.star.name} · <Users size={11} /> {online} here</span>}
        </div>
        {film?.poster ? <img className="party-head__poster" src={film.poster} alt="" referrerPolicy="no-referrer" /> : <span />}
      </header>

      {info && !info.open && (
        <div className="party-locked">
          <Lock size={28} />
          <b>{film ? 'The party opens on release day' : 'No release to celebrate yet'}</b>
          {film?.date && <p>{film.title} releases {new Date(film.date).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}. Check in as “Going” in {info.star.name}’s club so you can join the chat, reactions and polls.</p>}
          <button className="club-btn club-btn--primary" onClick={() => nav(`/star/${enc(id)}`)}>Go to the club</button>
        </div>
      )}

      {info?.open && (
        <>
          <div className="party-bursts" aria-hidden>{bursts.map((b) => <span key={b.id} style={{ left: `${b.x}%` }}>{b.emoji}</span>)}</div>
          {poll && (
            <div className="party-poll">
              <b><BarChart3 size={14} /> {poll.question}</b>
              {poll.options.map((o, i) => {
                const total = poll.counts.reduce((a, c) => a + c, 0) || 1;
                const pct = Math.round((poll.counts[i] / total) * 100);
                return (
                  <button key={i} className={poll.mine === i ? 'is-mine' : ''} onClick={() => vote(i)} disabled={!info.canTalk}>
                    <i style={{ width: `${pct}%` }} /><span>{o}</span><em>{poll.counts[i]}</em>
                  </button>
                );
              })}
              {poll.by && <small>Poll by {poll.by.name}</small>}
            </div>
          )}
          {!info.canTalk && <p className="party-note">You’re watching. Check in as “Going” or “Watched it” in the club to chat, react and vote.</p>}
          <div className="party-msgs">
            {msgs.length === 0 && <p className="empty">The party just started. Say hi!</p>}
            {msgs.map((m) => (
              <div key={m.id} className={`msg ${m.user.id === fan.id ? 'msg--me' : ''}`}>
                <Avatar src={m.user.avatar} name={m.user.name} size={28} />
                <div><small>{m.user.name} · {timeAgo(m.at)}</small><p>{m.text}</p></div>
              </div>
            ))}
            <div ref={end} />
          </div>
          {err && <p className="error-note">{err}</p>}
          <div className="party-reacts">
            {info.reactions.map((r) => <button key={r} onClick={() => react(r)} disabled={!info.canTalk} aria-label={`React ${r}`}>{r}</button>)}
            <button className="party-reacts__poll" onClick={() => setPollForm(true)} disabled={!info.canTalk} aria-label="Start a poll"><Plus size={14} /> Poll</button>
          </div>
          <form className="composer" onSubmit={send}>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder={info.canTalk ? 'Say something…' : 'Check in to chat'} maxLength={300} disabled={!info.canTalk} />
            <button aria-label="Send" disabled={!info.canTalk}><Send size={20} /></button>
          </form>
        </>
      )}

      {pollForm && <PollForm onClose={() => setPollForm(false)} onCreate={(q, opts) => act(async () => { setPoll(await fanPost(`/api/fans/party/${enc(id)}/poll`, { question: q, options: opts })); setPollForm(false); })} />}
      {need && <AuthSheet fan={fan} onClose={() => setNeed(null)} onDone={async () => { const fn = need; setNeed(null); await load(); await act(fn); }} />}
    </div>
  );
}

function PollForm({ onClose, onCreate }) {
  const [q, setQ] = useState('');
  const [opts, setOpts] = useState(['', '']);
  const [err, setErr] = useState('');
  return (
    <div className="sheet" onClick={onClose}>
      <form className="sheet__panel" onClick={(e) => e.stopPropagation()} onSubmit={(e) => {
        e.preventDefault();
        const o = opts.map((x) => x.trim()).filter(Boolean);
        if (!q.trim() || o.length < 2) return setErr('Add a question and at least 2 options');
        onCreate(q.trim(), o);
      }}>
        <header><b><BarChart3 size={16} /> Start a live poll</b><button type="button" onClick={onClose} aria-label="Close"><X size={20} /></button></header>
        <input className="sheet__input" value={q} onChange={(e) => { setErr(''); setQ(e.target.value); }} placeholder="e.g. Best scene so far?" maxLength={120} autoFocus />
        {opts.map((o, i) => <input key={i} className="sheet__input" value={o} onChange={(e) => { setErr(''); setOpts((a) => a.map((x, j) => (j === i ? e.target.value : x))); }} placeholder={`Option ${i + 1}`} maxLength={40} />)}
        {opts.length < 4 && <button type="button" className="sheet__icon" onClick={() => setOpts((a) => [...a, ''])}><Plus size={14} /> Add option</button>}
        {err && <p className="error-note">{err}</p>}
        <footer><span /><button className="club-btn club-btn--primary">Start poll</button></footer>
      </form>
    </div>
  );
}
