import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { readCache, writeCache } from '../api.js';
import { Avatar, Skel } from './ui.jsx';

const enc = encodeURIComponent;

/** Top trending stars this week as tall photo tiles, each with its #1 fan tagged at the bottom. */
export default function TrendTiles({ stars }) {
  const ids = stars.map((s) => s.id).join(',');
  const key = `topfans:${ids}`;
  const [fans, setFans] = useState(() => readCache(key) || {});
  const pkey = `portraits:${ids}`;
  const [photos, setPhotos] = useState(() => readCache(pkey) || {});
  useEffect(() => {
    if (!ids) return;
    fetch(`/api/portraits?ids=${enc(ids)}`).then((r) => r.json()).then((d) => { setPhotos(d); writeCache(pkey, d); }).catch(() => {});
  }, [ids]);
  useEffect(() => {
    if (!ids) return;
    fetch(`/api/fans/topfans?ids=${enc(ids)}`).then((r) => r.json()).then((d) => { setFans(d); writeCache(key, d); }).catch(() => {});
  }, [ids]);

  return (
    <section className="ttiles-wrap">
      <div className="ttiles-head">
        <h2>Trending this week</h2>
        <small>Most-read stars · last 7 days</small>
      </div>
      <div className="ttiles">
        {stars.length === 0 && Array.from({ length: 3 }, (_, i) => <Skel key={i} w={104} h={152} r={22} style={{ flex: '0 0 auto' }} />)}
        {stars.map((s, i) => {
          const f = fans[s.id];
          return (
            <Link key={s.id} to={`/star/${enc(s.id)}`} className="ttile">
              <img src={photos[s.id]?.url || s.portrait || s.image} alt={s.name} title={photos[s.id] ? `Photo: ${photos[s.id].credit}${photos[s.id].license ? ` · ${photos[s.id].license}` : ''} · Wikimedia Commons` : undefined} loading={i < 3 ? 'eager' : 'lazy'} referrerPolicy="no-referrer" />
              <span className="ttile__shade" />
              <em className="ttile__tag">#{i + 1}</em>
              <b className="ttile__name">{s.name}</b>
              <span className={`ttile__fan ${f ? '' : 'is-empty'}`} title={f ? `Top fan: ${f.name} · ${f.points} pts` : 'No top fan yet — be the first'}>
                {f ? <Avatar src={f.avatar} name={f.name} size={24} /> : <Plus size={12} />}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
