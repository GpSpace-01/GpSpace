const questionList = document.getElementById('questionList');
const questionForm = document.getElementById('questionForm');
const questionStatus = document.getElementById('questionStatus');
const questionCount = document.getElementById('questionCount');
const questionRefresh = document.getElementById('questionRefresh');

function escapeQuestion(value='') { const d=document.createElement('div'); d.textContent=value; return d.innerHTML; }
function renderQuestions(items=[]) {
  if (!items.length) { questionList.innerHTML='<div class="loading-card">No questions yet. Be the first to ask GpSpace.</div>'; return; }
  questionList.innerHTML = items.map(q => `<article class="public-question-card"><div class="question-card-head"><span class="question-number">QUESTION</span><time>${new Date(q.createdAt).toLocaleString('en-IN')}</time></div><h3>${escapeQuestion(q.question)}</h3><p class="question-author">Asked by ${escapeQuestion(q.name || 'Anonymous')}</p>${q.answer ? `<div class="answer-box"><strong>🚀 GpSpace Answer</strong><p>${escapeQuestion(q.answer)}</p></div>` : '<div class="waiting-answer">🔔 Waiting for a GpSpace answer</div>'}</article>`).join('');
}
async function loadQuestions() {
  try {
    const r = await fetch('/api/questions?ts='+Date.now(), {cache:'no-store'}); if(!r.ok) throw new Error();
    const d = await r.json(); renderQuestions(d.questions || []); questionCount.textContent = `${d.unansweredCount || 0}`;
  } catch { questionList.innerHTML='<div class="loading-card">Questions are temporarily unavailable.</div>'; questionCount.textContent='—'; }
}
questionForm?.addEventListener('submit', async e => {
  e.preventDefault(); questionStatus.textContent='Submitting…';
  const name=document.getElementById('questionName').value.trim(); const question=document.getElementById('questionText').value.trim();
  try { const r=await fetch('/api/questions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name,question})}); const d=await r.json(); if(!r.ok) throw new Error(d.error||'Could not submit'); questionForm.reset(); questionStatus.textContent='✓ Your question was submitted successfully.'; loadQuestions(); }
  catch(err){ questionStatus.textContent='Could not submit: '+err.message; }
});
questionRefresh?.addEventListener('click', loadQuestions); loadQuestions();
