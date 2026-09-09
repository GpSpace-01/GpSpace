const newsGrid = document.querySelector('#newsGrid');
const newsStatus = document.querySelector('#newsStatus');
const newsRefresh = document.querySelector('#newsRefresh');

function newsEscape(value='') {
  const d = document.createElement('div');
  d.textContent = value;
  return d.innerHTML;
}
function relativeNewsTime(value) {
  const t = Date.parse(value);
  if (!t) return '';
  const mins = Math.max(0, Math.floor((Date.now() - t) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
function renderNews(items) {
  if (!items.length) {
    newsGrid.innerHTML = '<div class="news-empty">No live headlines are available right now. Please try again shortly.</div>';
    return;
  }
  newsGrid.innerHTML = items.map(item => `
    <article class="news-card">
      <div class="news-top">
        <span class="news-source">${newsEscape(item.source || 'Space Science')}</span>
        <span class="news-time">${newsEscape(relativeNewsTime(item.published))}</span>
      </div>
      <h3>${newsEscape(item.title)}</h3>
      <p>${newsEscape(item.description || 'Read the original report for the latest details.')}</p>
      <a class="news-link" href="${encodeURI(item.link)}" target="_blank" rel="noopener noreferrer">Read original story ↗</a>
    </article>
  `).join('');
}
async function loadNews() {
  if (!newsGrid) return;
  newsGrid.innerHTML = '<div class="news-loading">Loading the latest space & science headlines…</div>';
  if (newsStatus) newsStatus.textContent = 'Updating…';
  try {
    const response = await fetch('/api/news', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error('News feed unavailable');
    renderNews(data.news || []);
    if (newsStatus) {
      const time = new Date(data.fetchedAt);
      newsStatus.textContent = `Updated ${time.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}`;
    }
  } catch (error) {
    newsGrid.innerHTML = '<div class="news-empty">Live news is temporarily unavailable. Please try again in a few minutes.</div>';
    if (newsStatus) newsStatus.textContent = 'Feed temporarily unavailable';
  }
}
if (newsRefresh) newsRefresh.addEventListener('click', loadNews);
loadNews();
setInterval(loadNews, 10 * 60 * 1000);
