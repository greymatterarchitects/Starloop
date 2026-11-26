import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, Forward, Heart, Megaphone, MessageCircle, Palette, Send, Sparkles, ThumbsUp } from 'lucide-react';
import { timeAgo, useLocal } from '../api.js';
import { fanPost } from '../fan.js';
import { Avatar, Verified } from './ui.jsx';

const enc = encodeURIComponent;

/**
 * The one post card used everywhere (Home feed, club tabs, fan profiles).
 * item = { type: 'news', title, url, image, source, publishedAt, star, following, reason }
 *      | { type: 'fan', post, reason }
 */
export default function FeedCard({ item, fan, requireFan, onChange, stars = [] }) {
  return item.type === 'news'
    ? <NewsCard item={item} fan={fan} requireFan={requireFan} onChange={onChange} stars={stars} />
    : <FanCard post={item.post} reason={item.reason} fan={fan} requireFan={requireFan} onChange={onChange} />;
}

function Reason({ text }) {
  if (!text) return null;
  return <p className="apost__reason"><Sparkles size={12} /> {text}</p>;
}

async function shareLink(title, url, setCopied) {
  try {
    if (navigator.share) await navigator.share({ title, url });
    else { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1600); }
    return true;
  } catch { return false; }
}

/* ---------- live news item ---------- */
function NewsCard({ item, fan, requireFan, onChange, stars }) {
  const nav = useNavigate();
  const [likes, setLikes] = useLocal('starloop:likes', {});
  const liked = !!likes[item.url];
  const [copied, setCopied] = useState(false);
  const [following, setFollowing] = useState(!!item.following);
  const s = item.star;
  const img = item.image || s.image;
  const text = item.title.toLowerCase();
  const coStars = stars.filter((x) => x.id !== s.id && [x.name, x.fullName].some((n) => n && n.length > 3 && text.includes(n.toLowerCase()))).slice(0, 3);
  const tags = [s.industry && `#${s.industry[0].toUpperCase()}${s.industry.slice(1)}`, item.source && `#${item.source.replace(/[^A-Za-z0-9]/g, '')}`].filter(Boolean);
  const follow = (e) => {
    e.preventDefault(); e.stopPropagation();
    requireFan(async () => { const r = await fanPost(`/api/fans/club/${enc(s.id)}/follow`, { starName: s.name, starImage: s.image }); setFollowing(r.following); onChange?.(); });
  };
  return (
    <article className="apost">
      <Reason text={item.reason} />
      <a className="apost__media" href={item.url} target="_blank" rel="noreferrer">
        <img src={img} alt="" loading="lazy" referrerPolicy="no-referrer" />
        <span className="apost__shade" />
        <button className="apost__author" onClick={(e) => { e.preventDefault(); nav(`/star/${enc(s.id)}`); }}>
          <Avatar src={s.image} name={s.name} size={26} />
          <span>{s.fullName || s.name}</span>
          <Verified size={14} />
          <span role="button" tabIndex={0} className={`follow-btn ${following ? 'is-on' : ''}`} onClick={follow}>{following ? 'Following' : 'Follow'}</span>
        </button>
        <span className="apost__pill">
          <button className={liked ? 'is-liked' : ''} aria-pressed={liked} aria-label="Like" onClick={(e) => { e.preventDefault(); setLikes((l) => { const n = { ...l }; liked ? delete n[item.url] : (n[item.url] = 1); return n; }); }}>
            <Heart size={15} fill={liked ? 'currentColor' : 'none'} strokeWidth={2} />
          </button>
          <i />
          <button aria-label="Share" onClick={(e) => { e.preventDefault(); shareLink(item.title, item.url, setCopied); }}><Forward size={15} strokeWidth={2} /></button>
          {copied && <em>Copied</em>}
        </span>
        {coStars.length > 0 && (
          <span className="apost__costars" title={`Also in this story: ${coStars.map((x) => x.name).join(', ')}`}>
            {coStars.map((x) => <span key={x.id} className="apost__co"><Avatar src={x.image} name={x.name} size={30} /><Heart size={10} fill="#ef3b62" strokeWidth={0} /></span>)}
          </span>
        )}
      </a>
      <div className="apost__body">
        <Avatar src={s.image} name={s.name} size={26} />
        <div>
          <b>{s.fullName || s.name} <small>· {timeAgo(item.publishedAt)}</small></b>
          <p>{item.title}</p>
          <span className="apost__tags">{tags.join(' ')}</span>
        </div>
      </div>
    </article>
  );
}

/* ---------- fan post / campaign / fan art ---------- */
export function FanCard({ post, reason, fan, requireFan, onChange, showStar = true, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const [text, setText] = useState('');
  const [copied, setCopied] = useState(false);
  const call = (p, body = {}) => requireFan(() => fanPost(`/api/fans/posts/${post.id}/${p}`, body).then(() => onChange?.()));
  const share = (e) => {
    e?.preventDefault();
    requireFan(async () => {
      if (await shareLink(`${post.user?.name} on ${post.starName}`, `${location.origin}/star/${enc(post.starId)}`, setCopied)) {
        await fanPost(`/api/fans/posts/${post.id}/share`);
        onChange?.();
      }
    });
  };
  const isCampaign = post.kind === 'campaign', isArt = post.kind === 'art';
  const pct = isCampaign && post.goal ? Math.min(100, Math.round((post.backers / post.goal) * 100)) : 0;
  const ended = post.endsAt && new Date(post.endsAt) < new Date();
  const mine = post.user?.id === fan.id;
  const tags = [post.starName && `#${post.starName.replace(/[^A-Za-z0-9]/g, '')}`, isCampaign && '#FanCampaign', isArt && '#FanArt'].filter(Boolean);

  const pill = (
    <span className="apost__pill">
      <button className={post.liked ? 'is-liked' : ''} aria-label="Like" onClick={(e) => { e.preventDefault(); call('like'); }}>
        <Heart size={15} fill={post.liked ? 'currentColor' : 'none'} strokeWidth={2} />{post.likes > 0 && <small>{post.likes}</small>}
      </button>
      <i />
      <button aria-label="Comments" onClick={(e) => { e.preventDefault(); setOpen((o) => !o); }}><MessageCircle size={15} strokeWidth={2} />{post.comments.length > 0 && <small>{post.comments.length}</small>}</button>
      <i />
      <button aria-label="Share" onClick={share}><Forward size={15} strokeWidth={2} />{post.shares > 0 && <small>{post.shares}</small>}</button>
      {copied && <em>Copied</em>}
    </span>
  );
  const author = (
    <Link className="apost__author" to={`/fan/${post.user?.id}`}>
      <Avatar src={post.user?.avatar} name={post.user?.name} size={26} />
      <span>{post.user?.name}</span>
      {isCampaign && <em className="apost__kind apost__kind--campaign"><Megaphone size={11} /> Campaign</em>}
      {isArt && <em className="apost__kind apost__kind--art"><Palette size={11} /> Fan art</em>}
    </Link>
  );

  return (
    <article className={`apost ${post.image ? '' : 'apost--text'} ${isCampaign ? 'apost--campaign' : ''}`}>
      <Reason text={reason} />
      {post.image ? (
        <div className="apost__media">
          <Link to={`/post/${post.id}`} className="apost__imglink" aria-label="Open post"><img src={post.image} alt="" loading="lazy" /></Link>
          <span className="apost__shade" />
          {author}
          {pill}
          {isArt && (
            <button className={`apost__vote ${post.voted ? 'is-on' : ''}`} disabled={mine} onClick={() => call('vote')} title={mine ? 'Your art' : 'Vote for this fan art'}>
              <ThumbsUp size={14} fill={post.voted ? 'currentColor' : 'none'} /> {post.artVotes}
            </button>
          )}
        </div>
      ) : (
        <div className="apost__textcard">{author}<Link to={`/post/${post.id}`} className="apost__textlink"><p>{post.text}</p></Link>{pill}</div>
      )}
      <div className="apost__body">
        <Avatar src={post.user?.avatar} name={post.user?.name} size={26} />
        <div>
          <b>{post.user?.name} <small>· <Link to={`/post/${post.id}`} className="apost__time">{timeAgo(post.at)}</Link>{showStar && post.starName ? <> · in <Link to={`/star/${enc(post.starId)}`}>{post.starName}</Link></> : null}</small></b>
          {post.image && post.text && <p>{post.text}</p>}
          {isCampaign && post.goal && (
            <div className="campaign">
              <div className="campaign__bar"><i style={{ width: `${pct}%` }} /></div>
              <div className="campaign__row">
                <span><b>{post.backers}</b> / {post.goal} fans{pct >= 100 ? ' · goal reached!' : ''}{post.endsAt ? ` · ${ended ? 'ended' : `ends ${new Date(post.endsAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}` : ''}</span>
                {!ended && !mine && <button className={`campaign__join ${post.backed ? 'is-on' : ''}`} onClick={() => call('back')}>{post.backed ? <><Check size={13} /> Joined</> : 'Join campaign'}</button>}
              </div>
            </div>
          )}
          <span className="apost__tags">{tags.join(' ')}</span>
          {open && (
            <div className="fpost__comments">
              {post.comments.map((c) => (
                <div key={c.id} className="fcomment">
                  <Link to={`/fan/${c.user?.id}`}><Avatar src={c.user?.avatar} name={c.user?.name} size={24} /></Link>
                  <p><b>{c.user?.name}</b> {c.text}<small> · {timeAgo(c.at)}</small></p>
                </div>
              ))}
              <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) call('comments', { text }).then(() => setText('')); }}>
                <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a comment…" maxLength={500} />
                <button aria-label="Send comment"><Send size={16} /></button>
              </form>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
