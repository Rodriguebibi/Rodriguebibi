/* Console Lorick — tableau de bord. */
import { barsScene, attentionScene } from './scenes.js';

const $ = id => document.getElementById(id);
const NF = new Intl.NumberFormat('fr-FR');
const nf = n => NF.format(Math.round(n || 0));
const pct = (a, b) => (b ? Math.round(a / b * 100) : 0);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let REGION; try { REGION = new Intl.DisplayNames(['fr'], { type: 'region' }); } catch (_) {}
const country = cc => (cc && cc !== '??' && REGION ? (REGION.of(cc) || cc) : 'Inconnu');
const flag = cc => (cc && /^[A-Z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc].map(c => 0x1F1A5 + c.charCodeAt(0))) : '🌐');

const SECTIONS = [
  ['accueil', 'Accueil'], ['probleme', 'Le problème'], ['partenaire', 'Partenaire tunnel'], ['psychologie', 'Psychologie & copywriting'],
  ['leviers', 'Leviers de décision'], ['comparatif', 'Deux options'], ['methode', 'Méthode'], ['projets', 'Projets'],
  ['resultats', 'Résultats'], ['avis', 'Avis clients'], ['apropos', 'À propos'], ['services', 'Services'],
  ['secteurs', 'Secteurs'], ['process', 'Process en 4 étapes'], ['faq', 'FAQ'], ['final', 'Appel final']
];
const SEC = Object.fromEntries(SECTIONS.concat([['autre', 'Ailleurs sur la page']]));
const PAL = ['#0F62FF', '#4D8BFF', '#8DB2FF', '#FFE100', '#3DDC97', '#B18CFF', '#FF8A5C', '#5F657A'];

function dur(s) {
  s = Math.round(s || 0);
  if (s < 60) return s + ' s';
  const m = Math.floor(s / 60), r = s % 60;
  if (m < 60) return m + ' min' + (r ? ' ' + String(r).padStart(2, '0') + ' s' : '');
  return Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0');
}
function durHTML(s) {
  s = Math.round(s || 0);
  if (s < 60) return s + '<small>s</small>';
  const m = Math.floor(s / 60), r = s % 60;
  return m + '<small>min</small>' + String(r).padStart(2, '0') + '<small>s</small>';
}
function ago(t) {
  const d = (Date.now() - t) / 1000;
  if (d < 60) return 'à l’instant';
  if (d < 3600) return 'il y a ' + Math.floor(d / 60) + ' min';
  if (d < 86400) return 'il y a ' + Math.floor(d / 3600) + ' h';
  if (d < 172800) return 'hier';
  return new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}
function delta(cur, prev, invert) {
  if (!prev && !cur) return '<span class="chip flat">—</span>';
  if (!prev) return '<span class="chip up">nouveau</span>';
  const v = Math.round((cur - prev) / prev * 100);
  if (!v) return '<span class="chip flat">= 0 %</span>';
  const good = invert ? v < 0 : v > 0;
  return `<span class="chip ${good ? 'up' : 'down'}">${v > 0 ? '▲' : '▼'} ${Math.abs(v)} %</span>`;
}
const top = (o, n) => Object.entries(o || {}).map(([k, v]) => [k, Number(v) || 0]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, n || 99);
function count(el, to, fmt) {
  const from = Number(el.dataset.v || 0); el.dataset.v = to;
  const t0 = performance.now(), D = 900;
  (function f() {
    const k = Math.min(1, (performance.now() - t0) / D), e = 1 - Math.pow(1 - k, 3);
    el.innerHTML = fmt(from + (to - from) * e);
    if (k < 1) requestAnimationFrame(f);
  })();
}

/* ---------- Scènes 3D ---------- */
let bars, att;
try { bars = barsScene($('barsStage'), $('barsLabels'), $('barsTip')); } catch (e) { console.error(e); bars = { set() {} }; }
try { att = attentionScene($('attStage'), $('attTip'), k => markRow(k)); } catch (e) { console.error(e); att = { set() {}, focus() {} }; }

/* ---------- État ---------- */
let days = 7, demo = false, last = null, timer = 0;

async function load() {
  if (demo) return render(fake(days));
  let r;
  try { r = await fetch('/api/stats?days=' + days, { credentials: 'same-origin', cache: 'no-store' }); }
  catch (_) { return notice('net'); }
  if (r.status === 401) { location.replace('/login'); return; }
  if (r.status === 503) { notice('nodb'); render(empty()); return; }
  if (!r.ok) return notice('err');
  const d = await r.json();
  last = d;
  const hasAny = d.series.some(x => x.v > 0) || d.recent.length;
  notice(hasAny ? '' : d.globalLock ? '' : 'nodata');
  if (d.globalLock) notice('lock', d.globalLock);
  render(d);
}

function schedule() {
  clearInterval(timer);
  timer = setInterval(() => { if (document.visibilityState === 'visible') load(); }, days <= 7 ? 60000 : 300000);
}

/* ---------- Rendu ---------- */
function render(d) {
  const c = d.cur, p = d.prev;
  const per = { 1: 'aujourd’hui', 7: 'ces 7 derniers jours', 30: 'ces 30 derniers jours', 90: 'ces 90 derniers jours' }[d.days] || ('ces ' + d.days + ' derniers jours');
  $('periodLbl').textContent = { 1: 'Aujourd’hui', 7: '7 derniers jours', 30: '30 derniers jours', 90: '90 derniers jours' }[d.days] || d.days + ' jours';
  const h = new Date().getHours();
  $('hello').innerHTML = (h >= 18 || h < 5 ? 'Bonsoir' : 'Bonjour') + ' Rodrigue<span class="hl">.</span>';
  $('heroLead').innerHTML = c.views
    ? `Ton site a reçu <b>${nf(c.views)}</b> visite${c.views > 1 ? 's' : ''} ${per}` + (c.contacts ? `, et <b class="hl">${nf(c.contacts)}</b> personne${c.contacts > 1 ? 's t’ont' : ' t’a'} écrit sur WhatsApp.` : '.')
    : `Aucune visite enregistrée ${per} pour l’instant.`;

  // Chiffres clés
  count($('kV'), c.views, nf); $('kVf').innerHTML = delta(c.views, p.views) + '<span>vs période précédente</span>';
  count($('kU'), c.uniques, nf); $('kUf').innerHTML = delta(c.uniques, p.uniques) + `<span>${nf(c.nv && c.nv['Nouveaux'])} nouveaux</span>`;
  const pAvg = p.views ? p.timeTotal / p.views : 0;
  count($('kT'), c.avgTime, durHTML); $('kTf').innerHTML = delta(c.avgTime, pAvg) + `<span>${pct(c.engaged, c.views)} % restent +30 s</span>`;
  count($('kC'), c.contacts, nf);
  $('kCf').innerHTML = delta(c.contacts, p.contacts) + `<span>${c.views ? (c.contacts / c.views * 100).toFixed(1).replace('.', ',') : '0'} % des visites</span>`;

  // Barres 3D
  let items;
  if (d.days === 1) {
    items = Array.from({ length: 24 }, (_, i) => {
      const v = Number(c.hr[String(i)] || 0);
      return { label: String(i).padStart(2, '0') + ' h', v, c: 0, tip: `<b>${String(i).padStart(2, '0')} h – ${String(i + 1).padStart(2, '0')} h</b><em>${nf(v)} visite${v > 1 ? 's' : ''}</em>` };
    });
    $('barsSub').textContent = 'Visites heure par heure aujourd’hui';
  } else {
    items = d.series.map(x => {
      const dt = new Date(x.d + 'T12:00:00');
      const lbl = dt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }).replace('.', '');
      const full = dt.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
      return { label: lbl, v: x.v, c: x.c,
        tip: `<b>${full.charAt(0).toUpperCase() + full.slice(1)}</b><em>${nf(x.v)} visite${x.v > 1 ? 's' : ''}` + (x.c ? ` · <span class="hl">${x.c} contact${x.c > 1 ? 's' : ''}</span>` : '') + (x.v ? ` · ${dur(x.t / x.v)} en moyenne` : '') + '</em>' };
    });
    $('barsSub').textContent = 'Survole une barre pour le détail';
  }
  bars.set(items);

  // Carte d'attention
  const views = c.views || 0;
  const secItems = SECTIONS.map(([k, label]) => {
    const tot = Number(c.sec[k] || 0), reach = Number(c.reach[k] || 0);
    const avg = views ? tot / views : 0;
    return { key: k, label, avg, total: tot, reach, rp: pct(reach, views),
      tip: `<b>${label}</b><em>${dur(avg)} en moyenne par visite · vue par ${pct(reach, views)} %</em>` };
  });
  att.set(secItems);
  const maxAvg = Math.max(1, ...secItems.map(x => x.avg));
  const ranked = secItems.slice().sort((a, b) => b.avg - a.avg);
  $('rank').innerHTML = ranked.map((x, i) => `
    <div class="row${i < 3 && x.avg ? ' hot' : ''}" data-k="${x.key}">
      <div class="nm"><span class="n">${i + 1}</span><span>${esc(x.label)}</span>${i === 0 && x.avg ? '<span class="badge">TOP</span>' : ''}</div>
      <div class="t tnum">${x.avg ? dur(x.avg) : '–'}</div>
      <div class="r tnum">${views ? x.rp + ' %' : '–'}</div>
      <div class="bar"><i style="width:${x.avg / maxAvg * 100}%"></i></div>
    </div>`).join('');
  document.querySelectorAll('#rank .row').forEach(r => {
    r.addEventListener('mouseenter', () => att.focus(r.dataset.k));
    r.addEventListener('mouseleave', () => att.focus(null));
  });

  // Entonnoir
  const steps = [
    ['Visites', views], ['Ont dépassé l’accueil', c.reach.probleme], ['Ont vu tes projets', c.reach.projets],
    ['Ont vu tes résultats', c.reach.resultats], ['Ont lu les avis', c.reach.avis], ['Sont allés jusqu’au bout', c.reach.final],
    ['T’ont écrit', c.contacts]
  ];
  $('funnel').innerHTML = views ? steps.map(([l, v], i) => {
    v = Number(v || 0); const w = Math.max(4, pct(v, views));
    return `<div class="fstep${i === steps.length - 1 ? ' last' : ''}"><div class="l">${l}</div><div class="b"><i style="width:${w}%">${nf(v)}</i></div><div class="p tnum">${pct(v, views)} %${i ? `<small>${i === steps.length - 1 ? 'des visites' : 'restent'}</small>` : ''}</div></div>`;
  }).join('') : '<p class="empty">L’entonnoir se remplira avec tes premières visites.</p>';

  // Où on clique pour te contacter
  const cs = top(c.csec, 5);
  $('contactWhere').innerHTML = `
    <div class="ring">${ring(c.views ? c.contacts / c.views : 0, '#FFE100')}
      <p><b>${nf(c.contacts)}</b> personne${c.contacts > 1 ? 's' : ''} t’${c.contacts > 1 ? 'ont' : 'a'} écrit<br>${nf(c.clicks)} clic${c.clicks > 1 ? 's' : ''} sur WhatsApp au total</p></div>
    <div class="bars2" style="margin-top:22px">${cs.length ? cs.map(([k, v]) => bar2(SEC[k] || k, v, cs[0][1], 'y')).join('') : '<p class="empty">Aucun clic pour l’instant.</p>'}</div>`;

  // Sources
  const src = top(c.src, 7); const sTot = src.reduce((s, x) => s + x[1], 0);
  $('sources').innerHTML = sTot ? donut(src, sTot) + `<div class="leg">${src.map(([k, v], i) => `<div><i style="background:${PAL[i]}"></i><span>${esc(k)}</span><b class="tnum">${pct(v, sTot)} %</b></div>`).join('')}</div>` : '<p class="empty">Pas encore de données.</p>';

  // Durées
  const BL = ['< 10 s', '10–30 s', '30 s–1 min', '1–3 min', '3–10 min', '10 min +'];
  const bMax = Math.max(1, ...c.durBuckets); const bTop = c.durBuckets.indexOf(Math.max(...c.durBuckets));
  $('hist').innerHTML = c.durBuckets.map((v, i) => `<div class="col${i === bTop && v ? ' top' : ''}"><b class="tnum">${nf(v)}</b><i style="height:${v / bMax * 100}%"></i><span>${BL[i]}</span></div>`).join('');

  // Appareils
  const ic = {
    Mobile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/></svg>',
    Tablette: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M11 17h2"/></svg>',
    Ordinateur: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>'
  };
  const dTot = Object.values(c.dev).reduce((s, v) => s + Number(v), 0);
  $('devs').innerHTML = ['Mobile', 'Ordinateur', 'Tablette'].map(k => `<div class="dev">${ic[k]}<b class="tnum">${pct(c.dev[k] || 0, dTot)}%</b><span>${k}</span></div>`).join('');

  // Heures
  const hv = Array.from({ length: 24 }, (_, i) => Number(c.hr[String(i)] || 0)); const hMax = Math.max(1, ...hv);
  const peak = hv.indexOf(Math.max(...hv));
  $('hours').innerHTML = `<div class="hours">${hv.map((v, i) => `<i title="${i} h : ${v} visite${v > 1 ? 's' : ''}" style="background:${v ? `rgba(${v === hv[peak] ? '255,225,0' : '15,98,255'},${0.15 + 0.85 * v / hMax})` : ''}"></i>`).join('')}</div>
    <div class="hours-l"><span>0 h</span><span>6 h</span><span>12 h</span><span>18 h</span><span>23 h</span></div>
    <p class="peak">${hv[peak] ? `Pic d’affluence vers <b>${peak} h</b>. C’est le meilleur moment pour publier.` : 'Pas encore assez de visites.'}</p>`;

  // Engagement
  $('engage').innerHTML = `<div class="ring">${ring(c.avgScroll / 100, '#4D8BFF', c.avgScroll + '%', 'LU')}
    <p>En moyenne, <b>${c.avgScroll} %</b> de ta page est lue.</p></div>
    <div class="bars2" style="margin-top:22px">
      ${bar2('Lisent plus de la moitié', pct(c.scroll50, views), 100, '', '%')}
      ${bar2('Vont jusqu’en bas', pct(c.scroll90, views), 100, '', '%')}
      ${bar2('Repartent en moins de 10 s', pct(c.bounce, views), 100, 'y', '%')}
    </div>`;

  // Pays
  const ct = top(c.cty, 7); const cTot = Object.values(c.cty).reduce((s, v) => s + Number(v), 0);
  $('countries').innerHTML = ct.length ? ct.map(([k, v]) => `<div class="li"><span class="fl">${flag(k)}</span><div class="main"><b>${esc(country(k))}</b></div><div class="side"><b class="tnum">${nf(v)}</b>${pct(v, cTot)} %</div></div>`).join('') : '<p class="empty">Pas encore de données.</p>';

  // Sites référents
  const rf = top(c.ref, 6);
  $('refs').innerHTML = rf.length ? rf.map(([k, v]) => bar2(k, v, rf[0][1])).join('') : '<p class="empty">Aucun site externe pour l’instant. Le trafic est surtout direct (WhatsApp, favoris, adresse tapée).</p>';

  // Sources qui convertissent
  const cv = top(c.csrc, 6);
  $('convSrc').innerHTML = cv.length ? cv.map(([k, v]) => bar2(k, v, cv[0][1], 'y', '', `${pct(v, c.src[k] || 0)} % de conversion`)).join('') : '<p class="empty">Aucun contact pour l’instant.</p>';

  // Derniers visiteurs
  $('recent').innerHTML = d.recent.length ? d.recent.slice(0, 12).map(x => `
    <div class="li"><span class="fl">${flag(x.cc)}</span>
      <div class="main"><b>${esc(x.city ? x.city + ', ' : '')}${esc(country(x.cc))}</b>
        <span><span class="tag">${esc(x.src)}</span><span class="tag">${esc(x.dev)}</span>${x.n ? '<span class="tag g">Nouveau</span>' : ''}${x.c ? '<span class="tag y">A écrit</span>' : ''}</span></div>
      <div class="side"><b class="tnum">${x.dur ? dur(x.dur) : '< 1 s'}</b>${ago(x.t)}</div></div>`).join('') : '<p class="empty">Personne pour l’instant.</p>';

  $('recentC').innerHTML = d.recentContacts.length ? d.recentContacts.slice(0, 8).map(x => `
    <div class="li"><span class="fl">${flag(x.cc)}</span><div class="main"><b>${esc(SEC[x.z] || x.z)}</b><span>${esc(x.src || 'Direct')} · ${esc(x.dev || '')}</span></div><div class="side">${ago(x.t)}</div></div>`).join('') : '<p class="empty">Aucun contact pour l’instant.</p>';

  // Sécurité
  const S = { ok: ['Connexion réussie', 'g'], fail: ['Mot de passe erroné', 'r'], blocked: ['Tentative bloquée', 'y'], bot: ['Robot piégé', 'r'] };
  const sec = d.security || [];
  const fails = sec.filter(x => x.ok !== 'ok').length;
  $('secSub').textContent = sec.length ? (fails ? `${fails} tentative${fails > 1 ? 's' : ''} refusée${fails > 1 ? 's' : ''} parmi les 30 dernières. Les adresses insistantes sont bloquées automatiquement.` : 'Aucune tentative suspecte. Tout est en ordre.') : 'Aucune tentative enregistrée.';
  $('security').innerHTML = sec.length ? sec.slice(0, 12).map(x => {
    const s = S[x.ok] || ['?', ''];
    return `<div class="li"><span class="fl">${flag(x.cc)}</span><div class="main"><b><span class="tag ${s[1]}">${s[0]}</span> ${esc(x.ip)}</b><span>${esc(x.city ? x.city + ', ' : '')}${esc(country(x.cc))} · ${esc(device(x.ua))}</span></div><div class="side">${ago(x.t)}</div></div>`;
  }).join('') : '<p class="empty">Rien à signaler.</p>';

  $('live').classList.toggle('zero', !d.live); $('liveN').textContent = d.live;
}

function device(ua) {
  ua = ua || '';
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac OS/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Appareil inconnu';
  const br = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
  return br ? os + ' · ' + br : os;
}
function bar2(label, v, max, cls, unit, note) {
  return `<div class="b2 ${cls || ''}"><span>${esc(label)}${note ? ` <small style="color:var(--dim)">· ${note}</small>` : ''}</span><b class="tnum">${nf(v)}${unit ? ' ' + unit : ''}</b><div class="tr"><i style="width:${max ? Math.min(100, v / max * 100) : 0}%"></i></div></div>`;
}
function ring(f, color, big, small) {
  const R = 46, C = 2 * Math.PI * R, v = Math.max(0, Math.min(1, f || 0));
  const txt = big || (v * 100).toFixed(v < 0.1 && v > 0 ? 1 : 0).replace('.', ',') + '%';
  return `<svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="${R}" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="10"/>
    <circle cx="60" cy="60" r="${R}" fill="none" stroke="${color}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${C * v} ${C}" transform="rotate(-90 60 60)" style="filter:drop-shadow(0 0 6px ${color})"/>
    <text x="60" y="${small ? 62 : 67}" text-anchor="middle" style="font:600 22px Urbanist;fill:#F2F4FA">${txt}</text>
    ${small ? `<text x="60" y="80" text-anchor="middle" style="font:600 10px Urbanist;fill:#979DB2;letter-spacing:.1em">${small}</text>` : ''}</svg>`;
}
function donut(rows, tot) {
  const R = 64, C = 2 * Math.PI * R; let off = 0;
  const arcs = rows.map(([k, v], i) => {
    const len = v / tot * C, gap = rows.length > 1 ? 3 : 0;
    const s = `<circle cx="85" cy="85" r="${R}" fill="none" stroke="${PAL[i]}" stroke-width="20" stroke-dasharray="${Math.max(0.1, len - gap)} ${C}" stroke-dashoffset="${-off}" transform="rotate(-90 85 85)"><title>${esc(k)} : ${v}</title></circle>`;
    off += len; return s;
  }).join('');
  return `<svg viewBox="0 0 170 170">${arcs}<text class="center" x="85" y="88" text-anchor="middle">${nf(tot)}</text><text class="center2" x="85" y="108" text-anchor="middle">VISITES</text></svg>`;
}
function markRow(k) { document.querySelectorAll('#rank .row').forEach(r => r.classList.toggle('on', r.dataset.k === k)); }

/* ---------- Bandeaux d'information ---------- */
function notice(kind, extra) {
  const n = $('notice');
  const ico = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>';
  const M = {
    nodb: ['La base de données n’est pas encore branchée.', 'Dans Vercel, ouvre le projet de la console → Storage → Create Database → Upstash Redis (gratuit), puis connecte la même base au projet lorick-innovation. Les chiffres apparaîtront ensuite tout seuls.'],
    nodata: ['Pas encore de visites enregistrées.', 'Le suivi est en place : les chiffres apparaîtront dès les prochaines visites sur ton site. En attendant, tu peux voir à quoi ressemblera ta console.'],
    net: ['Connexion perdue.', 'Impossible de joindre la console. Vérifie ta connexion internet.'],
    err: ['Les statistiques n’ont pas pu être chargées.', 'Réessaie dans un instant avec « Actualiser ».'],
    lock: ['Verrou de sécurité général actif.', 'Trop de tentatives de connexion ont échoué en une heure. Les nouvelles connexions sont suspendues pendant encore ' + Math.ceil((extra || 0) / 60) + ' min (ta session actuelle n’est pas touchée).']
  };
  if (!kind || demo) { n.innerHTML = ''; return; }
  const m = M[kind];
  n.innerHTML = `<div class="notice">${ico}<div><b>${m[0]}</b><p>${m[1]}</p>${kind === 'nodata' || kind === 'nodb' ? '<button class="btn-ghost" id="demoBtn">Voir un aperçu avec des données fictives</button>' : ''}</div></div>`;
  const b = $('demoBtn'); if (b) b.onclick = () => setDemo(true);
}
function setDemo(on) {
  demo = on; $('demoFlag').classList.toggle('on', on);
  $('mDemo').querySelector('span').textContent = on ? 'Revenir aux vraies données' : 'Aperçu avec données fictives';
  load();
}
function empty() {
  const a = () => ({ views: 0, uniques: 0, contacts: 0, clicks: 0, src: {}, dev: {}, cty: {}, hr: {}, nv: {}, ref: {}, sec: {}, reach: {}, csec: {}, csrc: {}, durBuckets: [0, 0, 0, 0, 0, 0], timeTotal: 0, avgTime: 0, engaged: 0, bounce: 0, scroll50: 0, scroll90: 0, avgScroll: 0 });
  return { days, series: Array.from({ length: days }, (_, i) => ({ d: new Date(Date.now() - (days - 1 - i) * 864e5).toISOString().slice(0, 10), v: 0, c: 0, t: 0 })), cur: a(), prev: a(), live: 0, recent: [], recentContacts: [], security: [], globalLock: 0 };
}

/* ---------- Données fictives (aperçu) ---------- */
function fake(n) {
  let seed = 7 + n; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const d = empty(); d.days = n;
  const series = [];
  for (let i = n - 1; i >= 0; i--) {
    const dt = new Date(Date.now() - i * 864e5);
    const wk = [0.7, 1, 1.1, 1.05, 1.15, 0.95, 0.75][dt.getDay()];
    const v = Math.round((48 + (n - i) * 0.8) * wk * (0.75 + rnd() * 0.5));
    series.push({ d: dt.toISOString().slice(0, 10), v, c: Math.round(v * (0.025 + rnd() * 0.03)), t: v * (90 + rnd() * 60) });
  }
  d.series = series;
  const V = series.reduce((s, x) => s + x.v, 0), C = series.reduce((s, x) => s + x.c, 0);
  const avgSec = { accueil: 14, probleme: 9, partenaire: 7, psychologie: 6, leviers: 6, comparatif: 8, methode: 11, projets: 26, resultats: 21, avis: 17, apropos: 9, services: 12, secteurs: 5, process: 7, faq: 10, final: 6 };
  const reach = { accueil: 1, probleme: 0.82, partenaire: 0.7, psychologie: 0.64, leviers: 0.6, comparatif: 0.57, methode: 0.52, projets: 0.49, resultats: 0.44, avis: 0.38, apropos: 0.33, services: 0.3, secteurs: 0.27, process: 0.25, faq: 0.22, final: 0.19 };
  const c = d.cur;
  Object.assign(c, {
    views: V, uniques: Math.round(V * 0.78), contacts: C, clicks: Math.round(C * 1.3), timeTotal: V * 134, avgTime: 134, engaged: Math.round(V * 0.46), bounce: Math.round(V * 0.29),
    scroll50: Math.round(V * 0.41), scroll90: Math.round(V * 0.18), avgScroll: 47,
    src: { Google: Math.round(V * 0.38), Direct: Math.round(V * 0.27), Facebook: Math.round(V * 0.14), Instagram: Math.round(V * 0.09), WhatsApp: Math.round(V * 0.07), 'Assistants IA': Math.round(V * 0.03), 'Autres sites': Math.round(V * 0.02) },
    dev: { Mobile: Math.round(V * 0.71), Ordinateur: Math.round(V * 0.26), Tablette: Math.round(V * 0.03) },
    cty: { BJ: Math.round(V * 0.31), FR: Math.round(V * 0.22), CI: Math.round(V * 0.13), SN: Math.round(V * 0.1), CM: Math.round(V * 0.08), BE: Math.round(V * 0.06), CA: Math.round(V * 0.05), TG: Math.round(V * 0.05) },
    nv: { Nouveaux: Math.round(V * 0.69), 'Récurrents': Math.round(V * 0.31) },
    ref: { 'google.com': Math.round(V * 0.36), 'facebook.com': Math.round(V * 0.12), 'l.instagram.com': Math.round(V * 0.08), 'chatgpt.com': Math.round(V * 0.02), 'linkedin.com': Math.round(V * 0.01) },
    csec: { accueil: Math.round(C * 0.22), resultats: Math.round(C * 0.18), avis: Math.round(C * 0.16), final: Math.round(C * 0.3), services: Math.round(C * 0.14) },
    csrc: { Google: Math.round(C * 0.46), Direct: Math.round(C * 0.24), Facebook: Math.round(C * 0.16), Instagram: Math.round(C * 0.1), WhatsApp: Math.round(C * 0.04) },
    durBuckets: [0.29, 0.17, 0.13, 0.2, 0.15, 0.06].map(x => Math.round(V * x))
  });
  SECTIONS.forEach(([k]) => { c.sec[k] = Math.round(V * avgSec[k] * (0.85 + rnd() * 0.3)); c.reach[k] = Math.round(V * reach[k]); });
  for (let h = 0; h < 24; h++) c.hr[h] = Math.round(V / 24 * (h < 7 ? 0.25 : h < 11 ? 1.1 : h < 14 ? 1.5 : h < 19 ? 1.15 : h < 23 ? 1.7 : 0.6) * (0.85 + rnd() * 0.3));
  Object.assign(d.prev, { views: Math.round(V * 0.82), uniques: Math.round(V * 0.66), contacts: Math.round(C * 0.7), timeTotal: Math.round(V * 0.82) * 118 });
  d.live = 3;
  const cities = [['BJ', 'Cotonou'], ['FR', 'Paris'], ['CI', 'Abidjan'], ['SN', 'Dakar'], ['BJ', 'Porto-Novo'], ['CM', 'Douala'], ['BE', 'Bruxelles'], ['FR', 'Lyon']];
  const srcs = ['Google', 'Direct', 'Facebook', 'Instagram', 'WhatsApp'];
  d.recent = Array.from({ length: 12 }, (_, i) => { const cc = cities[i % 8]; return { t: Date.now() - (i * 7 + rnd() * 6) * 60000, cc: cc[0], city: cc[1], src: srcs[i % 5], dev: i % 4 ? 'Mobile' : 'Ordinateur', n: i % 3 !== 0, dur: Math.round(20 + rnd() * 300), c: i === 1 || i === 6 }; });
  d.recentContacts = Array.from({ length: 6 }, (_, i) => ({ t: Date.now() - (i * 95 + 12) * 60000, cc: cities[(i * 3) % 8][0], src: srcs[i % 4], dev: 'Mobile', z: ['final', 'resultats', 'avis', 'accueil', 'services', 'final'][i] }));
  d.security = [{ t: Date.now() - 4 * 60000, ok: 'ok', ip: '102.64.x.x', cc: 'BJ', city: 'Cotonou', ua: 'iPhone Safari/605' }, { t: Date.now() - 26 * 3600000, ok: 'fail', ip: '45.142.x.x', cc: 'NL', city: 'Amsterdam', ua: 'Windows Chrome/120' }, { t: Date.now() - 26 * 3600000 + 9000, ok: 'blocked', ip: '45.142.x.x', cc: 'NL', city: 'Amsterdam', ua: 'Windows Chrome/120' }];
  return d;
}

/* ---------- Interactions ---------- */
document.querySelectorAll('#seg button').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('#seg button').forEach(x => x.classList.toggle('on', x === b));
  days = Number(b.dataset.d); load(); schedule();
}));
const pop = $('menuPop'), mb = $('menuBtn');
mb.addEventListener('click', e => { e.stopPropagation(); const on = !pop.classList.contains('on'); pop.classList.toggle('on', on); mb.setAttribute('aria-expanded', on); });
document.addEventListener('click', () => { pop.classList.remove('on'); mb.setAttribute('aria-expanded', 'false'); });
$('mRefresh').onclick = () => load();
$('mDemo').onclick = () => setDemo(!demo);
async function out(all) {
  await fetch('/api/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ all: all ? '1' : '0' }), credentials: 'same-origin' }).catch(() => {});
  location.replace('/login');
}
$('mOut').onclick = () => out(false);
$('mOutAll').onclick = () => { if (confirm('Déconnecter la console sur tous tes appareils (y compris celui-ci) ?')) out(true); };

load().finally(() => { const l = $('loading'); l.classList.add('off'); setTimeout(() => l.remove(), 600); });
schedule();
