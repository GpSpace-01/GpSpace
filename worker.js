const CHANNEL_ID = 'UCi8mXSRouesT1xVkf81wbzg';
const FEED_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;

function xmlDecode(value = '') {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function tag(block, name) {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i');
  return xmlDecode((block.match(re) || [, ''])[1].trim());
}

function parseFeed(xml) {
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)].map(m => m[1]);
  return entries.map(entry => {
    const id = tag(entry, 'yt:videoId');
    const title = tag(entry, 'title');
    const published = tag(entry, 'published');
    const updated = tag(entry, 'updated');
    const channelTitle = tag(entry, 'name');
    return {
      id,
      title,
      published,
      updated,
      channelTitle,
      thumbnail: id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : ''
    };
  }).filter(v => v.id && v.title);
}

function json(data, status = 200, maxAge = 300) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': `public, max-age=${maxAge}, s-maxage=600`,
      'access-control-allow-origin': '*',
      'x-gpspace-api': 'v7'
    }
  });
}

async function youtubeFeed() {
  const upstream = await fetch(FEED_URL, {
    headers: {
      'user-agent': 'GpSpace/7.0 (+https://gpspace.gpspace-one.workers.dev)',
      'accept': 'application/atom+xml,application/xml,text/xml;q=0.9,*/*;q=0.8'
    },
    cf: { cacheTtl: 600, cacheEverything: true }
  });
  if (!upstream.ok) throw new Error(`YouTube returned ${upstream.status}`);
  return parseFeed(await upstream.text()).slice(0, 15);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/health') {
      return json({ ok: true, service: 'GpSpace YouTube API', version: '7', time: new Date().toISOString() }, 200, 60);
    }

    if (url.pathname === '/api/youtube') {
      try {
        const videos = await youtubeFeed();
        return json({
          ok: true,
          version: '7',
          channelId: CHANNEL_ID,
          channelUrl: 'https://www.youtube.com/@Gp_space',
          fetchedAt: new Date().toISOString(),
          videos
        });
      } catch (error) {
        return json({ ok: false, version: '7', error: 'Unable to load YouTube feed' }, 502, 30);
      }
    }

    return env.ASSETS.fetch(request);
  }
};
