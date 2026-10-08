/* Navigation for the HTML5 UP Dimension-based layout.
 * Replaces timer-based modal transitions with deterministic hash navigation.
 * Original layout: HTML5 UP / @ajlkn, CC BY 3.0, https://html5up.net/license
 */
(function(){
  'use strict';
  const main=document.getElementById('main'),header=document.getElementById('header'),footer=document.getElementById('footer');
  const articles=[...main.children].filter(node=>node.tagName==='ARTICLE');
  let returnFocus=null,active=null;
  articles.forEach(article=>{
    const heading=article.querySelector('h2');if(heading&&!heading.id)heading.id=article.id+'-heading';
    article.setAttribute('role','dialog');article.setAttribute('aria-modal','true');article.tabIndex=-1;
    if(heading)article.setAttribute('aria-labelledby',heading.id);
    const close=document.createElement('button');close.type='button';close.className='close';close.setAttribute('aria-label','Закрыть окно');close.textContent='Закрыть';
    close.addEventListener('click',()=>location.hash='');article.appendChild(close);
  });
  function route(){
    const id=location.hash.slice(1),next=articles.find(a=>a.id===id)||null;
    if(next&&!active)returnFocus=document.activeElement;
    articles.forEach(a=>{a.style.display=a===next?'block':'none';a.classList.toggle('active',a===next);});
    active=next;main.style.display=next?'block':'none';header.style.display=next?'none':'';footer.style.display=next?'none':'';
    document.body.classList.toggle('is-article-visible',!!next);header.inert=!!next;footer.inert=!!next;
    window.scrollTo(0,0);
    if(next)requestAnimationFrame(()=>next.focus({preventScroll:true}));
    else if(returnFocus?.isConnected&&returnFocus.getClientRects().length){returnFocus.focus({preventScroll:true});returnFocus=null;}
  }
  addEventListener('hashchange',route);route();
  addEventListener('load',()=>document.body.classList.remove('is-preload'));
  setTimeout(()=>document.body.classList.remove('is-preload'),500);
  document.addEventListener('click',event=>{if(active&&!event.target.closest('#main article, #auth-controls'))location.hash='';});
  document.addEventListener('keydown',event=>{
    if(!active)return;
    if(event.key==='Escape'){event.preventDefault();location.hash='';return;}
    if(event.key!=='Tab')return;
    const controls=[...active.querySelectorAll('a[href],button,input,select,textarea,[tabindex="0"]')].filter(e=>!e.disabled&&e.getClientRects().length);
    const first=controls[0],last=controls.at(-1);
    if(!first){event.preventDefault();active.focus();return;}
    if(event.shiftKey&&(document.activeElement===first||document.activeElement===active)){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===active)){event.preventDefault();first.focus();}
  });
})();
