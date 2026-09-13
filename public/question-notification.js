(async function(){
  const badges=document.querySelectorAll('.question-badge');
  async function update(){try{const r=await fetch('/api/questions?ts='+Date.now(),{cache:'no-store'});if(!r.ok)return;const d=await r.json();badges.forEach(b=>{const n=Number(d.unansweredCount||0);b.textContent=n>99?'99+':n;b.hidden=n===0;});}catch{}}
  update(); setInterval(update,30000);
})();
