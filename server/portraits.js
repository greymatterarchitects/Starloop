// Professional portrait photos from TMDB (The Movie Database) — mostly studio / shoot headshots.
// Enabled when TMDB_READ_TOKEN (v4 "API Read Access Token") or TMDB_API_KEY (v3) is set.
// This product uses the TMDB API but is not endorsed or certified by TMDB.
import { cached, limiter } from './util.js';

const token = process.env.TMDB_READ_TOKEN;
const key = process.env.TMDB_API_KEY;
export const tmdbEnabled = !!(token || key);
const lim = limiter(4);
const DAY = 24 * 3600_000;

const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

/** Best TMDB profile photo for a person, or null. Prefers acting credits and an exact name match. */
export async function tmdbPortrait(name) {
  if (!tmdbEnabled || !name) return null;
  return cached(`tmdb:${norm(name)}`, 7 * DAY, async () => {
    const url = new URL('https://api.themoviedb.org/3/search/person');
    url.searchParams.set('query', name);
    url.searchParams.set('include_adult', 'false');
    if (!token) url.searchParams.set('api_key', key);
    try {
      const r = await lim(() => fetch(url, { headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, signal: AbortSignal.timeout(12000) }));
      if (!r.ok) return null;
      const { results = [] } = await r.json();
      const withPhoto = results.filter((p) => p.profile_path);
      const exact = withPhoto.filter((p) => norm(p.name) === norm(name) || (p.also_known_as || []).some((a) => norm(a) === norm(name)));
      const pool = exact; // only trust an exact name match, otherwise keep the Wikipedia photo
      const best = pool.sort((a, b) => (b.known_for_department === 'Acting') - (a.known_for_department === 'Acting') || b.popularity - a.popularity)[0];
      return best ? `https://image.tmdb.org/t/p/w342${best.profile_path}` : null;
    } catch {
      return null;
    }
  });
}
