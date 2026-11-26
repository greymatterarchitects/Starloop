import { XMLParser } from 'fast-xml-parser';
import { cached, getText, limiter } from './util.js';
import { outletMatches } from './outlets.js';

const parser = new XMLParser({ ignoreAttributes: true, processEntities: true, htmlEntities: true });
const newsLimit = limiter(4);
const MIN = 60_000;

const arr = (x) => (Array.isArray(x) ? x : x ? [x] : []);
const strip = (s = '') => String(s).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

function realUrl(link) {
  try {
    const u = new URL(link);
    return u.searchParams.get('url') || link;
  } catch {
    return link;
  }
}

function bingImage(src) {
  if (!src) return null;
  const u = src.replace(/^http:/, 'https:');
  return `${u}${u.includes('?') ? '&' : '?'}w=800&h=600&c=7&rs=1`;
}

async function bing(query) {
  const xml = await newsLimit(() => getText(`https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=rss&setlang=en-IN&cc=IN`));
  const j = parser.parse(xml);
  return arr(j?.rss?.channel?.item).map((it) => ({
    title: strip(it.title),
    summary: strip(it.description),
    url: realUrl(it.link),
    source: strip(it['News:Source']).replace(/ on MSN$/, ''),
    image: bingImage(it['News:Image']),
    publishedAt: it.pubDate ? new Date(it.pubDate).toISOString() : null,
  }));
}

async function google(query) {
  const xml = await newsLimit(() => getText(`https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`));
  const j = parser.parse(xml);
  return arr(j?.rss?.channel?.item).map((it) => {
    const source = typeof it.source === 'string' ? it.source : '';
    return {
      title: strip(it.title).replace(new RegExp(` - ${source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), ''),
      summary: '',
      url: it.link,
      source,
      image: null,
      publishedAt: it.pubDate ? new Date(it.pubDate).toISOString() : null,
    };
  });
}

/** Live headlines for a query: Bing News (with article photos), topped up with Google News. Newest first. */
export async function news(query, limit = 12, person = null) {
  const items = await cached(`news:${query.toLowerCase()}`, 12 * MIN, async () => {
    let list = [];
    try { list = await bing(query); } catch (e) { console.warn('bing news failed:', e.message); }
    if (list.length < 6) {
      try { list = list.concat(await google(query)); } catch (e) { console.warn('google news failed:', e.message); }
    }
    const seen = new Set();
    return list
      .filter((n) => n.title && !seen.has(n.title.toLowerCase()) && seen.add(n.title.toLowerCase()))
      .sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''));
  });
  if (!person) return items.slice(0, limit);
  // For a person: blend in articles from the direct publisher feeds that name them.
  const direct = await outletMatches(person).catch(() => []);
  const seen = new Set();
  return [...items, ...direct]
    .filter((n) => !seen.has(n.title.toLowerCase()) && seen.add(n.title.toLowerCase()))
    .sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''))
    .slice(0, limit);
}
