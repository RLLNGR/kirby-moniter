// GÉNÉRÉ par scripts/build-panel.mjs depuis src/panel.js — ne pas modifier ici, puis : npm run build
import { renderList as _renderList, Fragment as _Fragment, openBlock as _openBlock, createElementBlock as _createElementBlock, normalizeStyle as _normalizeStyle, createElementVNode as _createElementVNode, toDisplayString as _toDisplayString, createCommentVNode as _createCommentVNode, normalizeClass as _normalizeClass, createTextVNode as _createTextVNode, resolveComponent as _resolveComponent, createVNode as _createVNode, createBlock as _createBlock, withCtx as _withCtx } from 'vue'
// Vue Audience du Panel — données calculées en PHP (src/Summary.php), passées en props par la zone `moniter`.
// Habillage de Moniter (et du rapport mensuel) : crème, barres d'encre en minuscules, blocs blancs, pastilles.
// Précompilé par scripts/build-panel.mjs en fonctions de rendu Vue 3 (Kirby 6).

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
  render: (() => {
function render(_ctx, _cache) {
  return (_openBlock(), _createElementBlock("ol", { class: "k-moniter-list" }, [
    (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(_ctx.rows, (row) => {
      return (_openBlock(), _createElementBlock("li", {
        key: row.key
      }, [
        _createElementVNode("span", {
          class: "k-moniter-list-bar",
          style: _normalizeStyle({ width: row.bar * 100 + '%' })
        }, null, 4 /* STYLE */),
        _createElementVNode("span", {
          class: "k-moniter-list-name",
          title: row.hint || row.name
        }, _toDisplayString(row.name), 9 /* TEXT, PROPS */, ["title"]),
        (row.note)
          ? (_openBlock(), _createElementBlock("span", {
              key: 0,
              class: "k-moniter-list-note"
            }, _toDisplayString(row.note), 1 /* TEXT */))
          : _createCommentVNode("v-if", true),
        _createElementVNode("span", { class: "k-moniter-list-value" }, _toDisplayString(_ctx.num(row.value)), 1 /* TEXT */),
        (_ctx.shares)
          ? (_openBlock(), _createElementBlock("span", {
              key: 1,
              class: "k-moniter-list-share"
            }, _toDisplayString(_ctx.pct(row.share)), 1 /* TEXT */))
          : _createCommentVNode("v-if", true)
      ]))
    }), 128 /* KEYED_FRAGMENT */))
  ]))
}
return render
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
      return { fill: `color-mix(in srgb, var(--m-accent) ${Math.round(18 + t * 82)}%, var(--m-surface))` }
    },
    onMove(e) {
      const c = this.byCode.get(e.target.dataset && e.target.dataset.code)
      this.hover = c ? { c, x: e.clientX, y: e.clientY } : null
    },
  },
  render: (() => {
function render(_ctx, _cache) {
  return (_openBlock(), _createElementBlock("div", { class: "k-moniter-map" }, [
    (_ctx.map)
      ? (_openBlock(), _createElementBlock("svg", {
          key: 0,
          viewBox: '0 0 ' + _ctx.map.w + ' ' + _ctx.map.h,
          role: "img",
          "aria-label": _ctx.$t('moniter.countries.count', { count: _ctx.byCode.size }),
          onPointermove: _cache[0] || (_cache[0] = (...args) => (_ctx.onMove && _ctx.onMove(...args))),
          onPointerleave: _cache[1] || (_cache[1] = $event => (_ctx.hover = null))
        }, [
          (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(_ctx.map.paths, (d, code) => {
            return (_openBlock(), _createElementBlock("path", {
              key: code,
              d: d,
              "data-code": code,
              class: _normalizeClass({ on: _ctx.byCode.has(code), active: _ctx.hover && _ctx.hover.c.code === code }),
              style: _normalizeStyle(_ctx.shade(code))
            }, null, 14 /* CLASS, STYLE, PROPS */, ["d", "data-code"]))
          }), 128 /* KEYED_FRAGMENT */))
        ], 40 /* PROPS, NEED_HYDRATION */, ["viewBox", "aria-label"]))
      : (_ctx.map === null)
        ? (_openBlock(), _createElementBlock("div", {
            key: 1,
            class: "k-moniter-map-placeholder"
          }))
        : _createCommentVNode("v-if", true),
    (_ctx.hover)
      ? (_openBlock(), _createElementBlock("div", {
          key: 2,
          class: "k-moniter-tip",
          style: _normalizeStyle({ left: _ctx.hover.x + 'px', top: _ctx.hover.y + 'px' })
        }, _toDisplayString(_ctx.hover.c.name) + " · " + _toDisplayString(_ctx.hover.c.views.toLocaleString()), 5 /* TEXT, STYLE */))
      : _createCommentVNode("v-if", true)
  ]))
}
return render
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
        analytics: String, // adresse Google Analytics (option moniter.analytics), sinon null
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
        // IA : visites humaines venues d'un assistant, robots d'IA par famille, pages lues à la demande d'un utilisateur
        aiAssistants() {
          return this.stats.ai.assistants.map(a => ({ key: a.host, name: a.host, value: a.views }))
        },
        aiBots() {
          return this.stats.ai.bots.map(b => ({ key: b.name, name: b.name, note: this.$t('moniter.bot.' + b.family), value: b.views }))
        },
        aiPages() {
          return this.stats.ai.bot_pages.map(p => ({ key: p.path, name: this.page(p.path), hint: p.path, value: p.views }))
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
            { key: 'ai_assistants', items: this.aiAssistants, shares: false, note: 'ai_minimum' },
            { key: 'ai_bots', items: this.aiBots, shares: false, limit: 12 },
            { key: 'ai_pages', items: this.aiPages, shares: false, wide: true },
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
      render: (() => {
function render(_ctx, _cache) {
  const _component_k_moniter_map = _resolveComponent("k-moniter-map")
  const _component_k_moniter_list = _resolveComponent("k-moniter-list")
  const _component_k_panel_inside = _resolveComponent("k-panel-inside")

  return (_openBlock(), _createBlock(_component_k_panel_inside, { class: "k-moniter-view" }, {
    default: _withCtx(() => [
      _createElementVNode("div", { class: "k-moniter" }, [
        _createElementVNode("header", { class: "k-moniter-ink k-moniter-header" }, [
          _createElementVNode("h1", null, _toDisplayString(_ctx.$t('moniter.audience')), 1 /* TEXT */),
          _createElementVNode("nav", { class: "k-moniter-periods" }, [
            (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(_ctx.PERIODS, (p) => {
              return (_openBlock(), _createElementBlock("button", {
                key: p,
                type: "button",
                "aria-current": p === _ctx.period ? 'true' : null,
                onClick: $event => (_ctx.go(p))
              }, _toDisplayString(_ctx.$t('moniter.period.' + p)), 9 /* TEXT, PROPS */, ["aria-current", "onClick"]))
            }), 128 /* KEYED_FRAGMENT */))
          ])
        ]),
        (_ctx.analytics)
          ? (_openBlock(), _createElementBlock("p", {
              key: 0,
              class: "k-moniter-tools"
            }, [
              _createElementVNode("a", {
                href: _ctx.analytics,
                class: "k-moniter-button",
                target: "_blank",
                rel: "noopener"
              }, _toDisplayString(_ctx.$t('moniter.analytics')) + " ↗", 9 /* TEXT, PROPS */, ["href"])
            ]))
          : _createCommentVNode("v-if", true),
        (_ctx.error)
          ? (_openBlock(), _createElementBlock("p", {
              key: 1,
              class: "k-moniter-block k-moniter-message"
            }, _toDisplayString(_ctx.$t('moniter.error.' + _ctx.error)), 1 /* TEXT */))
          : (!_ctx.hasData)
            ? (_openBlock(), _createElementBlock("p", {
                key: 2,
                class: "k-moniter-block k-moniter-message"
              }, _toDisplayString(_ctx.$t('moniter.empty')), 1 /* TEXT */))
            : (_openBlock(), _createElementBlock(_Fragment, { key: 3 }, [
                _createElementVNode("div", { class: "k-moniter-kpis" }, [
                  (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(_ctx.kpis, (k) => {
                    return (_openBlock(), _createElementBlock("div", {
                      key: k.key,
                      class: "k-moniter-kpi",
                      "data-color": k.color
                    }, [
                      _createElementVNode("div", {
                        class: "k-moniter-kpi-dot",
                        "data-size": k.size
                      }, [
                        _createElementVNode("span", { class: "k-moniter-kpi-value" }, _toDisplayString(k.text), 1 /* TEXT */),
                        _createElementVNode("span", { class: "k-moniter-kpi-unit" }, _toDisplayString(k.unit), 1 /* TEXT */)
                      ], 8 /* PROPS */, ["data-size"]),
                      _createElementVNode("p", { class: "k-moniter-kpi-label" }, [
                        _createTextVNode(_toDisplayString(k.label) + " ", 1 /* TEXT */),
                        (k.delta)
                          ? (_openBlock(), _createElementBlock("span", {
                              key: 0,
                              class: "k-moniter-kpi-delta"
                            }, _toDisplayString(k.delta), 1 /* TEXT */))
                          : _createCommentVNode("v-if", true)
                      ])
                    ], 8 /* PROPS */, ["data-color"]))
                  }), 128 /* KEYED_FRAGMENT */))
                ]),
                _createElementVNode("p", { class: "k-moniter-compared" }, _toDisplayString(_ctx.compared), 1 /* TEXT */),
                _createElementVNode("section", { class: "k-moniter-block" }, [
                  _createElementVNode("h2", { class: "k-moniter-caption" }, _toDisplayString(_ctx.$t(_ctx.monthly ? 'moniter.chart.month' : 'moniter.chart.day')), 1 /* TEXT */),
                  _createElementVNode("div", {
                    class: "k-moniter-chart",
                    role: "img",
                    "aria-label": _ctx.$t('moniter.chart')
                  }, [
                    _createElementVNode("span", { class: "k-moniter-chart-max" }, _toDisplayString(_ctx.num(_ctx.max)), 1 /* TEXT */),
                    _createElementVNode("div", {
                      class: "k-moniter-chart-bars",
                      onPointermove: _cache[0] || (_cache[0] = (...args) => (_ctx.onMove && _ctx.onMove(...args))),
                      onPointerdown: _cache[1] || (_cache[1] = (...args) => (_ctx.onMove && _ctx.onMove(...args))),
                      onPointerleave: _cache[2] || (_cache[2] = $event => (_ctx.hover = null))
                    }, [
                      (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(_ctx.buckets, (b, i) => {
                        return (_openBlock(), _createElementBlock("div", {
                          key: b.key,
                          class: "k-moniter-chart-col",
                          "data-i": i
                        }, [
                          _createElementVNode("div", {
                            class: _normalizeClass(["k-moniter-chart-bar", { zero: !b.views, active: _ctx.hover && _ctx.hover.b === b }]),
                            style: _normalizeStyle({ height: (b.views / _ctx.max) * 100 + '%' })
                          }, null, 6 /* CLASS, STYLE */)
                        ], 8 /* PROPS */, ["data-i"]))
                      }), 128 /* KEYED_FRAGMENT */))
                    ], 32 /* NEED_HYDRATION */),
                    _createElementVNode("div", { class: "k-moniter-chart-axis" }, [
                      _createElementVNode("span", null, _toDisplayString(_ctx.buckets[0].label), 1 /* TEXT */),
                      _createElementVNode("span", null, _toDisplayString(_ctx.buckets[_ctx.buckets.length - 1].label), 1 /* TEXT */)
                    ])
                  ], 8 /* PROPS */, ["aria-label"]),
                  (_ctx.hover)
                    ? (_openBlock(), _createElementBlock("div", {
                        key: 0,
                        class: "k-moniter-tip",
                        style: _normalizeStyle({ left: _ctx.hover.x + 'px', top: _ctx.hover.y + 'px' })
                      }, [
                        _createTextVNode(_toDisplayString(_ctx.num(_ctx.hover.b.views)) + " " + _toDisplayString(_ctx.$t(_ctx.hover.b.views > 1 ? 'moniter.views' : 'moniter.view')) + " ", 1 /* TEXT */),
                        _createElementVNode("span", { class: "k-moniter-muted" }, "· " + _toDisplayString(_ctx.hover.b.label), 1 /* TEXT */)
                      ], 4 /* STYLE */))
                    : _createCommentVNode("v-if", true)
                ]),
                _createElementVNode("div", { class: "k-moniter-grid" }, [
                  (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(_ctx.boxes, (box) => {
                    return (_openBlock(), _createElementBlock("section", {
                      key: box.key,
                      class: _normalizeClass(["k-moniter-block", { 'k-moniter-wide': box.wide, 'k-moniter-full': box.map && _ctx.map }])
                    }, [
                      _createElementVNode("h2", { class: "k-moniter-caption" }, _toDisplayString(_ctx.$t('moniter.' + box.key)), 1 /* TEXT */),
                      (box.map && _ctx.map)
                        ? (_openBlock(), _createElementBlock("div", {
                            key: 0,
                            class: "k-moniter-map-layout"
                          }, [
                            _createVNode(_component_k_moniter_map, {
                              src: _ctx.map,
                              countries: _ctx.stats.countries
                            }, null, 8 /* PROPS */, ["src", "countries"]),
                            _createVNode(_component_k_moniter_list, {
                              items: box.items,
                              limit: box.limit
                            }, null, 8 /* PROPS */, ["items", "limit"])
                          ]))
                        : (_openBlock(), _createBlock(_component_k_moniter_list, {
                            key: 1,
                            items: box.items,
                            shares: box.shares !== false,
                            limit: box.limit || 10
                          }, null, 8 /* PROPS */, ["items", "shares", "limit"])),
                      (box.note)
                        ? (_openBlock(), _createElementBlock("p", {
                            key: 2,
                            class: "k-moniter-note"
                          }, _toDisplayString(_ctx.$t('moniter.' + box.note)), 1 /* TEXT */))
                        : _createCommentVNode("v-if", true)
                    ], 2 /* CLASS */))
                  }), 128 /* KEYED_FRAGMENT */))
                ]),
                _createElementVNode("p", { class: "k-moniter-privacy" }, _toDisplayString(_ctx.$t('moniter.privacy')), 1 /* TEXT */)
              ], 64 /* STABLE_FRAGMENT */)),
        _createElementVNode("footer", { class: "k-moniter-ink k-moniter-footer" }, [
          _createElementVNode("span", null, "moniter"),
          _createElementVNode("a", {
            href: "https://rollinger.design",
            target: "_blank",
            rel: "noopener"
          }, "rollinger.design")
        ])
      ])
    ]),
    _: 1 /* STABLE */
  }))
}
return render
})(),
    },
  },
})
