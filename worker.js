const CHANNEL_ID = 'UCi8mXSRouesT1xVkf81wbzg';
const CHANNEL_URL = 'https://www.youtube.com/@Gp_space';

// Rolling retention: 10 latest news items, 70 YouTube IDs, and 50 community questions.
const NEWS_RETENTION = 10;
const VIDEO_RETENTION = 70;
const QUESTION_RETENTION = 50;
const VIDEO_KV_KEY = 'gpspace:video-cycle:v1';
const QUESTIONS_KV_KEY = 'gpspace:questions:v1';

const NEWS_FEEDS = [
  { source: 'NASA', url: 'https://www.nasa.gov/feed/' },
  { source: 'ESA', url: 'https://www.esa.int/rssfeed/Our_Activities/Space_News' },
  { source: 'ESA Space Science', url: 'https://www.esa.int/rssfeed/Our_Activities/Space_Science' },
  { source: 'NASA JPL', url: 'https://www.jpl.nasa.gov/feeds/news/' },
  { source: 'NASA CNEOS', url: 'https://cneos.jpl.nasa.gov/feed/news.xml' }
];

function xmlDecode(value = '') {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function stripHtml(value = '') {
  return xmlDecode(value).replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function tag(block, name) {
  const escaped = name.replace(/:/g, '\\:');
  const re = new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, 'i');
  return xmlDecode((block.match(re) || [, ''])[1].trim());
}

function atomLink(block) {
  const m = block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?>(?:<\/link>)?/i);
  return m ? m[1] : '';
}

function parseFeed(xml, source) {
  const itemBlocks = [...xml.matchAll(/<(?:item|entry)\b[^>]*>([\s\S]*?)<\/(?:item|entry)>/gi)].map(m => m[1]);
  return itemBlocks.map(item => {
    const title = stripHtml(tag(item, 'title'));
    const description = stripHtml(tag(item, 'description') || tag(item, 'summary') || tag(item, 'content'));
    const link = tag(item, 'link') || atomLink(item);
    const pub = tag(item, 'pubDate') || tag(item, 'published') || tag(item, 'updated') || tag(item, 'dc:date');
    const image = (item.match(/<media:content[^>]+url=["']([^"']+)["']/i) || item.match(/<media:thumbnail[^>]+url=["']([^"']+)["']/i) || [,''])[1];
    return { title, description, link, published: pub, source, image };
  }).filter(n => n.title && n.link);
}

function json(data, status = 200, noStore = false) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': noStore ? 'no-store, no-cache, must-revalidate, max-age=0' : 'public, max-age=60, s-maxage=60',
      'access-control-allow-origin': '*',
      'x-gpspace-api': 'v13-adsense'
    }
  });
}

function videoIdFromUrl(url = '') {
  return (url.match(/[?&]v=([^&]+)/) || [, ''])[1];
}

async function fetchText(url, headers) {
  const response = await fetch(url, {
    headers,
    cf: { cacheTtl: 0, cacheEverything: false }
  });
  if (!response.ok) throw new Error(`Upstream returned ${response.status}`);
  return response.text();
}

async function youtubeRss() {
  const bust = Date.now().toString();
  const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}&_=${bust}`;
  const xml = await fetchText(url, {
    'user-agent': 'Mozilla/5.0 (compatible; GpSpaceBot/12.1)',
    'accept': 'application/atom+xml,application/xml,text/xml;q=0.9,*/*;q=0.8',
    'cache-control': 'no-cache'
  });
  const parsed = parseFeed(xml, 'GpSpace');
  if (!parsed.length) throw new Error('YouTube RSS returned no videos');
  return parsed.slice(0, 70).map(v => ({
    id: videoIdFromUrl(v.link), title: v.title, published: v.published, updated: v.published,
    channelTitle: 'GpSpace', thumbnail: `https://i.ytimg.com/vi/${videoIdFromUrl(v.link)}/hqdefault.jpg`
  })).filter(v => v.id);
}

function parseYouTubePage(html) {
  const found = [];
  const seen = new Set();
  const rendererRe = /"videoRenderer"\s*:\s*\{([\s\S]*?)(?=,"videoRenderer"\s*:|,"continuationItemRenderer"\s*:|\}\s*\]\s*\}\s*\])/g;
  let m;
  while ((m = rendererRe.exec(html))) {
    const block = m[1];
    const id = (block.match(/"videoId"\s*:\s*"([\w-]{11})"/) || [, ''])[1];
    const title = (block.match(/"title"\s*:\s*\{"runs"\s*:\s*\[\s*\{"text"\s*:\s*"((?:\\.|[^"\\])*)"/) || [, ''])[1];
    if (!id || seen.has(id)) continue;
    seen.add(id);
    let decodedTitle = title || '';
    try { decodedTitle = JSON.parse('"' + decodedTitle + '"'); } catch {}
    found.push({ id, title: decodedTitle || 'GpSpace Space Video', published: '', updated: '', channelTitle: 'GpSpace', thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` });
    if (found.length >= 70) break;
  }
  return found;
}

async function youtubePage() {
  const bust = Date.now().toString();
  const html = await fetchText(`${CHANNEL_URL}/videos?sort=dd&view=0&_=${bust}`, {
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'cache-control': 'no-cache'
  });
  const videos = parseYouTubePage(html);
  if (!videos.length) throw new Error('YouTube channel page returned no videos');
  return videos;
}

async function youtubeFeed() {
  try { return await youtubeRss(); } catch (rssError) {
    try { return await youtubePage(); } catch (pageError) {
      throw new Error(`YouTube unavailable: RSS=${rssError.message}; PAGE=${pageError.message}`);
    }
  }
}

async function newsFeed() {
  const results = await Promise.allSettled(NEWS_FEEDS.map(async feed => {
    const bust = `${feed.url}${feed.url.includes('?') ? '&' : '?'}_=${Date.now()}`;
    const xml = await fetchText(bust, {
      'user-agent': 'Mozilla/5.0 (compatible; GpSpaceBot/12.1)',
      'accept': 'application/rss+xml,application/atom+xml,application/xml,text/xml;q=0.9,*/*;q=0.8',
      'cache-control': 'no-cache'
    });
    return parseFeed(xml, feed.source);
  }));

  const items = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
  const seen = new Set();
  return items.filter(item => {
    const key = item.link || item.title;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => (Date.parse(b.published) || 0) - (Date.parse(a.published) || 0)).slice(0, NEWS_RETENTION);
}


function normalizeVideo(v) {
  if (!v || !v.id) return null;
  return {
    id: v.id,
    title: v.title || 'GpSpace Space Video',
    published: v.published || '',
    updated: v.updated || v.published || '',
    channelTitle: 'GpSpace',
    thumbnail: v.thumbnail || `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`
  };
}

async function getVideoCycle(env, freshVideos = []) {
  const seed = GPSPACE_SEED_VIDEOS;
  let stored = [];
  if (env.GPSPACE_KV) {
    try { stored = JSON.parse(await env.GPSPACE_KV.get(VIDEO_KV_KEY) || '[]'); } catch { stored = []; }
  }
  const fresh = freshVideos.map(normalizeVideo).filter(Boolean);
  const combined = [];
  const seen = new Set();
  for (const v of [...fresh, ...stored, ...seed]) {
    if (!v?.id || seen.has(v.id)) continue;
    seen.add(v.id); combined.push(normalizeVideo(v));
    if (combined.length >= VIDEO_RETENTION) break;
  }
  if (env.GPSPACE_KV) await env.GPSPACE_KV.put(VIDEO_KV_KEY, JSON.stringify(combined.slice(0, VIDEO_RETENTION)));
  return combined.slice(0, VIDEO_RETENTION);
}

function questionId() {
  return crypto.randomUUID();
}

async function readQuestions(env) {
  if (!env.GPSPACE_KV) return [];
  try {
    const data = JSON.parse(await env.GPSPACE_KV.get(QUESTIONS_KV_KEY) || '[]');
    return Array.isArray(data) ? data.slice(0, QUESTION_RETENTION) : [];
  } catch { return []; }
}

async function writeQuestions(env, questions) {
  if (!env.GPSPACE_KV) throw new Error('GPSPACE_KV is not configured');
  await env.GPSPACE_KV.put(QUESTIONS_KV_KEY, JSON.stringify(questions.slice(0, QUESTION_RETENTION)));
}

function adminAuthorized(request, env, suppliedToken) {
  const configured = env.GPSPACE_ADMIN_TOKEN;
  if (!configured) return false;
  const headerToken = request.headers.get('x-gpspace-admin-token') || '';
  return suppliedToken === configured || headerToken === configured;
}

const GPSPACE_SEED_VIDEOS = [
'hNId3KriM1Y','10W-DfSsNp4','cI88XBIAvf4','0ZAdbBy-dx0','M2quJUEWbJA','76ZgnABJjnM','aw8VCPpxWpU','WFf8d5gEIzk','FAu2GoTU4FY','JXDhMX1vBWo','I_Knir_vIgI','kEsDvP1926Y','VXIe7TQ3rv8','e0iTu0X-oV0','VeJukLumaQY','RBJPtqxRXDE','r9Wr1n7Bp4M','ZHHJY6eeDjM','8Dncr36VmFg','EJHGwwNNaBs','f5TbxArlT1A','XqLGyOSimPM','BufxX_lFags','znkxOd3NrpA','GBUTNRiA4Wg','6NZnGQ2gsj0','7w7VfyWWqPs','7d7CqsC9zTw','WbfHf6uVuYM','i6WHAWMnQJ0','_lqhi_XWEeo','Ezbezm-Ue20','u76PlUVoMgs','OAh8EmyxBGg','T_WjeWURJgo','I-T0yQ3dAa4','xSwPmQgVsWA','UCcfKQJpjL4','-yn7FnduvnU','ex_ZWGxKj3E','1gmlv4dbEOY','bgUL3wCJyvk','RXJY4vvIj6E','4MeBbu63uKo','blDRJAKieHE','UCoSP6VKg84','73wwplUzRjY','f9_FvxJlGhA','RMtLW-dtJJA','yhGy1pFCicQ','j39QCGHZrFY','jTB-nPLViyU','vs_2Z4wNC0I','N_lbdbCxxQg','EsnRHYKITdA','T2ZCUrGGHoE','TmLVI_0Kbps','EPP7lg6VZ_8','NZBVu-7vaUY','lZSVRnOjMyY','v5zPvdUPJrU','yIgNBqAVIpo','FhbjVqBYcQo','JPUoLEZl4CU','RzVQjEC6_kk','KnkQ7meOyg0','YsHX9xviSm4','HMtUf2TrOP8','rVIS9PQkAx8','RXJY4vvIj6E'
].slice(0, VIDEO_RETENTION);


const PINNED_VIDEO_IDS = [
  'qFpLfc5x13E','_0sNabKuDEQ','-yn7FnduvnU','UCcfKQJpjL4','xSwPmQgVsWA','I-T0yQ3dAa4','T_WjeWURJgo','OAh8EmyxBGg','u76PlUVoMgs','Ezbezm-Ue20','_lqhi_XWEeo','i6WHAWMnQJ0','WbfHf6uVuYM','7d7CqsC9zTw','7w7VfyWWqPs','6NZnGQ2gsj0','GBUTNRiA4Wg','znkxOd3NrpA','BufxX_lFags','trF5Jxo5ikA'
];

const PINNED_TITLES = {
  'qFpLfc5x13E':'The Ultimate Space Journey 🚀 | 60+ minutes of Space Mysteries',
  '_0sNabKuDEQ':'JWST Found a Black Hole in Disguise | Could One Be Near Us?',
  '-yn7FnduvnU':'What Did Scientists Discover During the Rare 2026 Solar Eclipse?',
  'OAh8EmyxBGg':'Why is the Night Sky Dark? 🌃 | Olbers’ Paradox Explained',
  'u76PlUVoMgs':'Mission Drishti | India’s New Eye 👁 in the Sky',
  'Ezbezm-Ue20':'Did Life Land on Earth? | New Proof Found',
  '_lqhi_XWEeo':'China’s Zhurong Rover Uncovered a Secret Under the Martian Sands',
  'i6WHAWMnQJ0':'SpaceX Starship 🚀 Is Building a Multi-Planetary Pathway',
  '7d7CqsC9zTw':'NASA’s ARTEMIS 2 Mission 🚀 | Why the 50 Years Delay Explained',
  '6NZnGQ2gsj0':'Bermuda Triangle in Space? 😱 The South Atlantic Anomaly Explained',
  'trF5Jxo5ikA':'NASA’s New Telescope Might Change How We See Universe'
};

function escapeHtml(s='') { return String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function slugify(s='') { return s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,90) || 'gpspace-video'; }
function classifyTitle(title='') {
  const t=title.toLowerCase();
  if (/black hole|jwst|webb|quasar|galaxy|olbers|night sky|universe|star|cosmic/.test(t)) return 'universe';
  if (/eclipse|sun|solar|flare|corona|space weather/.test(t)) return 'sun';
  if (/roman|nasa|mission|artemis|starship|telescope|rover|drishti|spacecraft/.test(t)) return 'missions';
  if (/mars|moon|planet|asteroid|comet|zhurong/.test(t)) return 'planets';
  if (/south atlantic|magnetic|earth|gravity|pole/.test(t)) return 'earth';
  return 'space';
}
function guideFor(title='') {
  const c=classifyTitle(title);
  const t=escapeHtml(title);
  const guides={
    universe:[
      ['What the video is about',`This GpSpace guide expands on “${t}” by separating the observable evidence from the questions that remain open. Astronomy often begins with light: scientists measure its brightness, colour, spectrum, timing and motion, then use those measurements to test physical models.`],
      ['How scientists investigate it','The key is not a single dramatic image. Researchers compare observations with predictions, use multiple instruments or surveys when possible, and check whether an apparent pattern survives different measurements. That process helps distinguish a genuine astronomical signal from an interpretation or an artefact.' ],
      ['Why it matters','Questions about black holes, galaxies, stars and the dark universe connect observations made at very different distances and times. Because looking farther into space also means looking farther into the past, these observations can reveal how cosmic structures changed over billions of years.' ],
      ['What remains uncertain','A headline can make a discovery sound final even when scientists are still testing it. GpSpace presents the established observation first and treats proposed explanations as hypotheses unless they have been independently confirmed.' ]
    ],
    sun:[
      ['What the video is about',`This GpSpace guide expands on “${t}” with the science behind solar observations. The Sun is an active star, and changes in its magnetic field can produce flares, eruptions and changes in the solar wind.`],
      ['How scientists study the Sun','Scientists combine visible-light, ultraviolet, X-ray and particle measurements with spacecraft and ground-based observations. Comparing these data helps researchers connect what happens in the solar atmosphere with conditions in near-Earth space.' ],
      ['Why it matters for Earth','Strong solar activity can affect radio communication, spacecraft operations, navigation systems and other space-based technologies. Effects vary by event, so a solar headline should not automatically be interpreted as a direct danger to people on the ground.' ],
      ['What remains uncertain','Solar activity is continuously monitored, but the exact timing and strength of individual eruptions are difficult to predict. New observations improve models without making every future event predictable.' ]
    ],
    missions:[
      ['What the mission or technology does',`This GpSpace guide expands on “${t}” by explaining the mission goal, the measurements involved and why the spacecraft or telescope was built. A mission's value comes from the scientific data it can collect, not simply from the launch itself.`],
      ['How the science works','Space missions carry instruments designed for specific wavelengths, particles, fields or imaging tasks. Scientists calibrate those instruments, process the measurements and compare the results with physical models and observations from other facilities.' ],
      ['What scientists hope to learn','A mission can answer targeted questions while also producing unexpected observations. Large surveys are especially useful because they create datasets that can be compared across many objects rather than relying on one unusual example.' ],
      ['A useful distinction','Mission announcements often contain future goals as well as completed milestones. GpSpace distinguishes what has already happened from what scientists plan to investigate next.' ]
    ],
    planets:[
      ['What the video is about',`This GpSpace guide expands on “${t}” by putting the planetary science in context. Planetary surfaces and atmospheres preserve evidence about geology, impacts, climate and the history of the Solar System.`],
      ['How scientists investigate other worlds','Researchers combine orbital imaging, spectroscopy, radar, thermal measurements and, when available, measurements from landers and rovers. Different instruments reveal different physical properties, so conclusions are usually built from several lines of evidence.' ],
      ['Why it matters','Studying other worlds provides a comparison for Earth and helps scientists test ideas about how planets, moons and small bodies form and evolve. It can also reveal environments that may once have been more suitable for chemistry associated with life.' ],
      ['What remains uncertain','Planetary images can be striking, but an image alone rarely proves what caused a feature. Scientists use geological context, measurements and repeated observations to narrow down competing explanations.' ]
    ],
    earth:[
      ['What the video is about',`This GpSpace guide expands on “${t}” by explaining the physical process behind the phenomenon and what observations support it.`],
      ['How scientists study it','Researchers combine satellite measurements, ground observations, computer models and historical records where available. Comparing independent datasets is important because Earth systems can be influenced by several processes at once.' ],
      ['Why it matters','Earth and near-Earth space are connected. Changes in the atmosphere, magnetic environment and solar conditions can influence technology and the environment in different ways, so the size and timing of an effect matter.' ],
      ['What remains uncertain','Scientific monitoring improves continuously, but not every event can be predicted precisely. GpSpace separates measured effects from claims that go beyond the available evidence.' ]
    ],
    space:[
      ['What the video is about',`This GpSpace guide expands on “${t}” with additional scientific context. The goal is to explain the underlying space-science question in plain language while keeping a clear line between established observations and open questions.`],
      ['How scientists investigate it','Astronomers use telescopes, spacecraft, laboratory measurements and mathematical models. When possible, independent observations are compared so that a result does not depend on a single instrument or interpretation.' ],
      ['Why it matters','Space science helps us understand how the universe and our planetary neighbourhood work. Even apparently distant phenomena can improve our understanding of physics, planets, stars and the environment around Earth.' ],
      ['What to keep in mind','A short video can introduce a topic, but the evidence behind a claim may be more detailed. This page provides context and encourages readers to follow primary sources for mission and discovery details.' ]
    ]
  };
  return guides[c]||guides.space;
}
async function youtubeTitle(id) {
  if (PINNED_TITLES[id]) return PINNED_TITLES[id];
  try {
    const r=await fetch('https://www.youtube.com/oembed?url='+encodeURIComponent('https://www.youtube.com/watch?v='+id)+'&format=json',{headers:{'user-agent':'Mozilla/5.0 (compatible; GpSpaceBot/13.1)'}});
    if (r.ok) { const d=await r.json(); if (d.title) return d.title; }
  } catch {}
  return 'GpSpace Space Video';
}
function videoPageHtml(id,title,mode='watch') {
  const safeTitle=escapeHtml(title); const slug=slugify(title); const canonical=`https://gpspace.site/videos/watch/${id}`;
  const guide=guideFor(title);
  const sections=guide.map(([h,p])=>`<section class="info-panel"><h2>${h}</h2><p>${p}</p></section>`).join('');
  const isGuide=mode==='guide';
  const desc=`GpSpace video guide for ${safeTitle}. Read original context and watch the YouTube video on GpSpace.`;
  const ld={"@context":"https://schema.org","@type":"VideoObject","name":title,"description":desc,"thumbnailUrl":[`https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,`https://i.ytimg.com/vi/${id}/hqdefault.jpg`],"embedUrl":`https://www.youtube.com/embed/${id}`,"publisher":{"@type":"Organization","name":"GpSpace","url":"https://gpspace.site/","logo":{"@type":"ImageObject","url":"https://gpspace.site/assets/gpspace-logo.png"}},"isFamilyFriendly":true,"inLanguage":"en-IN"};
  return `<!doctype html><html lang="en-IN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="${escapeHtml(desc)}"><meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"><meta name="author" content="GpSpace"><link rel="canonical" href="${canonical}"><link rel="icon" href="/assets/favicon.png" type="image/png"><link rel="stylesheet" href="/style.css"><meta property="og:type" content="video.other"><meta property="og:site_name" content="GpSpace"><meta property="og:title" content="${safeTitle} — GpSpace"><meta property="og:description" content="${escapeHtml(desc)}"><meta property="og:url" content="${canonical}"><meta property="og:image" content="https://i.ytimg.com/vi/${id}/maxresdefault.jpg"><meta name="twitter:card" content="summary_large_image"><title>${safeTitle} — GpSpace</title><script type="application/ld+json">${JSON.stringify(ld)}</script></head><body><header class="nav"><a class="brand" href="/" aria-label="GpSpace home"><img src="/assets/gpspace-logo.png" alt="GpSpace logo"></a><nav><a href="/">Home</a><a href="/stories.html">Stories</a><a href="/live-news.html">Live News</a><a href="/videos.html">Videos</a><a href="/questions.html">Questions</a><a href="/about.html">About</a><a href="/faq.html">FAQ</a><a class="nav-cta" href="https://www.youtube.com/@Gp_space" target="_blank" rel="noopener">YouTube ↗</a></nav></header><main class="article video-watch-page"><span class="eyebrow">GPSPACE VIDEO GUIDE</span><h1>${safeTitle}</h1><p class="article-meta">GpSpace • Original context + video</p><div class="watch-player"><iframe src="https://www.youtube.com/embed/${id}?rel=0" title="${safeTitle} — GpSpace" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div><p class="watch-summary">This page adds original GpSpace context to the video so readers can understand the science behind the topic instead of encountering only an embedded player.</p><div class="two-col watch-details"><div>${sections}</div><aside><div class="info-panel"><span class="eyebrow">PRIMARY SOURCE</span><h2>Watch the original upload</h2><p>The video is hosted on the GpSpace YouTube channel. You can watch it here or open the original YouTube page.</p><a class="button ghost" href="https://www.youtube.com/watch?v=${id}" target="_blank" rel="noopener">Open on YouTube ↗</a></div><div class="info-panel"><span class="eyebrow">RELATED</span><h2>More from GpSpace</h2><p>Explore the Stories and Videos sections for related space and astronomy explanations.</p><a class="button primary" href="/videos.html">Browse all videos →</a></div></aside></div></main><footer><div><strong>GpSpace</strong><br><span>Explore • Learn • Inspire</span></div><div class="footer-links"><a href="/">Home</a><a href="/stories.html">Stories</a><a href="/live-news.html">Live News</a><a href="/videos.html">Videos</a><a href="/about.html">About</a><a href="/faq.html">FAQ</a><a href="/editorial-policy.html">Editorial Policy</a><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms</a><a href="/contact.html">Contact</a></div><div>© <span id="year"></span> GpSpace</div></footer><script src="/script.js"></script></body></html>`;
}

function sitemapXml(ids) {
  const fixed=['/','/stories.html','/live-news.html','/videos.html','/about.html','/faq.html','/editorial-policy.html','/privacy.html','/terms.html','/contact.html','/stories/roman-space-telescope.html'];
  const all=[...new Set([...fixed,...ids.map(id=>`/videos/watch/${id}`),...PINNED_VIDEO_IDS.map(id=>`/videos/watch/${id}`)])];
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${all.map(path=>`<url><loc>https://gpspace.site${path}</loc></url>`).join('')}</urlset>`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/sitemap.xml') {
      let ids = [];
      try { const fresh = await youtubeFeed(); const cycle = await getVideoCycle(env, fresh); ids = cycle.map(v => v.id); } catch {}
      return new Response(sitemapXml(ids), {headers:{'content-type':'application/xml; charset=utf-8','cache-control':'public, max-age=900'}});
    }

    const watchMatch = url.pathname.match(/^\/videos\/watch\/([A-Za-z0-9_-]{11})\/?$/);
    if (watchMatch) {
      const id=watchMatch[1];
      const title=await youtubeTitle(id);
      return new Response(videoPageHtml(id,title,'watch'), {headers:{'content-type':'text/html; charset=utf-8','cache-control':'public, max-age=300'}});
    }

    const guideMatch = url.pathname.match(/^\/stories\/video\/([A-Za-z0-9_-]{11})\/?$/);
    if (guideMatch) {
      const id=guideMatch[1];
      const title=await youtubeTitle(id);
      return new Response(videoPageHtml(id,title,'guide'), {headers:{'content-type':'text/html; charset=utf-8','cache-control':'public, max-age=300'}});
    }


    if (url.pathname === '/api/health') {
      return json({ ok: true, service: 'GpSpace API', version: '13.0', time: new Date().toISOString() }, 200, true);
    }

    if (url.pathname === '/api/youtube') {
      try {
        const fresh = await youtubeFeed();
        const videos = await getVideoCycle(env, fresh);
        return json({ ok: true, version: '13.0', retention: VIDEO_RETENTION, channelId: CHANNEL_ID, channelUrl: 'https://www.youtube.com/@Gp_space', fetchedAt: new Date().toISOString(), videos }, 200, true);
      } catch (error) {
        try {
          const videos = await getVideoCycle(env, []);
          return json({ ok: true, version: '13.0', retention: VIDEO_RETENTION, fallback: true, channelId: CHANNEL_ID, channelUrl: 'https://www.youtube.com/@Gp_space', fetchedAt: new Date().toISOString(), videos }, 200, true);
        } catch (fallbackError) {
          return json({ ok: false, version: '13.0', error: 'Unable to load YouTube feed', detail: error.message }, 502, true);
        }
      }
    }

    if (url.pathname === '/api/questions' && request.method === 'GET') {
      const questions = await readQuestions(env);
      const admin = adminAuthorized(request, env, url.searchParams.get('token') || '');
      const publicQuestions = questions.map(q => ({ ...q, answer: q.answer || null }));
      return json({ ok: true, retention: QUESTION_RETENTION, questions: publicQuestions, unansweredCount: questions.filter(q => !q.answer).length, admin });
    }

    if (url.pathname === '/api/questions' && request.method === 'POST') {
      try {
        const body = await request.json();
        const action = body.action || 'ask';
        const questions = await readQuestions(env);

        if (action === 'ask') {
          const name = String(body.name || 'Anonymous').trim().slice(0, 60) || 'Anonymous';
          const question = String(body.question || '').trim().slice(0, 500);
          if (question.length < 3) return json({ ok: false, error: 'Please enter a question.' }, 400, true);
          const record = { id: questionId(), name, question, answer: null, createdAt: new Date().toISOString(), answeredAt: null };
          const next = [record, ...questions].slice(0, QUESTION_RETENTION);
          await writeQuestions(env, next);
          return json({ ok: true, question: record, retention: QUESTION_RETENTION, message: 'Your question has been submitted.' }, 201, true);
        }

        if (!adminAuthorized(request, env, body.token || '')) return json({ ok: false, error: 'Unauthorized' }, 401, true);

        if (action === 'answer') {
          const id = String(body.id || '');
          const answer = String(body.answer || '').trim().slice(0, 2000);
          const index = questions.findIndex(q => q.id === id);
          if (index < 0) return json({ ok: false, error: 'Question not found.' }, 404, true);
          if (answer.length < 1) return json({ ok: false, error: 'Please enter an answer.' }, 400, true);
          questions[index] = { ...questions[index], answer, answeredAt: new Date().toISOString() };
          await writeQuestions(env, questions);
          return json({ ok: true, question: questions[index] }, 200, true);
        }

        if (action === 'delete') {
          const id = String(body.id || '');
          const next = questions.filter(q => q.id !== id);
          await writeQuestions(env, next);
          return json({ ok: true, questions: next, retention: QUESTION_RETENTION }, 200, true);
        }

        return json({ ok: false, error: 'Unknown action.' }, 400, true);
      } catch (error) {
        return json({ ok: false, error: error.message }, 500, true);
      }
    }

    if (url.pathname === '/api/news') {
      try {
        const news = await newsFeed();
        return json({ ok: true, version: '12.1', fetchedAt: new Date().toISOString(), sources: NEWS_FEEDS.map(f => f.source), news }, 200, true);
      } catch (error) {
        return json({ ok: false, version: '12.1', error: 'Unable to load news feeds', detail: error.message }, 502, true);
      }
    }

    return env.ASSETS.fetch(request);
  }
};
