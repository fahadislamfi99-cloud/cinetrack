# LinkedIn Post: How I Cut Supabase Egress by 98% After Hitting 31 GB

Last week, my side project accidentally used 31.7 GB of bandwidth on Supabase in a couple of days.

The free tier limit is 5 GB. I was over quota by more than 600%.

For a moment, I panicked. I had just shared CineTrack (a movie and series tracker I’ve been building) in a Facebook post. People actually opened it, browsed around, and checked out my watchlist. 

Traffic was great. But 31 GB? That made zero sense. 

I don't even store images on Supabase — all posters and backdrops come directly from TMDB or external CDNs. So what was eating all that data transfer?

I dug into the logs. The culprit wasn't media files. It was two quiet architectural mistakes:

1. **Unchecked Auth in Middleware:**
`updateSession()` was calling `supabase.auth.getUser()` on every single incoming request. Even for Facebook crawlers, Google bots, and guest visitors who didn’t even have an account. Thousands of anonymous visitors = thousands of unnecessary HTTPS roundtrips to Supabase Auth.

2. **Uncached Server Components:**
When someone clicked a link to my public profile (`/fahadislam`), my page component executed a raw PostgreSQL query pulling my entire watch history (200+ titles, metadata, notes). That’s roughly 1.5 MB of uncompressed JSON over the Postgres wire per hit. 
Multiply that by 5,000 curious clicks from Facebook, and you get ~8 GB of pure database egress just from one URL.

Here is how I fixed it in an evening without spending a dime or changing a single line of UI:

**1. Cookie Fast-Path in Middleware:**
Before letting middleware touch Supabase Auth, I added a simple guard: check `request.cookies` for `sb-*-auth-token`. If it doesn't exist, exit immediately. 
Result: Guest visitors and bots now generate exactly zero requests to Supabase Auth.

**2. Next.js Cache Tags (`unstable_cache`):**
Wrapped the public profile query with a 60-second TTL tagged `profile-${username}`.
Now, the first visitor hits Postgres. The next 1,000 visitors in that window get served straight from edge cache. 
When I actually log a new movie, the Server Action calls `updateTag()`, instantly invalidating the cache.
Result: 5,000 visits went from ~8 GB of database egress to under 15 MB.

**3. Edge Caching `/discover` & Metadata APIs:**
Cached the shared catalog and added CDN `Cache-Control: public, s-maxage=86400` on TV season queries.

The numbers after pushing:
- Monthly egress dropped from **31.7 GB ➔ <500 MB**
- Page loads got noticeably snappier for visitors
- Everything fits safely back inside Supabase’s free tier

The biggest lesson for me: in modern full-stack frameworks (Next.js / Supabase), "it works on localhost" hides dangerous network amplification. You don't need complex Redis clusters to handle traffic spikes — you just have to stop asking your database for data that hasn't changed.

Has anyone else had a silent egress leak blow up their cloud quotas unexpectedly? Would love to hear how you caught it.
