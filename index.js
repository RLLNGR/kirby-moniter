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
  template: `
    <ol class="k-moniter-list">
      <li v-for="row in rows" :key="row.key">
        <span class="k-moniter-list-bar" :style="{ width: row.bar * 100 + '%' }"></span>
        <span class="k-moniter-list-name" :title="row.hint || row.name">{{ row.name }}</span>
        <span v-if="row.note" class="k-moniter-list-note">{{ row.note }}</span>
        <span class="k-moniter-list-value">{{ num(row.value) }}</span>
        <span v-if="shares" class="k-moniter-list-share">{{ pct(row.share) }}</span>
      </li>
    </ol>
  `,
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
      return { fill: `color-mix(in srgb, var(--m-accent) ${Math.round(18 + t * 82)}%, var(--m-surface))` }
    },
    onMove(e) {
      const c = this.byCode.get(e.target.dataset && e.target.dataset.code)
      this.hover = c ? { c, x: e.clientX, y: e.clientY } : null
    },
  },
  template: `
    <div class="k-moniter-map">
      <svg
        v-if="map"
        :viewBox="'0 0 ' + map.w + ' ' + map.h"
        role="img"
        :aria-label="$t('moniter.countries.count', { count: byCode.size })"
        @pointermove="onMove"
        @pointerleave="hover = null"
      >
        <path
          v-for="(d, code) in map.paths"
          :key="code"
          :d="d"
          :data-code="code"
          :class="{ on: byCode.has(code), active: hover && hover.c.code === code }"
          :style="shade(code)"
        />
      </svg>
      <div v-else-if="map === null" class="k-moniter-map-placeholder" />
      <div v-if="hover" class="k-moniter-tip" :style="{ left: hover.x + 'px', top: hover.y + 'px' }">
        {{ hover.c.name }} · {{ hover.c.views.toLocaleString() }}
      </div>
    </div>
  `,
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
          return [
            { key: 'top_pages', items: this.topPages, shares: false, wide: true },
            { key: 'sources', items: this.sources },
            { key: 'entry_pages', items: this.entryPages, shares: false, wide: true },
            { key: 'referrers', items: this.referrers, shares: false },
            { key: 'countries', items: this.countries, limit: 8, map: true },
            { key: 'devices', items: this.devices },
            { key: 'languages', items: this.languages, limit: 6 },
            { key: 'actions', items: this.actions, shares: false, limit: 12 },
            { key: 'campaigns', items: this.campaigns, shares: false },
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
      template: `
        <k-panel-inside class="k-moniter-view">
          <div class="k-moniter">
            <header class="k-moniter-ink k-moniter-header">
              <h1>{{ $t('moniter.audience') }}</h1>
              <nav class="k-moniter-periods">
                <button
                  v-for="p in PERIODS"
                  :key="p"
                  type="button"
                  :aria-current="p === period ? 'true' : null"
                  @click="go(p)"
                >{{ $t('moniter.period.' + p) }}</button>
              </nav>
            </header>

            <p v-if="error" class="k-moniter-block k-moniter-message">{{ $t('moniter.error.' + error) }}</p>
            <p v-else-if="!hasData" class="k-moniter-block k-moniter-message">{{ $t('moniter.empty') }}</p>

            <template v-else>
              <div class="k-moniter-kpis">
                <div v-for="k in kpis" :key="k.key" class="k-moniter-kpi" :data-color="k.color">
                  <div class="k-moniter-kpi-dot" :data-size="k.size">
                    <span class="k-moniter-kpi-value">{{ k.text }}</span>
                    <span class="k-moniter-kpi-unit">{{ k.unit }}</span>
                  </div>
                  <p class="k-moniter-kpi-label">
                    {{ k.label }}
                    <span v-if="k.delta" class="k-moniter-kpi-delta">{{ k.delta }}</span>
                  </p>
                </div>
              </div>
              <p class="k-moniter-compared">{{ compared }}</p>

              <section class="k-moniter-block">
                <h2 class="k-moniter-caption">{{ $t(monthly ? 'moniter.chart.month' : 'moniter.chart.day') }}</h2>
                <div class="k-moniter-chart" role="img" :aria-label="$t('moniter.chart')">
                  <span class="k-moniter-chart-max">{{ num(max) }}</span>
                  <div class="k-moniter-chart-bars" @pointermove="onMove" @pointerdown="onMove" @pointerleave="hover = null">
                    <div v-for="(b, i) in buckets" :key="b.key" class="k-moniter-chart-col" :data-i="i">
                      <div
                        class="k-moniter-chart-bar"
                        :class="{ zero: !b.views, active: hover && hover.b === b }"
                        :style="{ height: (b.views / max) * 100 + '%' }"
                      />
                    </div>
                  </div>
                  <div class="k-moniter-chart-axis">
                    <span>{{ buckets[0].label }}</span>
                    <span>{{ buckets[buckets.length - 1].label }}</span>
                  </div>
                </div>
                <div v-if="hover" class="k-moniter-tip" :style="{ left: hover.x + 'px', top: hover.y + 'px' }">
                  {{ num(hover.b.views) }} {{ $t(hover.b.views > 1 ? 'moniter.views' : 'moniter.view') }}
                  <span class="k-moniter-muted">· {{ hover.b.label }}</span>
                </div>
              </section>

              <div class="k-moniter-grid">
                <section
                  v-for="box in boxes"
                  :key="box.key"
                  class="k-moniter-block"
                  :class="{ 'k-moniter-wide': box.wide, 'k-moniter-full': box.map && map }"
                >
                  <h2 class="k-moniter-caption">{{ $t('moniter.' + box.key) }}</h2>
                  <div v-if="box.map && map" class="k-moniter-map-layout">
                    <k-moniter-map :src="map" :countries="stats.countries" />
                    <k-moniter-list :items="box.items" :limit="box.limit" />
                  </div>
                  <k-moniter-list v-else :items="box.items" :shares="box.shares !== false" :limit="box.limit || 10" />
                </section>
              </div>

              <p class="k-moniter-privacy">{{ $t('moniter.privacy') }}</p>
            </template>

            <footer class="k-moniter-ink k-moniter-footer">
              <span>moniter</span>
              <a href="https://rollinger.design" target="_blank" rel="noopener">rollinger.design</a>
            </footer>
          </div>
        </k-panel-inside>
      `,
    },
  },
})
