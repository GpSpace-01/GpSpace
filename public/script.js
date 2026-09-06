const nav=document.querySelector('.nav');
const year=document.querySelector('#year');
const update=()=>nav.classList.toggle('scrolled',window.scrollY>20);
window.addEventListener('scroll',update,{passive:true});update();
if(year) year.textContent=new Date().getFullYear();
