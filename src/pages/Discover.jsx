import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ChevronRight, Flame, Play, Search, Sparkles, TrendingUp } from 'lucide-react';
import { INDUSTRY_CHIPS, timeAgo, useApi, useLocal } from '../api.js';
import { Avatar, StoryRing, BellButton, BottomNavDiscover, Chips, ErrorNote, Logo, ProfileAvatar, Skel } from '../components/ui.jsx';
import SearchBox from '../components/SearchBox.jsx';

const RINGS = ['ring--orange', 'ring--coral', 'ring--magenta', 'ring--coral', 'ring--rose', 'ring--violet'];

export default function Discover() {
  const [industry, setIndustry] = useLocal('starloop:discIndustry', 'all');
  const [searching, setSearching] = useState(false);
  const nav = useNavigate();
  const openClub = (s) => nav(`/star/${encodeURIComponent(s.id)}`);
  const q = industry === 'all' ? '' : `industry=${industry}`;
  const stars = useApi(`/api/stars?${q}&scope=global&limit=12`);
  const clubs = useApi(`/api/clubs?${q}`);
  const feed = useApi(`/api/feed?${q}&stars=8`);
  const list = stars.data?.stars || [];
  const forYou = feed.data ? interleave(feed.data.filter((p) => p.image)) : null;

  return (
    <div className="page page--disc">
      <svg className="filmstrip" viewBox="0 0 300 200" aria-hidden>
        <defs>
          <linearGradient id="fs" x1="0" x2="1"><stop offset="0" stopColor="#f6b98a" stopOpacity=".0" /><stop offset=".5" stopColor="#f3a56f" stopOpacity=".55" /><stop offset="1" stopColor="#f6c9a6" stopOpacity=".2" /></linearGradient>
        </defs>
        <path d="M10 150 C 70 40, 170 10, 300 30" stroke="url(#fs)" strokeWidth="34" fill="none" />
        <path d="M10 150 C 70 40, 170 10, 300 30" stroke="#fff7f1" strokeWidth="22" strokeDasharray="7 9" fill="none" opacity=".7" />
      </svg>

      <header className="topbar topbar--disc">
        <Logo variant="solid" />
        <div className="topbar__right">
          <button className="icon-btn" onClick={() => setSearching((s) => !s)} aria-label="Search"><Search size={28} strokeWidth={1.8} /></button>
          <BellButton dot="orange" plain />
          <ProfileAvatar ring="orange" />
        </div>
      </header>
      {searching && <SearchBox compact autoFocus onClose={() => setSearching(false)} />}

      <h1 className="disc-title">Clubs</h1>
      <p className="disc-sub">Fan clubs · Live updates · Behind the Scenes</p>

      <Chips variant="disc" items={[['all', 'All'], ...INDUSTRY_CHIPS]} value={industry} onChange={setIndustry} />

      <Spotlight stars={list.slice(0, 3)} onExplore={openClub} />

      <SectionHead icon={<TrendingUp size={26} color="#f0711f" strokeWidth={2.4} />} title="Trending Stars" onAll={() => nav(`/trending?industry=${industry}`)} />
      <ErrorNote error={stars.error} />
      <div className="tstars">
        {list.length
          ? list.map((s, i) => (
              <StoryRing key={s.id} star={s} ring={RINGS[i % RINGS.length]} onClick={() => openClub(s)} />
            ))
          : Array.from({ length: 6 }, (_, i) => <div key={i} className="tstar"><Skel w={66} h={66} r={99} /><Skel w={50} h={10} /></div>)}
      </div>

      <SectionHead icon={<Flame size={26} color="#f0641f" fill="#f7953a" strokeWidth={1.8} />} title="Hot Now" />
      <div className="hot">
        {(clubs.data || [null, null, null, null]).map((c, i) =>
          c ? (
            <button key={c.key} className="hot__card" onClick={() => nav(`/clubs/${c.key}?industry=${industry}`)}>
              {c.cover && <img src={c.cover} alt="" referrerPolicy="no-referrer" loading="lazy" />}
              <span className="hot__shade" />
              {c.count > 0 && <em className="live-badge"><i />{c.count}</em>}
              <b>{c.title}</b>
              <span className="hot__play"><Play size={11} fill="#fff" strokeWidth={0} /></span>
            </button>
          ) : (
            <Skel key={i} h={82} r={14} />
          ),
        )}
      </div>

      <SectionHead icon={<Sparkles size={24} color="#f08a2a" fill="#f6a84a" strokeWidth={1.4} />} title="For You" />
      <ErrorNote error={feed.error} />
      <div className="foryou">
        {(forYou || [null, null, null]).slice(0, 14).map((p, i) =>
          p ? (
            <a key={p.url} className="fy" href={p.url} target="_blank" rel="noreferrer">
              <img src={p.image || p.star.image} alt="" loading="lazy" referrerPolicy="no-referrer" />
              <span className="fy__shade" />
              <em className="glass-chip fy__time">{timeAgo(p.publishedAt).replace(' ago', '')}</em>
              <span className="fy__meta glass-label">
                <small><Avatar src={p.star.image} name={p.star.name} size={16} /> {p.star.name}</small>
                <b>{p.title}</b>
              </span>
            </a>
          ) : (
            <Skel key={i} w={130} h={170} r={16} style={{ flex: '0 0 auto' }} />
          ),
        )}
      </div>

      <BottomNavDiscover onStar={() => list[0] && openClub(list[0])} />
    </div>
  );
}

function SectionHead({ icon, title, onAll }) {
  return (
    <div className="shead">
      <h2>{icon}{title}</h2>
      {onAll && <button onClick={onAll}>See All <ChevronRight size={18} /></button>}
    </div>
  );
}

function Spotlight({ stars, onExplore }) {
  const [i, setI] = useState(0);
  useEffect(() => { setI(0); }, [stars[0]?.id]);
  useEffect(() => {
    if (stars.length < 2) return;
    const t = setInterval(() => setI((x) => (x + 1) % stars.length), 6000);
    return () => clearInterval(t);
  }, [stars.length]);
  const n = stars.length;
  const prev = n ? stars[(i - 1 + n) % n] : null;
  const next = n ? stars[(i + 1) % n] : null;
  const s = stars[i];
  return (
    <div className="spot-wrap">
      {prev && <img className="spot-peek spot-peek--l" src={prev.image} alt="" referrerPolicy="no-referrer" />}
      {next && <img className="spot-peek spot-peek--r" src={next.image} alt="" referrerPolicy="no-referrer" />}
      <section className="spot">
        {stars.map((st, k) => (
          <img key={st.id} className={`spot__img ${k === i ? 'is-on' : ''}`} src={st.image} alt={st.name} referrerPolicy="no-referrer" />
        ))}
        <div className="spot__bokeh" />
        <div className="spot__text">
          <span className="eyebrow eyebrow--gold">STAR SPOTLIGHT</span>
          {s ? <h2>{s.name}</h2> : <Skel w={150} h={30} />}
          <p>Latest updates, upcoming projects and more</p>
          <button className="btn-gold" onClick={() => s && onExplore(s)}>Explore <ArrowRight size={16} strokeWidth={2.4} /></button>
        </div>
        <div className="dots dots--orange">
          {(n ? stars : [0, 1, 2]).map((_, k) => <button key={k} className={k === i ? 'is-on' : ''} onClick={() => setI(k)} aria-label={`Slide ${k + 1}`} />)}
        </div>
      </section>
    </div>
  );
}

function interleave(items) {
  const by = new Map();
  items.forEach((p) => by.set(p.star.id, [...(by.get(p.star.id) || []), p]));
  const out = [];
  for (let i = 0; out.length < items.length; i++) by.forEach((arr) => arr[i] && out.push(arr[i]));
  return out;
}
