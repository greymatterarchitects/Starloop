import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Sparkles, X } from 'lucide-react';
import { useStory } from './StoryViewer.jsx';
import { Avatar } from './ui.jsx';

/** Live search across the StarLoop roster and Wikipedia. Selecting a result opens that person's live stories. */
export default function SearchBox({ compact, onClose, autoFocus }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState([]);
  const [open, setOpen] = useState(false);
  const { openStory } = useStory();
  const nav = useNavigate();
  const box = useRef();

  useEffect(() => {
    if (q.trim().length < 2) { setRes([]); return; }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q.trim())}`, { signal: ctl.signal })
        .then((r) => r.json()).then((d) => { setRes(Array.isArray(d) ? d : []); setOpen(true); }).catch(() => {});
    }, 250);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q]);

  useEffect(() => {
    const h = (e) => !box.current?.contains(e.target) && setOpen(false);
    document.addEventListener('pointerdown', h);
    return () => document.removeEventListener('pointerdown', h);
  }, []);

  return (
    <div className={`search ${compact ? 'search--compact' : ''}`} ref={box}>
      <Search size={22} strokeWidth={1.8} className="search__icon" />
      <input
        value={q}
        autoFocus={autoFocus}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => res.length && setOpen(true)}
        placeholder="Search celebrities, movies, trends..."
        aria-label="Search"
      />
      {compact ? (
        <button className="search__close" onClick={onClose} aria-label="Close search"><X size={18} /></button>
      ) : (
        <Sparkles size={20} className="search__spark" fill="#f2a6b8" strokeWidth={1.2} />
      )}
      {open && res.length > 0 && (
        <ul className="search__results">
          {res.map((r) => (
            <li key={r.id + r.kind}>
              <button onClick={() => { setOpen(false); r.kind === 'star' ? nav(`/star/${encodeURIComponent(r.id)}`) : openStory({ ...r, newsQuery: r.newsQuery || r.fullName || r.name }); }}>
                <Avatar src={r.image} name={r.name} size={36} />
                <span><b>{r.fullName || r.name}</b><small>{r.description || r.role}</small></span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
