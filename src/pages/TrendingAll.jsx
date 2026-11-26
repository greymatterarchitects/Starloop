import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { INDUSTRY_CHIPS, useApi } from '../api.js';
import { Avatar, BottomNavDiscover, ErrorNote, Laurel, Skel } from '../components/ui.jsx';

export default function TrendingAll() {
  const [sp] = useSearchParams();
  const industry = sp.get('industry') || 'all';
  const [scope, setScope] = useState('global');
  const nav = useNavigate();
  const openClub = (s) => nav(`/star/${encodeURIComponent(s.id)}`);
  const { data, error } = useApi(`/api/stars?${industry === 'all' ? '' : `industry=${industry}&`}scope=${scope}`);
  const label = INDUSTRY_CHIPS.find(([id]) => id === industry)?.[1] || 'All Industries';
  return (
    <div className="page page--disc">
      <button className="back" onClick={() => nav(-1)}><ChevronLeft size={22} /> Back</button>
      <div className="trending__head">
        <div>
          <h1 className="disc-title" style={{ fontSize: 30 }}>Trending Stars</h1>
          <p className="disc-sub">{label} · last 7 days of Wikipedia page views</p>
        </div>
        <div className="seg">
          <button className={scope === 'india' ? 'is-active' : ''} onClick={() => setScope('india')}>India</button>
          <button className={scope === 'global' ? 'is-active' : ''} onClick={() => setScope('global')}>Global</button>
        </div>
      </div>
      <ErrorNote error={error} />
      <div className="card" style={{ padding: '6px 12px' }}>
        {!data && Array.from({ length: 8 }, (_, i) => <div key={i} className="trow"><Skel h={42} /></div>)}
        {(data?.stars || []).map((s) => (
          <button key={s.id} className="trow trow--wide" onClick={() => openClub(s)}>
            <Laurel rank={s.rank} />
            <Avatar src={s.image} name={s.name} size={42} />
            <span className="trow__who"><b>{s.name}</b><small>{s.industryLabel} · {s.role}</small></span>
            <span className="trow__stat"><b>{s.weeklyViews.toLocaleString('en-IN')}</b><small>views / 7d</small></span>
            <span className={`trow__delta ${s.growthPct >= 0 ? 'up' : 'down'}`}>{s.growthPct >= 0 ? '▲' : '▼'} {Math.abs(s.growthPct)}%</span>
            <span className="trow__score"><small>Score</small><b>{s.score.toFixed(1)}</b></span>
          </button>
        ))}
      </div>
      <BottomNavDiscover />
    </div>
  );
}
