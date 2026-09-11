const CHANNEL_ID = 'UCi8mXSRouesT1xVkf81wbzg';
const FEED_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;

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
  const escaped = name.replace(':', '\\:');
  const re = new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)</${escaped}>`, 'i');
  return xmlDecode((block.match(re) || [, ''])[1].trim());
}

function atomLink(block) {
  const m = block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
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

function json(data, status = 200, maxAge = 300) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': `public, max-age=${maxAge}, s-maxage=600`,
      'access-control-allow-origin': '*',
      'x-gpspace-api': 'v11'
    }
  });
}

async function youtubeFeed() {
  const upstream = await fetch(FEED_URL, {
    headers: {
      'user-agent': 'GpSpace/11.0 (+https://gpspace.gpspace-one.workers.dev)',
      'accept': 'application/atom+xml,application/xml,text/xml;q=0.9,*/*;q=0.8'
    },
    cf: { cacheTtl: 600, cacheEverything: true }
  });
  if (!upstream.ok) throw new Error(`YouTube returned ${upstream.status}`);
  return parseFeed(await upstream.text(), 'GpSpace').slice(0, 15).map(v => ({
    id: (v.link.match(/\/watch\?v=([^&]+)/) || [, ''])[1],
    title: v.title,
    published: v.published,
    updated: v.published,
    channelTitle: 'GpSpace',
    thumbnail: ''
  })).filter(v => v.id);
}

async function newsFeed() {
  const results = await Promise.allSettled(NEWS_FEEDS.map(async feed => {
    const response = await fetch(feed.url, {
      headers: {
        'user-agent': 'GpSpace/11.0 (+https://gpspace.gpspace-one.workers.dev)',
        'accept': 'application/rss+xml,application/atom+xml,application/xml,text/xml;q=0.9,*/*;q=0.8'
      },
      cf: { cacheTtl: 600, cacheEverything: true }
    });
    if (!response.ok) throw new Error(`${feed.source} returned ${response.status}`);
    return parseFeed(await response.text(), feed.source);
  }));

  const items = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
  const seen = new Set();
  return items
    .filter(item => {
      const key = item.link || item.title;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => {
      const da = Date.parse(a.published) || 0, db = Date.parse(b.published) || 0;
      return db - da;
    })
    .slice(0, 24);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/health') {
      return json({ ok: true, service: 'GpSpace API', version: '11', time: new Date().toISOString() }, 200, 60);
    }

    if (url.pathname === '/api/youtube') {
      try {
        const videos = await youtubeFeed();
        return json({
          ok: true, version: '11', channelId: CHANNEL_ID,
          channelUrl: 'https://www.youtube.com/@Gp_space',
          fetchedAt: new Date().toISOString(), videos
        });
      } catch (error) {
        return json({ ok: false, version: '11', error: 'Unable to load YouTube feed' }, 502, 30);
      }
    }

    if (url.pathname === '/api/news') {
      try {
        const news = await newsFeed();
        return json({
          ok: true, version: '11',
          fetchedAt: new Date().toISOString(),
          sources: NEWS_FEEDS.map(f => f.source),
          news
        }, 200, 300);
      } catch (error) {
        return json({ ok: false, version: '11', error: 'Unable to load news feeds' }, 502, 30);
      }
    }

    return env.ASSETS.fetch(request);
  }
};
