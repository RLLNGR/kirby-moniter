// Moniter — mesure d'audience sans cookie ni identifiant.
// Envoie : la page vue (chemin, référent, fuseau horaire, langue, type d'appareil, arrivée ou non),
// le temps de lecture au départ, la poursuite de la visite après la page d'entrée, et les clics
// sur les liens téléphone / e-mail / autres sites / fichiers.
// Seul stockage navigateur : le chemin de la page d'entrée, en sessionStorage (l'onglet, effacé à sa fermeture),
// pour savoir si la visite s'est poursuivie. Rien n'est envoyé qui permette de reconnaître quelqu'un.
(function () {
  var script = document.currentScript
  if (!script) return
  var base = script.src.replace(/beacon\.js.*$/, '')
  var KEY = 'moniter-entry'
  var IDLE = 30000 // au-delà de 30 s sans interaction, le temps ne compte plus
  var MAX = 1800   // 30 min max par page vue

  function send(route, data) {
    var body = JSON.stringify(data)
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(base + route, body)) return
      fetch(base + route, { method: 'POST', body: body, keepalive: true, mode: 'no-cors' })
    } catch (e) {}
  }
  function storage(fn) { try { return fn(window.sessionStorage) } catch (e) { return null } }

  var tz = ''
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '' } catch (e) {}

  // Appareil : écran tactile comme pointeur principal + taille d'écran. Plus juste que le User-Agent
  // (un iPad se présente comme un Mac) et rien n'est lu côté serveur.
  function device() {
    var coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches
    var small = Math.min(screen.width, screen.height)
    return coarse ? (small < 600 ? 'mobile' : 'tablet') : 'desktop'
  }

  function campaign() {
    var q = new URLSearchParams(location.search)
    return q.get('utm_campaign') || q.get('utm_source') || ''
  }

  // ── Temps de lecture : onglet visible ET interaction depuis moins de 30 s ───────────
  var path = '', ms = 0, sent = 0, last = Date.now(), active = last

  function tick() {
    var now = Date.now()
    if (document.visibilityState === 'visible') ms += Math.max(0, Math.min(now, active + IDLE) - last)
    last = now
  }
  function flush() {
    tick()
    var n = Math.min(Math.round(ms / 1000), MAX), d = n - sent
    if (path && d > 0) { sent = n; send('time', { p: path, t: d }) }
  }
  function activity() { tick(); active = Date.now() }
  ;['pointerdown', 'pointermove', 'keydown', 'scroll', 'wheel', 'touchstart'].forEach(function (type) {
    addEventListener(type, activity, { passive: true, capture: true })
  })
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') { last = active = Date.now() } else flush()
  })
  addEventListener('pagehide', flush)

  // ── Pages vues ─────────────────────────────────────────────────────────────────────
  function hit(referrer, first) {
    var refHost = ''
    try { refHost = referrer ? new URL(referrer).host : '' } catch (e) {}
    var nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0]
    var reload = first && nav && nav.type === 'reload'
    // Arrivée sur le site : premier chargement, venu d'ailleurs (ou de nulle part), hors rechargement
    var entry = first && !reload && refHost !== location.host

    var data = { p: path, r: entry ? referrer : '', z: tz, l: navigator.language || '', d: device(), e: entry ? 1 : 0 }
    if (entry) data.c = campaign()
    send('hit', data)

    if (reload) return
    if (entry) storage(function (s) { s.setItem(KEY, path) })
    else {
      // Deuxième page de la visite : la page d'entrée n'est pas un rebond
      var landing = storage(function (s) { return s.getItem(KEY) })
      if (landing && landing !== path) {
        send('continue', { p: landing })
        storage(function (s) { s.removeItem(KEY) })
      }
    }
  }

  function view(first) {
    var p = location.pathname
    if (p === path) return
    if (path) flush()
    path = p; ms = 0; sent = 0; last = active = Date.now()
    hit(first ? document.referrer : '', first)
  }

  // Sites en navigation JS (Nuxt…) : chaque changement d'URL est une page vue
  ;['pushState', 'replaceState'].forEach(function (name) {
    var original = history[name]
    history[name] = function () {
      var result = original.apply(this, arguments)
      setTimeout(function () { view(false) })
      return result
    }
  })
  addEventListener('popstate', function () { view(false) })

  // ── Clics : téléphone, e-mail, autre site, fichier ──────────────────────────────────
  var FILE = /\.(pdf|docx?|xlsx?|pptx?|odt|ods|zip|rar|7z|mp3|mp4|mov|epub|ics|vcf)$/i
  function onClick(e) {
    try { action(e) } catch (err) {}
  }
  function action(e) {
    if (e.type === 'auxclick' && e.button !== 1) return
    var a = e.target.closest && e.target.closest('a[href]')
    if (!a) return
    var href = a.getAttribute('href') || '', type = '', target = ''
    if (/^tel:/i.test(href)) { type = 'tel'; target = decodeURIComponent(href.slice(4)).replace(/[^\d+]/g, '') }
    else if (/^mailto:/i.test(href)) { type = 'mail'; target = decodeURIComponent(href.slice(7).split('?')[0]).toLowerCase() }
    else {
      var url
      url = new URL(a.href)
      if (!/^https?:$/.test(url.protocol)) return
      if (a.hasAttribute('download') || FILE.test(url.pathname)) { type = 'file'; target = decodeURIComponent(url.pathname.split('/').pop()) }
      else if (url.host !== location.host) { type = 'out'; target = url.host.replace(/^www\./, '') }
    }
    if (type && target) send('action', { p: path, a: type, g: target.slice(0, 120) })
  }
  document.addEventListener('click', onClick, true)
  document.addEventListener('auxclick', onClick, true)

  view(true)
})()
