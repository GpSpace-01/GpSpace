GpSpace V7 — Automatic YouTube Video Hub (Cloudflare Workers Static Assets fix)

This version keeps the V6 site/content and fixes the deployment architecture for a Cloudflare Workers project using Static Assets.

WHAT CHANGED
- The previous V6 used Pages Advanced Mode _worker.js.
- Your live /api/youtube returned the site's 404 page, which shows the Worker API route was not being executed by the current project type/deployment.
- V7 uses a standard Cloudflare Workers Static Assets entry point: worker.js + wrangler.jsonc + public/ assets.
- /api/* is configured to run the Worker first.
- /api/youtube fetches the official YouTube RSS feed for channel UCi8mXSRouesT1xVkf81wbzg.
- /api/health provides a simple deployment test.

TEST AFTER DEPLOYMENT
1. https://gpspace.gpspace-one.workers.dev/api/health
   Expected: JSON containing "ok": true and "version": "7".
2. https://gpspace.gpspace-one.workers.dev/api/youtube
   Expected: JSON containing "videos" with the latest GpSpace uploads.
3. Open the homepage and verify the latest uploads appear first.

NOTES
- No YouTube Data API key is required.
- YouTube videos remain hosted/played on YouTube; they are not downloaded or re-hosted.
- Feed caching may delay a brand-new upload by a few minutes.
- Automatic Shorts detection for new uploads is not guaranteed by the public RSS feed.
- Keep V5/V6 deployment history intact so you can roll back if needed.
