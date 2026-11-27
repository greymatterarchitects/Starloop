import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, ChevronRight } from 'lucide-react';
import { INDUSTRY_CHIPS, readCache, useApi, useLocal, writeCache } from '../api.js';
import { Avatar, StoryRing, BellButton, BottomNavHome, Chips, ErrorNote, Laurel, Logo, ProfileAvatar, Skel, Verified } from '../components/ui.jsx';
import SearchBox from '../components/SearchBox.jsx';
import FeedCard from '../components/FeedCard.jsx';
import BattleCard from '../components/BattleCard.jsx';
import TrendTiles from '../components/TrendTiles.jsx';
import { AuthSheet } from './StarClub.jsx';
import { fanGet, useFan } from '../fan.js';

export default function Home() {
  const [industry, setIndustry] = useLocal('starloop:homeIndustry', 'tollywood');
  const [scope, setScope] = useState('india');
  const nav = useNavigate();
  const openClub = (s) => nav(`/star/${encodeURIComponent(s.id)}`);
  const stars = useApi(`/api/stars?industry=${industry}&scope=global`);
  const ranked = useApi(`/api/stars?industry=${industry}&scope=${scope}&limit=3`);
  const fan = useFan();
  const [feed, setFeed] = useState({ data: null, error: null });
  const feedKey = `feed:${industry}:${fan.id || 'anon'}`;
  const loadFeed = useCallback(() => fanGet(`/api/fans/feed?industry=${industry}`).then((d) => { writeCache(feedKey, d); setFeed({ data: d, error: null }); }).catch((e) => setFeed((f) => ({ ...f, error: f.data ? null : e.message }))), [industry, fan.id]);
  useEffect(() => { setFeed({ data: readCache(feedKey), error: null }); loadFeed(); const t = setInterval(loadFeed, 5 * 60_000); return () => clearInterval(t); }, [loadFeed]);
  const [need, setNeed] = useState(null);
  const requireFan = async (fn) => { if (!fan.registered) return setNeed(() => fn); try { await fn(); } catch (e) { if (e.status === 401) setNeed(() => fn); } };
  const list = stars.data?.stars || [];

  return (
    <div className="page page--home">
      <header className="topbar">
        <Logo />
        <div className="topbar__right">
          <BellButton />
          <ProfileAvatar />
        </div>
      </header>

      <SearchBox />

      <div className="stories">
        {list.length
          ? list.map((s) => (
              <StoryRing key={s.id} star={s} onClick={() => openClub(s)} />
            ))
          : Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="story-ring"><Skel w={66} h={66} r={99} /><Skel w={52} h={10} style={{ marginTop: 8 }} /></div>
            ))}
      </div>

      <Chips items={INDUSTRY_CHIPS} value={industry} onChange={setIndustry} />

      <TrendTiles stars={list.slice(0, 8)} />

      <section className="card trending">
        <div className="trending__head">
          <div>
            <h2>Trending Stars</h2>
            <p title="Ranked from live Wikipedia page-view data for the last 7 days">Real-time popularity across the film world</p>
          </div>
          <div className="trending__right">
            <div className="seg">
              <button className={scope === 'india' ? 'is-active' : ''} onClick={() => setScope('india')}>India</button>
              <button className={scope === 'global' ? 'is-active' : ''} onClick={() => setScope('global')}>Global</button>
            </div>
            <Link to={`/trending?industry=${industry}`} className="trending__see">See All <ChevronRight size={16} /></Link>
          </div>
        </div>
        <ErrorNote error={ranked.error} />
        {(ranked.data?.stars || [null, null, null]).map((s, i) =>
          s ? (
            <button key={s.id} className="trow" onClick={() => openClub(s)}>
              <Laurel rank={s.rank} />
              <Avatar src={s.image} name={s.name} size={42} className="trow__av" />
              <span className="trow__who"><b>{s.name}</b><small>{s.role}</small></span>
              <span className="trow__bars">
                <Bar label="Trend Score" value={s.trend} kind="trend" />
                <Bar label="Engagement" value={s.engagement} kind="eng" />
              </span>
              <span className="trow__score"><small>Score</small><b>{s.score.toFixed(1)}</b></span>
            </button>
          ) : (
            <div key={i} className="trow"><Skel w={30} h={30} r={99} /><Skel w={42} h={42} r={99} /><Skel w="40%" h={26} /><Skel w={38} h={34} /></div>
          ),
        )}
      </section>

      <BattleCard industry={industry} fan={fan} requireFan={requireFan} />

      <h2 className="feed-title">{feed.data?.personal ? 'For you' : 'Latest from the stars'}</h2>
      {!fan.registered && <p className="feed-sub">Sign in and follow stars to get a feed made for you.</p>}
      <ErrorNote error={feed.error} />
      {!feed.data && <div className="card post"><Skel h={42} w="60%" /><Skel h={180} style={{ marginTop: 14 }} r={18} /></div>}
      {(feed.data?.items || []).map((item) => (
        <FeedCard key={item.key} item={item} fan={fan} requireFan={requireFan} onChange={loadFeed} stars={list} />
      ))}
      {need && <AuthSheet fan={fan} onClose={() => setNeed(null)} onDone={async () => { const fn = need; setNeed(null); await fn(); loadFeed(); }} />}

      <BottomNavHome />
    </div>
  );
}

function Bar({ label, value, kind }) {
  return (
    <span className="bar">
      <small>{label}</small>
      <span className={`bar__track bar__track--${kind}`}><i style={{ width: `${value}%` }} /></span>
      <em>{value}%</em>
    </span>
  );
}


