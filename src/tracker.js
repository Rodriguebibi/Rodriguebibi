/* Lorick Innovation — mesure d'audience (anonyme, sans cookie tiers). */
(function(){
  try{
    var ls=window.localStorage,ss=window.sessionStorage,q=location.search;
    if(/[?&]lk_ignore=1/.test(q)){ls.setItem('lk_ignore','1');}
    if(/[?&]lk_ignore=0/.test(q)){ls.removeItem('lk_ignore');}
    if(ls.getItem('lk_ignore')==='1')return;
  }catch(_){}
  var E='/api/collect';
  function rid(){var a='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',s='',c=window.crypto&&crypto.getRandomValues?crypto.getRandomValues(new Uint8Array(18)):null;for(var i=0;i<18;i++)s+=a[(c?c[i]:Math.floor(Math.random()*256))%62];return s;}
  function store(st,k,mk){try{var v=st.getItem(k);if(v)return[v,0];v=mk();st.setItem(k,v);return[v,1];}catch(_){return[mk(),1];}}
  var V=store(localStorage,'lk_vid',rid),S;
  /* Une visite = même onglet sans 30 min d'inactivité */
  try{var o=(sessionStorage.getItem('lk_sid')||'').split('|');S=(o[0]&&Date.now()-(+o[1]||0)<1800000)?[o[0],0]:[rid(),1];}catch(_){S=[rid(),1];}
  function touch(){try{sessionStorage.setItem('lk_sid',S[0]+'|'+Date.now());}catch(_){}}touch();
  function send(o){
    o.s=S[0];var b=JSON.stringify(o);
    try{if(navigator.sendBeacon&&navigator.sendBeacon(E,new Blob([b],{type:'text/plain'})))return;}catch(_){}
    try{fetch(E,{method:'POST',body:b,keepalive:true,headers:{'Content-Type':'text/plain'}});}catch(_){}
  }
  var utm=(q.match(/[?&]utm_source=([^&]+)/)||[])[1]||'';try{utm=decodeURIComponent(utm);}catch(_){utm='';}
  send({e:'v',u:V[0],n:V[1],p:location.pathname,r:document.referrer||'',m:utm,w:innerWidth});

  /* Repérage des sections de la page */
  var MAP=[['#hero','accueil'],['#tunnel','probleme'],['#pourquoi','partenaire'],['section[aria-label="Psychologie et copywriting"]','psychologie'],
    ['section[aria-label="Leviers de décision"]','leviers'],['section[aria-labelledby="h-vs"]','comparatif'],['#methode','methode'],['#projets','projets'],
    ['#resultats','resultats'],['#avis','avis'],['section[aria-labelledby="h-ab"]','apropos'],['#services','services'],
    ['section[aria-labelledby="h-s"]','secteurs'],['#process','process'],['#faq','faq'],['footer.foot','final']];
  var secs=[];MAP.forEach(function(m){var el=document.querySelector(m[0]);if(el)secs.push([el,m[1]]);});
  function at(y){var best=null;for(var i=0;i<secs.length;i++){var r=secs[i][0].getBoundingClientRect();if(r.top<=y&&r.bottom>y)return secs[i][1];if(r.top<=y)best=secs[i][1];}return best;}
  function sectionOf(el){for(var i=0;i<secs.length;i++)if(secs[i][0].contains(el))return secs[i][1];return null;}

  var acc={},n=0,seen={},fresh=[],maxSc=0,last=Date.now(),cur=null;
  ['scroll','mousemove','touchstart','keydown','click','wheel'].forEach(function(t){addEventListener(t,function(){last=Date.now();},{passive:true});});
  setInterval(function(){
    if(document.visibilityState!=='visible'||Date.now()-last>60000)return;
    var h=innerHeight;cur=at(h*0.45);
    if(cur){acc[cur]=(acc[cur]||0)+1;n++;}
    for(var i=0;i<secs.length;i++){var k=secs[i][1];if(!seen[k]&&secs[i][0].getBoundingClientRect().top<h*0.7){seen[k]=1;fresh.push(k);}}
    var de=document.documentElement,sc=Math.round((scrollY+h)/Math.max(1,de.scrollHeight)*100);if(sc>maxSc)maxSc=Math.min(100,sc);
    if(n>=20)flush();
  },1000);
  function flush(){
    if(!n&&!fresh.length)return;
    send({e:'t',t:acc,r:fresh,sc:maxSc,ls:cur});
    acc={};n=0;fresh=[];touch();
  }
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden')flush();});
  addEventListener('pagehide',flush);

  /* Prises de contact (WhatsApp) */
  document.addEventListener('click',function(e){
    var a=e.target&&e.target.closest&&e.target.closest('a[href*="wa.me"],a[href*="whatsapp"],a[href^="tel:"],a[href^="mailto:"]');
    if(!a)return;flush();send({e:'c',z:sectionOf(a)||'autre'});
  },true);
})();
