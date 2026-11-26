# StarLoop

Live celebrity, movie and fan-club hub for Tollywood, Hollywood, Kollywood, Bollywood, Sandalwood and Mollywood.
**React (Vite) front end + Node/Express API.** No mock data: everything is fetched live.

## Run

```
npm install
npm run dev        # web: http://localhost:5280  ·  API: http://localhost:5050
npm start          # production: builds React, Express serves it on :5050
```

## Where the data comes from

| UI | Live source |
|---|---|
| Star photos, bios, roles | Wikipedia API (`pageimages`, `extracts`, `description`) |
| Trend Score / Engagement / Score, rankings | Wikimedia Pageviews API, last 14 days. Trend = weekly views (log scale), Engagement = week-over-week momentum. **Global** = English Wikipedia readers, **India** = regional-language Wikipedia readers (Telugu, Tamil, Kannada, Malayalam, Hindi) |
| Stories, home feed, For You | Bing News RSS (with article photos), topped up from Google News RSS |
| Hot Now / Clubs | Live news channels per industry (Behind the Scenes, On Set, Events & Premieres, Box Office) |
| Movies | Wikidata SPARQL (films released in the last 12 months or coming soon), Wikipedia posters |
| Chat | Real-time rooms over Server-Sent Events (in memory; resets when the server restarts) |

| Auto-discovered stars | Wikimedia "most read" lists for the last 3 days on English, Hindi, Telugu, Tamil, Kannada and Malayalam Wikipedia, filtered via Wikidata to living film people (`server/discover.js`, cached 6 h on disk) |
| Direct publisher feeds | 20 outlet RSS feeds (Times of India, Hindustan Times, NDTV, Indian Express, The Hindu, News18, 123Telugu, Onmanorama, Variety, Deadline, Bollywood Hungama, Firstpost, …) matched to stars by name (`server/outlets.js`) |

`GET /api/sources` shows live counts for every source.

The curated headliners per industry are in `server/industries.js`. Add or remove names there.
Responses are cached on the server (news 12 min, rankings 2 h, movies 6 h), and the UI refreshes every 5 minutes.

## Pages

| Route | What it is |
|---|---|
| `/` | Home: stories, trending stars, Star vs Star battle, personal "For you" feed |
| `/clubs` | Clubs hub: spotlight, trending stars, Hot Now news channels |
| `/star/:id` | Celebrity club: follow/join, release countdown + check-ins, daily quiz, fan art of the week, Top Fans, posts |
| `/party/:id` | Release-day watch party: live chat, emoji bursts, live polls |
| `/chat` | Messages: direct messages between fans (live) + public fan rooms |
| `/messages/:userId` | One-to-one conversation |
| `/new` | Create a post, goal campaign or fan art in any club |
| `/post/:id` | Single post with all comments |
| `/fan/:id` | Fan profile with badges, posts and clubs |

## Fan data storage

- **On your computer:** `data/db.json` and `data/uploads/` (kept out of Git).
- **On Vercel:** connect **Upstash for Redis** (Vercel → your project → Storage → Create Database → Upstash for Redis → Connect). It sets `KV_REST_API_URL` and `KV_REST_API_TOKEN`; the server detects them and stores accounts, posts, messages, votes and uploaded photos there. Without it, Vercel only keeps fan data until the function goes idle.
