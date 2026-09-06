const GPSPACE_CHANNEL_ID = 'UCi8mXSRouesT1xVkf81wbzg';
const GPSPACE_CHANNEL_URL = 'https://www.youtube.com/@Gp_space';

// Existing videos are kept as a fallback so the hub still works if YouTube's feed is temporarily unavailable.
const GPSPACE_VIDEOS = [
'hNId3KriM1Y','10W-DfSsNp4','cI88XBIAvf4','0ZAdbBy-dx0','M2quJUEWbJA','76ZgnABJjnM','aw8VCPpxWpU','WFf8d5gEIzk','FAu2GoTU4FY','JXDhMX1vBWo','I_Knir_vIgI','kEsDvP1926Y','VXIe7TQ3rv8','e0iTu0X-oV0','VeJukLumaQY','RBJPtqxRXDE','r9Wr1n7Bp4M','ZHHJY6eeDjM','8Dncr36VmFg','EJHGwwNNaBs','f5TbxArlT1A','XqLGyOSimPM','BufxX_lFags','znkxOd3NrpA','GBUTNRiA4Wg','6NZnGQ2gsj0','7w7VfyWWqPs','7d7CqsC9zTw','WbfHf6uVuYM','i6WHAWMnQJ0','_lqhi_XWEeo','Ezbezm-Ue20','u76PlUVoMgs','OAh8EmyxBGg','T_WjeWURJgo','I-T0yQ3dAa4','xSwPmQgVsWA','UCcfKQJpjL4','-yn7FnduvnU','ex_ZWGxKj3E','1gmlv4dbEOY','bgUL3wCJyvk','RXJY4vvIj6E','4MeBbu63uKo','blDRJAKieHE','UCoSP6VKg84','73wwplUzRjY','f9_FvxJlGhA','RMtLW-dtJJA','yhGy1pFCicQ','j39QCGHZrFY','jTB-nPLViyU','vs_2Z4wNC0I','N_lbdbCxxQg','EsnRHYKITdA','T2ZCUrGGHoE','TmLVI_0Kbps','EPP7lg6VZ_8','NZBVu-7vaUY','lZSVRnOjMyY','v5zPvdUPJrU','yIgNBqAVIpo','FhbjVqBYcQo','JPUoLEZl4CU','RzVQjEC6_kk','KnkQ7meOyg0','YsHX9xviSm4','HMtUf2TrOP8','rVIS9PQkAx8','RXJY4vvIj6E'
];
const SHORT_IDS = new Set(['hNId3KriM1Y','10W-DfSsNp4','cI88XBIAvf4','0ZAdbBy-dx0','M2quJUEWbJA','76ZgnABJjnM','aw8VCPpxWpU','WFf8d5gEIzk','FAu2GoTU4FY','JXDhMX1vBWo','I_Knir_vIgI','kEsDvP1926Y','VXIe7TQ3rv8','e0iTu0X-oV0','VeJukLumaQY','RBJPtqxRXDE','r9Wr1n7Bp4M','ZHHJY6eeDjM','8Dncr36VmFg','ex_ZWGxKj3E','1gmlv4dbEOY','bgUL3wCJyvk','RXJY4vvIj6E','4MeBbu63uKo','blDRJAKieHE','UCoSP6VKg84','73wwplUzRjY','f9_FvxJlGhA','RMtLW-dtJJA','yhGy1pFCicQ','j39QCGHZrFY','jTB-nPLViyU','vs_2Z4wNC0I','N_lbdbCxxQg','rVIS9PQkAx8']);
const fallbackTitles = {'hNId3KriM1Y':'GpSpace Space Discovery','10W-DfSsNp4':'Amazing Space Fact','cI88XBIAvf4':'A Mystery From Space','0ZAdbBy-dx0':'The Universe Is Stranger Than You Think','M2quJUEWbJA':'One Minute Space Discovery'};
const keywordMap = {
  earth:['earth','magnetic','pole','geomagnetic','space weather','solar storm','satellite','power grid','aurora'],
  sun:['sun','solar','eclipse','flare','corona','coronal','sunspot','solar storm'],
  missions:['nasa','jwst','james webb','roman','telescope','falcon','rocket','mission','spacecraft','satellite','danuri'],
  universe:['black hole','galaxy','galaxies','universe','big bang','star','stars','cosmic','quasar','light year','exoplanet'],
  planets:['moon','mars','jupiter','saturn','venus','mercury','planet','solar system','asteroid','comet']
};
function categoriesFor(title){const t=title.toLowerCase();const cats=[];for(const [cat,words] of Object.entries(keywordMap)){if(words.some(w=>t.includes(w)))cats.push(cat)}return cats.length?cats:['universe']}
function typeFor(id, isShort){return isShort||SHORT_IDS.has(id)?'shorts':'long'}
function labelFor(cat){return ({earth:'Earth & Space Weather',sun:'Sun & Solar',missions:'Missions & Telescopes',universe:'Universe & Astronomy',planets:'Planets & Moon'})[cat]||'Universe & Astronomy'}
async function getTitle(id){try{const u='https://www.youtube.com/oembed?url='+encodeURIComponent('https://www.youtube.com/watch?v='+id)+'&format=json';const r=await fetch(u);if(!r.ok)throw 0;const d=await r.json();return d.title||fallbackTitles[id]||'GpSpace Space Video'}catch{return fallbackTitles[id]||'GpSpace Space Video'}}
function thumb(id){return 'https://i.ytimg.com/vi/'+id+'/hqdefault.jpg'}
const grid=document.getElementById('videoGrid');const player=document.getElementById('featuredPlayer');const featuredTitle=document.getElementById('featuredTitle');const featuredYoutube=document.getElementById('featuredYoutube');let records=[];
function setFeatured(v){player.src='https://www.youtube.com/embed/'+v.id+'?rel=0&autoplay=1';featuredTitle.textContent=v.title;featuredYoutube.href='https://www.youtube.com/watch?v='+v.id;document.getElementById('videos').scrollIntoView({behavior:'smooth',block:'start'})}
function render(filter='all'){grid.innerHTML='';const list=records.filter(v=>filter==='all'||v.type===filter||v.categories.includes(filter));if(!list.length){grid.innerHTML='<div class="loading-card">No videos found in this category yet.</div>';return}list.forEach(v=>{const card=document.createElement('article');card.className='yt-card';card.innerHTML='<a href="#videos" class="yt-thumb"><img loading="lazy" src="'+thumb(v.id)+'" alt="'+v.title.replace(/"/g,'&quot;')+'"><span class="yt-badge">'+(v.type==='shorts'?'SHORT':'VIDEO')+'</span><span class="yt-play">▶</span></a><div class="yt-body"><h3>'+v.title+'</h3><p>'+labelFor(v.categories[0])+'</p></div>';card.querySelector('.yt-thumb').addEventListener('click',e=>{e.preventDefault();setFeatured(v)});grid.appendChild(card)})}
async function loadAutomaticFeed(){
  try {
    const response = await fetch('/api/youtube?channel='+encodeURIComponent(GPSPACE_CHANNEL_ID), {cache:'no-store'});
    if(!response.ok) throw new Error('feed');
    const data = await response.json();
    if(!Array.isArray(data.videos)||!data.videos.length) throw new Error('empty');
    const auto = data.videos.map(v=>({id:v.id,title:v.title||'GpSpace Space Video',type:typeFor(v.id,false),categories:categoriesFor(v.title||''),published:v.published,automatic:true}));
    return auto;
  } catch { return null; }
}
(async()=>{
  grid.innerHTML='<div class="loading-card">Loading the latest GpSpace videos…</div>';
  const automatic=await loadAutomaticFeed();
  if(automatic){
    const autoIds=new Set(automatic.map(v=>v.id));
    const fallback=await Promise.all([...new Set(GPSPACE_VIDEOS)].filter(id=>!autoIds.has(id)).map(async id=>{const title=await getTitle(id);return {id,title,type:typeFor(id),categories:categoriesFor(title),automatic:false}}));
    records=[...automatic,...fallback];
  } else {
    const unique=[...new Set(GPSPACE_VIDEOS)];
    records=await Promise.all(unique.map(async id=>{const title=await getTitle(id);return {id,title,type:typeFor(id),categories:categoriesFor(title),automatic:false}}));
  }
  if(records[0]){featuredTitle.textContent=records[0].title;featuredYoutube.href='https://www.youtube.com/watch?v='+records[0].id;player.src='https://www.youtube.com/embed/'+records[0].id+'?rel=0'}
  render();
  document.querySelectorAll('.filter-btn').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');render(btn.dataset.filter)}));
})();
