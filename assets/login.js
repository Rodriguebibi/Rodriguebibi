(function () {
  var f = document.getElementById('f'), pw = document.getElementById('pw'), go = document.getElementById('go'),
      msg = document.getElementById('msg'), eye = document.getElementById('eye'), timer = 0;

  eye.addEventListener('click', function () {
    var show = pw.type === 'password';
    pw.type = show ? 'text' : 'password';
    eye.setAttribute('aria-label', show ? 'Masquer le mot de passe' : 'Afficher le mot de passe');
    pw.focus();
  });

  function say(t, cls) { msg.textContent = t; msg.className = 'msg' + (cls ? ' ' + cls : ''); }
  function busy(on) { go.disabled = on; go.innerHTML = on ? '<span class="spinner"></span>' : 'Se connecter'; }
  function countdown(s) {
    clearInterval(timer); go.disabled = true; pw.disabled = true;
    var end = Date.now() + s * 1000;
    function tick() {
      var left = Math.max(0, Math.round((end - Date.now()) / 1000));
      if (!left) { clearInterval(timer); go.disabled = false; pw.disabled = false; say(''); return; }
      var h = Math.floor(left / 3600), m = Math.floor(left % 3600 / 60), sec = left % 60;
      say('Accès bloqué. Réessaie dans ' + (h ? h + ' h ' : '') + (m ? m + ' min ' : '') + (h ? '' : sec + ' s'), 'lock');
    }
    tick(); timer = setInterval(tick, 1000);
  }

  f.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!pw.value) { say('Entre ton mot de passe.', 'err'); pw.focus(); return; }
    busy(true); say('');
    var body = JSON.stringify({ password: pw.value, website: f.website.value });
    fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, credentials: 'same-origin' })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return [r.status, j]; }); })
      .then(function (x) {
        var st = x[0], j = x[1];
        if (st === 200 && j.ok) { say('Connexion réussie…'); location.replace('/'); return; }
        busy(false); pw.value = '';
        f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake');
        if (st === 429 && j.locked) { countdown(j.locked); return; }
        say(j.msg || 'Connexion impossible pour le moment.', 'err'); pw.focus();
      })
      .catch(function () { busy(false); say('Réseau indisponible. Réessaie.', 'err'); });
  });
})();
