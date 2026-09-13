const CHANNEL_ID = 'UCi8mXSRouesT1xVkf81wbzg';
const CHANNEL_URL = 'https://www.youtube.com/@Gp_space';

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
      'x-gpspace-api': 'v12-fixed'
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
  return parsed.slice(0, 15).map(v => ({
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
    if (found.length >= 15) break;
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
  }).sort((a, b) => (Date.parse(b.published) || 0) - (Date.parse(a.published) || 0)).slice(0, 24);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/health') {
      return json({ ok: true, service: 'GpSpace API', version: '12.1', time: new Date().toISOString() }, 200, true);
    }

    if (url.pathname === '/api/youtube') {
      try {
        const videos = await youtubeFeed();
        return json({ ok: true, version: '12.1', channelId: CHANNEL_ID, channelUrl: 'https://www.youtube.com/@Gp_space', fetchedAt: new Date().toISOString(), videos }, 200, true);
      } catch (error) {
        return json({ ok: false, version: '12.1', error: 'Unable to load YouTube feed', detail: error.message }, 502, true);
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
