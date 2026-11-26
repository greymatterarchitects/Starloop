// Direct RSS feeds from film & entertainment publishers (all verified to return live items).
import { XMLParser } from 'fast-xml-parser';
import { cached, getText, limiter } from './util.js';

export const OUTLETS = [
  ['Times of India', 'https://timesofindia.indiatimes.com/rssfeeds/1081479906.cms'],
  ['Hindustan Times', 'https://www.hindustantimes.com/feeds/rss/entertainment/rssfeed.xml'],
  ['NDTV Movies', 'https://feeds.feedburner.com/ndtvmovies-latest'],
  ['Pinkvilla', 'https://www.pinkvilla.com/rss.xml'],
  ['Indian Express', 'https://indianexpress.com/section/entertainment/feed/'],
  ['The Hindu', 'https://www.thehindu.com/entertainment/movies/feeder/default.rss'],
  ['News18', 'https://www.news18.com/rss/movies.xml'],
  ['123Telugu', 'https://www.123telugu.com/feed'],
  ['Only Kollywood', 'https://www.onlykollywood.com/feed/'],
  ['Onmanorama', 'https://www.onmanorama.com/entertainment.feeds.onmrss.xml'],
  ['Variety', 'https://variety.com/feed/'],
  ['The Hollywood Reporter', 'https://www.hollywoodreporter.com/feed/'],
  ['Deadline', 'https://deadline.com/feed/'],
  ['IndieWire', 'https://www.indiewire.com/feed/'],
  ['Koimoi', 'https://www.koimoi.com/feed/'],
  ['Bollywood Hungama', 'https://www.bollywoodhungama.com/rss/news.xml'],
  ['Firstpost', 'https://www.firstpost.com/commonfeeds/v1/mfp/rss/entertainment.xml'],
  ['Republic World', 'https://www.republicworld.com/rss/entertainment.xml'],
  ['Deccan Chronicle', 'https://www.deccanchronicle.com/google_feeds.xml'],
  ['ET Online', 'https://www.etonline.com/news/rss'],
];

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', processEntities: true, htmlEntities: true });
const lim = limiter(6);
const arr = (x) => (Array.isArray(x) ? x : x ? [x] : []);
const text = (x) => (typeof x === 'object' && x !== null ? x['#text'] ?? '' : x ?? '');
const strip = (s = '') => String(s).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

function imageOf(it) {
  const cands = [...arr(it['media:content']), ...arr(it['media:thumbnail']), ...arr(it.enclosure), ...arr(it['media:group']?.['media:content'])];
  for (const c of cands) {
    const u = c?.['@url'];
    if (u && !/\.(mp4|mp3|m3u8)(\?|$)/i.test(u)) return u;
  }
  const html = text(it['content:encoded']) + text(it.description);
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? m[1] : null;
}

async function fetchOutlet([source, url]) {
  try {
    const xml = await lim(() => getText(url, { 'User-Agent': 'Mozilla/5.0 (compatible; StarLoop/1.0)' }));
    const j = parser.parse(xml);
    return arr(j?.rss?.channel?.item).map((it) => ({
      title: strip(text(it.title)),
      summary: strip(text(it.description)).slice(0, 280),
      url: text(it.link) || text(it.guid),
      source,
      image: imageOf(it),
      publishedAt: it.pubDate ? new Date(text(it.pubDate)).toISOString() : null,
    })).filter((n) => n.title && n.url);
  } catch {
    return [];
  }
}

/** Every recent article from every outlet (cached 15 min). */
export async function outletItems() {
  return cached('outlets', 15 * 60_000, async () => {
    const lists = await Promise.all(OUTLETS.map(fetchOutlet));
    const all = lists.flat();
    console.log(`Outlet feeds: ${all.length} articles from ${lists.filter((l) => l.length).length}/${OUTLETS.length} publishers`);
    return all;
  });
}

/** Outlet articles that mention a person by name (whole-word, in title or summary). */
export async function outletMatches(name) {
  if (!name || name.length < 4) return [];
  const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')}\\b`, 'i');
  return (await outletItems()).filter((n) => re.test(n.title) || re.test(n.summary));
}
