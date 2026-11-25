// Précompile les templates de la vue Audience (src/panel.js → index.js) en fonctions de rendu Vue 3.
//
// Kirby 6 charge chaque plugin du Panel comme un module ES, avec une import map qui fait de `vue`
// la copie du Panel : les fonctions de rendu importent leurs helpers de là. Précompiler garde la vue
// lisible sous une CSP sans 'unsafe-eval', où un `template: \`…\`` compilé à la volée ne marche pas.
//
// npm install && npm run build — puis committer index.js, que Kirby charge tel quel.
import { readFileSync, writeFileSync } from 'node:fs'
import { compile } from '@vue/compiler-dom'

const SRC = new URL('../src/panel.js', import.meta.url)
const OUT = new URL('../index.js', import.meta.url)

const source = readFileSync(SRC, 'utf8')
const helpers = new Map() // alias → nom exporté par vue
let count = 0

const out = source.replace(/^(\s*)template: `([\s\S]*?)`,?$/gm, (_, indent, template) => {
  count++
  const errors = []
  const { code } = compile(template, {
    mode: 'module',
    prefixIdentifiers: true,
    // Pas de hoisting : chaque template serait sinon livré avec ses `_hoisted_1` au niveau du module,
    // et deux templates en auraient du même nom.
    hoistStatic: false,
    cacheHandlers: true,
    whitespace: 'condense',
    onError: e => errors.push(e.message),
  })
  if (errors.length) throw new Error(`Template ${count} :\n${errors.join('\n')}`)

  const body = code.replace(/^import \{([^}]*)\} from "vue"\s*$/m, (_, list) => {
    for (const part of list.split(',')) {
      const [name, alias] = part.trim().split(/\s+as\s+/)
      if (name) helpers.set(alias || name, name)
    }
    return ''
  })
  if (/^import /m.test(body)) throw new Error(`Template ${count} : import inattendu`)
  if (/^const _hoisted/m.test(body)) throw new Error(`Template ${count} : constante hissée au niveau du module`)

  const render = body.replace(/^export function render/m, 'function render').trim()
  return `${indent}render: (() => {\n${render}\nreturn render\n})(),`
})
if (!count) throw new Error('Aucun template trouvé dans src/panel.js')

const imports = [...helpers].map(([alias, name]) => (alias === name ? name : `${name} as ${alias}`)).join(', ')
writeFileSync(
  OUT,
  `// GÉNÉRÉ par scripts/build-panel.mjs depuis src/panel.js — ne pas modifier ici, puis : npm run build\n` +
    `import { ${imports} } from 'vue'\n${out}`
)
console.log(`index.js : ${count} templates précompilés (Vue 3)`)
