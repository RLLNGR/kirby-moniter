// Précompile les templates de la vue Audience (src/panel.js → index.js).
//
// Le Panel n'embarque le compilateur de templates de Vue que si `panel.vue.compiler` est laissé à true :
// un site qui le coupe (CSP sans 'unsafe-eval') charge vue.runtime, et un composant écrit avec
// `template: \`…\`` n'y affiche rien, sans la moindre erreur. Les fonctions de rendu, elles, marchent partout.
//
// npm install && npm run build — puis committer index.js, que Kirby charge tel quel.
import { readFileSync, writeFileSync } from 'node:fs'
import { compileTemplate } from 'vue/compiler-sfc'

const SRC = new URL('../src/panel.js', import.meta.url)
const OUT = new URL('../index.js', import.meta.url)

const source = readFileSync(SRC, 'utf8')
let count = 0
const out = source.replace(/^(\s*)template: `([\s\S]*?)`,?$/gm, (_, indent, template) => {
  count++
  const { code, errors, tips } = compileTemplate({
    source: template,
    filename: `panel.js#template${count}`,
    compilerOptions: { whitespace: 'condense' },
    isProduction: true,
  })
  if (errors.length) throw new Error(`Template ${count} :\n${errors.join('\n')}`)
  for (const tip of tips) console.warn(`Template ${count} : ${tip}`)
  if (/\bwith\s*\(this\)/.test(code)) throw new Error(`Template ${count} : rendu avec with(this), interdit dans un module`)
  const body = code.replace(/^export\s*\{[^}]*\}\s*;?\s*$/m, '').trim()
  return `${indent}...(() => {\n${body}\nreturn { render, staticRenderFns }\n})(),`
})
if (!count) throw new Error('Aucun template trouvé dans src/panel.js')

writeFileSync(OUT, `// GÉNÉRÉ par scripts/build-panel.mjs depuis src/panel.js — ne pas modifier ici, puis : npm run build\n${out}`)
console.log(`index.js : ${count} templates précompilés`)
