import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { INDUSTRY_CHIPS, timeAgo, useApi } from '../api.js';
import { BottomNavDiscover, ErrorNote, Skel } from '../components/ui.jsx';

export function ClubDetail() {
  const { key } = useParams();
  const [sp] = useSearchParams();
  const industry = sp.get('industry') || 'all';
  const nav = useNavigate();
  const { data, loading, error } = useApi(`/api/clubs/${key}${industry === 'all' ? '' : `?industry=${industry}`}`);
  const label = INDUSTRY_CHIPS.find(([id]) => id === industry)?.[1] || 'All Industries';
  return (
    <div className="page page--disc">
      <button className="back" onClick={() => nav(-1)}><ChevronLeft size={22} /> Back</button>
      <h1 className="disc-title">{data?.title || '…'}</h1>
      <p className="disc-sub">{label} · live news</p>
      <ErrorNote error={error} />
      <div className="news-list">
        {loading && !data && Array.from({ length: 5 }, (_, i) => <Skel key={i} h={96} r={16} />)}
        {(data?.items || []).map((n) => (
          <a key={n.url} className="news" href={n.url} target="_blank" rel="noreferrer">
            {n.image && <img src={n.image} alt="" loading="lazy" referrerPolicy="no-referrer" />}
            <span><b>{n.title}</b><small>{n.source} · {timeAgo(n.publishedAt)}</small></span>
          </a>
        ))}
      </div>
      <BottomNavDiscover />
    </div>
  );
}
