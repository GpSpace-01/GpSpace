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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/health') {
      return json({ ok: true, service: 'GpSpace API', version: '12.1', time: new Date().toISOString() }, 200, true);
    }

    if (url.pathname === '/api/youtube') {
      try {
        const fresh = await youtubeFeed();
        const videos = await getVideoCycle(env, fresh);
        return json({ ok: true, version: '12.2', retention: VIDEO_RETENTION, channelId: CHANNEL_ID, channelUrl: 'https://www.youtube.com/@Gp_space', fetchedAt: new Date().toISOString(), videos }, 200, true);
      } catch (error) {
        try {
          const videos = await getVideoCycle(env, []);
          return json({ ok: true, version: '12.2', retention: VIDEO_RETENTION, fallback: true, channelId: CHANNEL_ID, channelUrl: 'https://www.youtube.com/@Gp_space', fetchedAt: new Date().toISOString(), videos }, 200, true);
        } catch (fallbackError) {
          return json({ ok: false, version: '12.2', error: 'Unable to load YouTube feed', detail: error.message }, 502, true);
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
