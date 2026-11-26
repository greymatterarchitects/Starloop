import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Swords, Trophy } from 'lucide-react';
import { fanGet, fanPost } from '../fan.js';
import { Avatar, Skel } from './ui.jsx';

const enc = encodeURIComponent;
const left = (iso) => {
  const ms = new Date(iso) - Date.now();
  const d = Math.floor(ms / 864e5), h = Math.floor((ms % 864e5) / 36e5);
  return ms <= 0 ? 'ended' : d > 0 ? `${d}d ${h}h left` : `${h}h left`;
};

/** Weekly Star vs Star battle for an industry. Votes from a star's Top 10 fans count double. */
export default function BattleCard({ industry, fan, requireFan }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const load = useCallback(() => fanGet(`/api/fans/battle?industry=${industry}`).then(setData).catch((e) => setErr(e.message)), [industry, fan.id]);
  useEffect(() => { setData(null); load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);
  const b = data?.current;
  const vote = (pick) => requireFan(async () => {
    setErr('');
    try { await fanPost('/api/fans/battle/vote', { industry, pick }); await load(); } catch (e) { if (e.status === 401) throw e; setErr(e.message); }
  });
  if (!data) return <section className="battle"><Skel h={150} r={22} /></section>;
  if (!b) return null;
  const total = b.a.weighted + b.b.weighted;
  const pa = total ? Math.round((b.a.weighted / total) * 100) : 50;
  const lastWinner = data.last && data.last.a.weighted !== data.last.b.weighted ? (data.last.a.weighted > data.last.b.weighted ? data.last.a : data.last.b) : null;
  const side = (k) => {
    const s = b[k];
    const mine = b.myVote === k;
    return (
      <div className={`battle__side battle__side--${k} ${mine ? 'is-mine' : ''}`}>
        <Link to={`/star/${enc(s.id)}`} className="battle__star">
          <span className="battle__ring"><Avatar src={s.image} name={s.name} size={64} /></span>
          <b>{s.name}</b>
        </Link>
        <span className="battle__votes">{s.weighted} {s.weighted === 1 ? "pt" : "pts"} · {s.votes} {s.votes === 1 ? "vote" : "votes"}</span>
        {b.myVote ? (mine && <span className="battle__mine">Your vote</span>) : <button className="battle__btn" onClick={() => vote(k)}>Vote</button>}
      </div>
    );
  };
  return (
    <section className="battle">
      <header className="battle__head">
        <b><Swords size={16} /> Star vs Star</b>
        <small>Week of {new Date(b.week).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · {left(b.endsAt)}</small>
      </header>
      <div className="battle__arena">
        {side('a')}
        <span className="battle__vs">VS</span>
        {side('b')}
      </div>
      <div className="battle__bar" aria-label={`${b.a.name} ${pa}%, ${b.b.name} ${100 - pa}%`}>
        <i style={{ width: `${pa}%` }} /><em>{pa}%</em><em>{100 - pa}%</em>
      </div>
      <p className="battle__note">One vote per fan. Votes from a star’s Top 10 fans count double.</p>
      {err && <p className="error-note">{err}</p>}
      {lastWinner && <p className="battle__last"><Trophy size={13} /> Last week’s champion: <Link to={`/star/${enc(lastWinner.id)}`}>{lastWinner.name}</Link></p>}
    </section>
  );
}
