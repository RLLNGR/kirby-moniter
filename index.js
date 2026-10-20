// GÉNÉRÉ par scripts/build-panel.mjs depuis src/panel.js — ne pas modifier ici, puis : npm run build
// Vue Audience du Panel — données calculées en PHP (src/Summary.php), passées en props par la zone `moniter`.
// Habillage de Moniter (et du rapport mensuel) : crème, barres d'encre en minuscules, blocs blancs, pastilles.
// Pas d'étape de build : le Panel embarque le compilateur de templates de Vue.

const PERIODS = ['7', '30', 'month', '90', '365']

// Couleur de chaque pastille, comme les cartes du rapport
const KPI_COLORS = { views: 'blue', visits: 'green', pages_per_visit: 'magenta', avg_seconds: 'orange', bounce: 'black' }

// Langue du Panel de la personne connectée
const locale = () => document.documentElement.lang || 'fr'
const num = n => n.toLocaleString(locale())

// Une liste « nom · barre de part · nombre · % »
const MoniterList = {
  props: {
    headline: String,
    items: Array, // [{ key, name, value, hint?, note? }]
    shares: { type: Boolean, default: true },
    limit: { type: Number, default: 10 },
  },
  computed: {
    rows() {
      const list = this.items.slice(0, this.limit)
      const total = this.items.reduce((t, x) => t + x.value, 0) || 1
      const max = Math.max(1, ...list.map(x => x.value))
      return list.map(x => ({ ...x, bar: x.value / (this.shares ? total : max), share: x.value / total }))
    },
  },
  methods: {
    num,
    pct(share) {
      const n = share * 100
      return (n >= 10 ? Math.round(n) : n.toLocaleString(locale(), { maximumFractionDigits: 1 })) + ' %'
    },
  },
  ...(() => {
var render = function render(){var _vm=this,_c=_vm._self._c;return _c('ol',{staticClass:"k-moniter-list"},_vm._l((_vm.rows),function(row){return _c('li',{key:row.key},[_c('span',{staticClass:"k-moniter-list-bar",style:({ width: row.bar * 100 + '%' })}),_c('span',{staticClass:"k-moniter-list-name",attrs:{"title":row.hint || row.name}},[_vm._v(_vm._s(row.name))]),(row.note)?_c('span',{staticClass:"k-moniter-list-note"},[_vm._v(_vm._s(row.note))]):_vm._e(),_c('span',{staticClass:"k-moniter-list-value"},[_vm._v(_vm._s(_vm.num(row.value)))]),(_vm.shares)?_c('span',{staticClass:"k-moniter-list-share"},[_vm._v(_vm._s(_vm.pct(row.share)))]):_vm._e()])}),0)
}
var staticRenderFns = []
return { render, staticRenderFns }
})(),
}

// Carte des pays, teinte selon le nombre de pages vues (même rendu que WorldMap.vue dans Moniter)
const MoniterMap = {
  props: {
    src: String,
    countries: Array, // [{ code, name, views }]
  },
  data: () => ({ map: null, hover: null }),
  computed: {
    byCode() {
      return new Map(this.countries.filter(c => c.code).map(c => [c.code, c]))
    },
    max() {
      return Math.max(1, ...this.countries.filter(c => c.code).map(c => c.views))
    },
  },
  async mounted() {
    try {
      this.map = await (await fetch(this.src)).json()
    } catch (e) {
      this.map = false
    }
  },
  methods: {
    // Échelle logarithmique : sinon le pays du site écrase tous les autres
    shade(code) {
      const c = this.byCode.get(code)
      if (!c) return null
      const t = Math.log1p(c.views) / Math.log1p(this.max)
      return { fill: `color-mix(in srgb, var(--tone, var(--m-accent)) ${Math.round(18 + t * 82)}%, var(--m-surface))` }
    },
    onMove(e) {
      const c = this.byCode.get(e.target.dataset && e.target.dataset.code)
      this.hover = c ? { c, x: e.clientX, y: e.clientY } : null
    },
  },
  ...(() => {
var render = function render(){var _vm=this,_c=_vm._self._c;return _c('div',{staticClass:"k-moniter-map"},[(_vm.map)?_c('svg',{attrs:{"viewBox":'0 0 ' + _vm.map.w + ' ' + _vm.map.h,"role":"img","aria-label":_vm.$t('moniter.countries.count', { count: _vm.byCode.size })},on:{"pointermove":_vm.onMove,"pointerleave":function($event){_vm.hover = null}}},_vm._l((_vm.map.paths),function(d,code){return _c('path',{key:code,class:{ on: _vm.byCode.has(code), active: _vm.hover && _vm.hover.c.code === code },style:(_vm.shade(code)),attrs:{"d":d,"data-code":code}})}),0):(_vm.map === null)?_c('div',{staticClass:"k-moniter-map-placeholder"}):_vm._e(),(_vm.hover)?_c('div',{staticClass:"k-moniter-tip",style:({ left: _vm.hover.x + 'px', top: _vm.hover.y + 'px' })},[_vm._v(" "+_vm._s(_vm.hover.c.name)+" · "+_vm._s(_vm.hover.c.views.toLocaleString())+" ")]):_vm._e()])
}
var staticRenderFns = []
return { render, staticRenderFns }
})(),
}

panel.plugin('rllngr/kirby-moniter', {
  components: {
    'k-moniter-list': MoniterList,
    'k-moniter-map': MoniterMap,
    'k-moniter-audience-view': {
      props: {
        period: String,
        error: String,
        stats: Object,
        map: String,
      },
      data: () => ({ PERIODS, hover: null }),
      computed: {
        locale,
        hasData() {
          return this.stats && this.stats.has_data
        },
        monthly() {
          return this.stats.days > 92
        },
        // Sur 1 an, on regroupe par mois : c'est la comparaison qui compte
        buckets() {
          const daily = this.stats.daily
          if (!this.monthly) return daily.map(d => ({ key: d.day, label: this.day(d.day), views: d.views }))
          const months = new Map()
          for (const d of daily) {
            const m = d.day.slice(0, 7)
            const b = months.get(m) || { key: m, label: this.month(m), views: 0 }
            b.views += d.views
            months.set(m, b)
          }
          return [...months.values()]
        },
        max() {
          return Math.max(1, ...this.buckets.map(b => b.views))
        },
        // Pastilles : le chiffre dans le cercle, l'unité à part en bas (comme le rapport)
        kpis() {
          const kpis = this.stats.kpis
          const formats = {
            views: v => [this.num(v)],
            visits: v => [this.num(v)],
            pages_per_visit: v => [v.toLocaleString(this.locale, { maximumFractionDigits: 1 })],
            // 72 s → « 1:12 min »
            avg_seconds: v => v < 60 ? [String(v), 's'] : [`${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`, 'min'],
            bounce: v => [String(Math.round(v * 100)), '%'],
          }
          return Object.keys(formats)
            .filter(key => kpis[key] && kpis[key].value !== null)
            .map(key => {
              const { value, previous } = kpis[key]
              const [text, unit] = formats[key](value)
              const kpi = { key, text, unit, color: KPI_COLORS[key], label: this.$t('moniter.kpi.' + key), size: text.length <= 4 ? 'l' : text.length <= 6 ? 'm' : 's' }
              if (previous) {
                // Rebond : écart en points, pas en % d'un %
                const delta = key === 'bounce' ? Math.round((value - previous) * 100) : Math.round(((value - previous) / previous) * 100)
                kpi.delta = (delta > 0 ? '+' : delta < 0 ? '−' : '±') + Math.abs(delta) + (key === 'bounce' ? ' pt' : ' %')
              }
              return kpi
            })
        },
        compared() {
          const s = this.stats
          const range = `${this.day(s.start)} – ${this.day(this.lastDay(s.end))}`
          if (!this.kpis.some(k => k.delta)) return range
          return `${range}, ${this.$t('moniter.compared')} ${this.day(s.prevStart)} – ${this.day(this.lastDay(s.prevEnd))}`
        },
        topPages() {
          return this.stats.top_pages.map(p => ({
            key: p.path, name: this.page(p.path), hint: p.path, value: p.views,
            note: p.seconds > 0 ? this.duration(Math.round(p.seconds / p.views)) : null,
          }))
        },
        entryPages() {
          return this.stats.entry_pages.map(p => ({
            key: p.path, name: this.page(p.path), hint: p.path, value: p.entries,
            note: p.bounce !== null ? Math.round(p.bounce * 100) + ' % ' + this.$t('moniter.bounce') : null,
          }))
        },
        sources() {
          return this.stats.sources.map(s => ({ key: s.kind, name: this.$t('moniter.source.' + s.kind), value: s.views }))
        },
        referrers() {
          return this.stats.referrers.map(r => ({ key: r.host, name: r.host, value: r.views }))
        },
        countries() {
          return this.stats.countries.map(c => ({ key: c.code || '-', name: c.name || this.$t('moniter.other'), value: c.views }))
        },
        devices() {
          return this.stats.devices.map(d => ({ key: d.type, name: this.$t('moniter.device.' + d.type), value: d.views }))
        },
        // « Autre » est enregistré tel quel par le plugin : un navigateur ou un système hors de la liste connue
        browsers() {
          return this.stats.browsers.map(b => ({ key: b.name, name: b.name === 'Autre' ? this.$t('moniter.others') : b.name, value: b.views }))
        },
        systems() {
          return this.stats.systems.map(o => ({ key: o.name, name: o.name === 'Autre' ? this.$t('moniter.others') : o.name, value: o.views }))
        },
        languages() {
          return this.stats.languages.map(l => ({ key: l.code, name: l.name, value: l.views }))
        },
        actions() {
          return this.stats.actions.map(a => ({
            key: a.type + a.target, name: this.$t('moniter.action.' + a.type) + ' ' + a.target, hint: a.target, value: a.clicks,
          }))
        },
        campaigns() {
          return this.stats.campaigns.map(c => ({ key: c.name, name: c.name, value: c.views }))
        },
        // Blocs de listes, dans l'ordre de Moniter ; un bloc vide n'est pas affiché
        boxes() {
          // Une couleur par question, la même dans Moniter : bleu = ce qui est lu, magenta = d'où l'on vient,
          // vert = où sont les gens, orange = avec quoi, jaune = ce qui rapporte (clics)
          return [
            { key: 'top_pages', items: this.topPages, shares: false, wide: true, tone: 'blue' },
            { key: 'sources', items: this.sources, tone: 'magenta' },
            { key: 'entry_pages', items: this.entryPages, shares: false, wide: true, tone: 'blue' },
            { key: 'referrers', items: this.referrers, shares: false, tone: 'magenta' },
            { key: 'countries', items: this.countries, limit: 8, map: true, tone: 'green' },
            { key: 'devices', items: this.devices, tone: 'orange' },
            { key: 'browsers', items: this.browsers, limit: 6, tone: 'orange' },
            { key: 'systems', items: this.systems, limit: 6, tone: 'orange' },
            { key: 'languages', items: this.languages, limit: 6, tone: 'green' },
            { key: 'actions', items: this.actions, shares: false, limit: 12, tone: 'yellow' },
            { key: 'campaigns', items: this.campaigns, shares: false, tone: 'magenta' },
          ].filter(b => b.items.length)
        },
      },
      methods: {
        go(period) {
          this.$go('audience', { query: { period } })
        },
        num,
        // 72 → « 1 min 12 s »
        duration(s) {
          return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min${s % 60 ? ` ${String(s % 60).padStart(2, '0')} s` : ''}`
        },
        day(d) {
          return new Date(d + 'T12:00:00').toLocaleDateString(this.locale, { day: 'numeric', month: 'short' })
        },
        month(m) {
          return new Date(m + '-15T12:00:00').toLocaleDateString(this.locale, { month: 'long', year: 'numeric' })
        },
        // Les bornes de fin sont exclusives
        lastDay(end) {
          return new Date(Date.parse(end + 'T12:00:00') - 86400000).toISOString().slice(0, 10)
        },
        page(path) {
          return path === '/' ? this.$t('moniter.home') : path
        },
        // Une colonne entière (pas seulement la barre) sert de zone de survol
        onMove(e) {
          const col = e.target.closest && e.target.closest('.k-moniter-chart-col')
          if (!col) return
          const b = this.buckets[+col.dataset.i]
          if (this.hover && this.hover.b === b) return
          const r = col.getBoundingClientRect()
          this.hover = { b, x: r.left + r.width / 2, y: r.top + r.height * (1 - b.views / this.max) }
        },
      },
      ...(() => {
var render = function render(){var _vm=this,_c=_vm._self._c;return _c('k-panel-inside',{staticClass:"k-moniter-view"},[_c('div',{staticClass:"k-moniter"},[_c('header',{staticClass:"k-moniter-ink k-moniter-header"},[_c('h1',[_vm._v(_vm._s(_vm.$t('moniter.audience')))]),_c('nav',{staticClass:"k-moniter-periods"},_vm._l((_vm.PERIODS),function(p){return _c('button',{key:p,attrs:{"type":"button","aria-current":p === _vm.period ? 'true' : null},on:{"click":function($event){return _vm.go(p)}}},[_vm._v(_vm._s(_vm.$t('moniter.period.' + p)))])}),0)]),(_vm.error)?_c('p',{staticClass:"k-moniter-block k-moniter-message"},[_vm._v(_vm._s(_vm.$t('moniter.error.' + _vm.error)))]):(!_vm.hasData)?_c('p',{staticClass:"k-moniter-block k-moniter-message"},[_vm._v(_vm._s(_vm.$t('moniter.empty')))]):[_c('div',{staticClass:"k-moniter-kpis"},_vm._l((_vm.kpis),function(k){return _c('div',{key:k.key,staticClass:"k-moniter-kpi",attrs:{"data-color":k.color}},[_c('div',{staticClass:"k-moniter-kpi-dot",attrs:{"data-size":k.size}},[_c('span',{staticClass:"k-moniter-kpi-value"},[_vm._v(_vm._s(k.text))]),_c('span',{staticClass:"k-moniter-kpi-unit"},[_vm._v(_vm._s(k.unit))])]),_c('p',{staticClass:"k-moniter-kpi-label"},[_vm._v(" "+_vm._s(k.label)+" "),(k.delta)?_c('span',{staticClass:"k-moniter-kpi-delta"},[_vm._v(_vm._s(k.delta))]):_vm._e()])])}),0),_c('p',{staticClass:"k-moniter-compared"},[_vm._v(_vm._s(_vm.compared))]),_c('section',{staticClass:"k-moniter-block"},[_c('h2',{staticClass:"k-moniter-caption"},[_vm._v(_vm._s(_vm.$t(_vm.monthly ? 'moniter.chart.month' : 'moniter.chart.day')))]),_c('div',{staticClass:"k-moniter-chart",attrs:{"role":"img","aria-label":_vm.$t('moniter.chart')}},[_c('span',{staticClass:"k-moniter-chart-max"},[_vm._v(_vm._s(_vm.num(_vm.max)))]),_c('div',{staticClass:"k-moniter-chart-bars",on:{"pointermove":_vm.onMove,"pointerdown":_vm.onMove,"pointerleave":function($event){_vm.hover = null}}},_vm._l((_vm.buckets),function(b,i){return _c('div',{key:b.key,staticClass:"k-moniter-chart-col",attrs:{"data-i":i}},[_c('div',{staticClass:"k-moniter-chart-bar",class:{ zero: !b.views, active: _vm.hover && _vm.hover.b === b },style:({ height: (b.views / _vm.max) * 100 + '%' })})])}),0),_c('div',{staticClass:"k-moniter-chart-axis"},[_c('span',[_vm._v(_vm._s(_vm.buckets[0].label))]),_c('span',[_vm._v(_vm._s(_vm.buckets[_vm.buckets.length - 1].label))])])]),(_vm.hover)?_c('div',{staticClass:"k-moniter-tip",style:({ left: _vm.hover.x + 'px', top: _vm.hover.y + 'px' })},[_vm._v(" "+_vm._s(_vm.num(_vm.hover.b.views))+" "+_vm._s(_vm.$t(_vm.hover.b.views > 1 ? 'moniter.views' : 'moniter.view'))+" "),_c('span',{staticClass:"k-moniter-muted"},[_vm._v("· "+_vm._s(_vm.hover.b.label))])]):_vm._e()]),_c('div',{staticClass:"k-moniter-grid"},_vm._l((_vm.boxes),function(box){return _c('section',{key:box.key,staticClass:"k-moniter-block",class:{ 'k-moniter-wide': box.wide, 'k-moniter-full': box.map && _vm.map },attrs:{"data-tone":box.tone}},[_c('h2',{staticClass:"k-moniter-caption"},[_vm._v(_vm._s(_vm.$t('moniter.' + box.key)))]),(box.map && _vm.map)?_c('div',{staticClass:"k-moniter-map-layout"},[_c('k-moniter-map',{attrs:{"src":_vm.map,"countries":_vm.stats.countries}}),_c('k-moniter-list',{attrs:{"items":box.items,"limit":box.limit}})],1):_c('k-moniter-list',{attrs:{"items":box.items,"shares":box.shares !== false,"limit":box.limit || 10}})],1)}),0),_c('p',{staticClass:"k-moniter-privacy"},[_vm._v(_vm._s(_vm.$t('moniter.privacy')))])],_c('footer',{staticClass:"k-moniter-ink k-moniter-footer"},[_c('span',[_vm._v("moniter")]),_c('a',{attrs:{"href":"https://rollinger.design","target":"_blank","rel":"noopener"}},[_vm._v("rollinger.design")])])],2)])
}
var staticRenderFns = []
return { render, staticRenderFns }
})(),
    },
  },
})
