import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { ExternalLink, X } from 'lucide-react';
import { markSeen, timeAgo, useApi, useLocal } from '../api.js';
import { Avatar, Verified } from './ui.jsx';

const Ctx = createContext({ openStory: () => {} });
export const useStory = () => useContext(Ctx);

/** Instagram-style stories built from a star's live news headlines and photos. */
export function StoryProvider({ children }) {
  const [star, setStar] = useState(null);
  const openStory = useCallback((s) => { markSeen(s.id || s.name); setStar(s); }, []);
  return (
    <Ctx.Provider value={{ openStory }}>
      {children}
      {star && <StoryViewer star={star} onClose={() => setStar(null)} />}
    </Ctx.Provider>
  );
}

const DURATION = 6000;

function StoryViewer({ star, onClose }) {
  const q = star.newsQuery || star.fullName || star.name;
  const { data, loading, error } = useApi(`/api/news?q=${encodeURIComponent(q)}&limit=12&name=${encodeURIComponent(star.fullName || star.name)}`);
  const items = data || [];
  const [i, setI] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [follows, setFollows] = useLocal('starloop:follows', []);
  const following = follows.some((f) => f.id === (star.id || star.name));
  const raf = useRef();

  useEffect(() => {
    if (!items.length || paused) return;
    let start = performance.now() - progress * DURATION;
    const tick = (t) => {
      const p = (t - start) / DURATION;
      if (p >= 1) {
        if (i < items.length - 1) { setI(i + 1); setProgress(0); } else onClose();
        return;
      }
      setProgress(p);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, items.length, paused]);

  useEffect(() => {
    const k = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  const go = (d) => {
    const n = i + d;
    if (n < 0) return;
    if (n >= items.length) return onClose();
    setI(n);
    setProgress(0);
  };

  const item = items[i];
  const bg = item?.image || star.imageOriginal || star.image;
  const toggleFollow = () =>
    setFollows((f) => (following ? f.filter((x) => x.id !== (star.id || star.name)) : [...f, { id: star.id || star.name, name: star.name, image: star.image, newsQuery: q }]));

  return (
    <div className="story" role="dialog" aria-label={`${star.name} stories`}>
      <div className="story__frame">
        {bg && <img className="story__bg" src={bg} alt="" referrerPolicy="no-referrer" />}
        <div className="story__shade" />
        <div className="story__bars">
          {(items.length ? items : [0]).map((_, k) => (
            <span key={k}><i style={{ width: `${k < i ? 100 : k === i ? progress * 100 : 0}%` }} /></span>
          ))}
        </div>
        <header className="story__head">
          <Avatar src={star.image} name={star.name} size={40} className="ring-white" />
          <div>
            <b>{star.fullName || star.name} <Verified size={15} /></b>
            <small>{item ? `${item.source} · ${timeAgo(item.publishedAt)}` : loading ? 'Loading live stories…' : 'No recent stories'}</small>
          </div>
          <button className={`story__follow ${following ? 'is-on' : ''}`} onClick={toggleFollow}>{following ? 'Following' : 'Follow'}</button>
          <button className="story__x" onClick={onClose} aria-label="Close"><X size={24} /></button>
        </header>
        <div className="story__tap story__tap--l" onClick={() => go(-1)} onPointerDown={() => setPaused(true)} onPointerUp={() => setPaused(false)} />
        <div className="story__tap story__tap--r" onClick={() => go(1)} onPointerDown={() => setPaused(true)} onPointerUp={() => setPaused(false)} />
        {item && (
          <footer className="story__foot">
            <h3>{item.title}</h3>
            {item.summary && <p>{item.summary}</p>}
            <a href={item.url} target="_blank" rel="noreferrer">Read full story <ExternalLink size={15} /></a>
          </footer>
        )}
        {error && <footer className="story__foot"><p>Live news is unavailable right now.</p></footer>}
      </div>
    </div>
  );
}
