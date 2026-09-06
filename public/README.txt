GpSpace V6 — Automatic YouTube Video Hub

This version keeps the V5 website and adds an automatic YouTube channel feed.

CHANNEL
- YouTube handle: https://www.youtube.com/@Gp_space
- Channel ID: UCi8mXSRouesT1xVkf81wbzg

AUTOMATIC VIDEO CONNECTION
- The homepage calls /api/youtube.
- _worker.js fetches the official public YouTube channel RSS feed.
- Latest uploads are returned to the website automatically.
- The site keeps the existing V5 videos as a fallback if the feed is temporarily unavailable.
- The feed is cached for performance, so a brand-new upload may take a few minutes to appear.
- Videos are not downloaded or re-hosted; playback remains on YouTube through the embedded player.

CLOUDFLARE
- _worker.js is Cloudflare Pages Advanced Mode compatible and uses env.ASSETS.fetch() for static files.
- Cloudflare's current documentation confirms _worker.js is supported for dashboard drag-and-drop Pages deployments.
- If this project is deployed as a Workers Static Assets application instead of Pages, configure the static assets binding as ASSETS and deploy the Worker script with the assets.

IMPORTANT
- You do not need a YouTube Data API key for this RSS-based connection.
- Automatic Shorts detection is not guaranteed for brand-new uploads because the public RSS feed does not provide a reliable Shorts flag. Existing known Shorts remain classified correctly. New uploads are shown immediately in All Videos and are categorized from their titles.
