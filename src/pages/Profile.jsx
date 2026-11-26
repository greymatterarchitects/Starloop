import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useFan } from '../fan.js';
import { Heart, Trash2 } from 'lucide-react';
import { useLocal } from '../api.js';
import { Avatar, BellButton, BottomNavHome, Logo } from '../components/ui.jsx';
import SearchBox from '../components/SearchBox.jsx';
import { AuthSheet } from './StarClub.jsx';

export default function Profile() {
  const [me, setMe] = useLocal('starloop:me', { name: '', favorite: null });
  const [follows, setFollows] = useLocal('starloop:follows', []);
  const [name, setName] = useState(me.name);
  const nav = useNavigate();
  const fan = useFan();
  const [auth, setAuth] = useState(false);

  return (
    <div className="page page--home">
      <header className="topbar"><Logo /><div className="topbar__right"><BellButton /></div></header>
      <section className="card profile">
        <span className="ring ring--sunset"><Avatar src={me.favorite?.image} name={me.name || 'You'} size={84} /></span>
        <form onSubmit={(e) => { e.preventDefault(); setMe({ ...me, name: name.trim() }); }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your display name" maxLength={30} />
          <button className="btn-plum" type="submit">Save</button>
        </form>
        <p className="page-sub">Your profile is stored only in this browser.</p>
      </section>

      <div className="profile-auth">
        {fan.registered ? (
          <>
            <span>Signed in as <b>{fan.me.name}</b></span>
            <Link to={`/fan/${fan.id}`} className="club-btn club-btn--primary">My fan profile</Link>
            <button className="club-btn" onClick={fan.logout}>Log out</button>
          </>
        ) : (
          <>
            <span>Sign in to join clubs, post, take quizzes, earn badges and get alerts.</span>
            <button className="club-btn club-btn--primary" onClick={() => setAuth(true)}>Sign up / Log in</button>
          </>
        )}
      </div>
      {auth && <AuthSheet fan={fan} onClose={() => setAuth(false)} onDone={() => setAuth(false)} />}

      <h2 className="sec-title">Following ({follows.length})</h2>
      <p className="page-sub">Tap “Follow” inside any star’s story to add them here. Tap ♥ to make them your avatar.</p>
      <SearchBox />
      <div className="follows">
        {follows.map((f) => (
          <div key={f.id} className="follow">
            <button onClick={() => nav(`/star/${encodeURIComponent(f.id)}`)}><Avatar src={f.image} name={f.name} size={56} /><span>{f.name}</span></button>
            <div>
              <button aria-label="Set as avatar" className={me.favorite?.id === f.id ? 'is-on' : ''} onClick={() => setMe({ ...me, favorite: f })}><Heart size={16} /></button>
              <button aria-label="Unfollow" onClick={() => setFollows(follows.filter((x) => x.id !== f.id))}><Trash2 size={16} /></button>
            </div>
          </div>
        ))}
      </div>
      <BottomNavHome />
    </div>
  );
}
