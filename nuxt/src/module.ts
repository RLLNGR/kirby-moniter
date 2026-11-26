/**
 * @rllngr/nuxt-moniter — relie un front Nuxt à Moniter.
 *
 * - `GET /moniter/status` : versions réellement installées (Nuxt, dépendances directes, gestionnaire de paquets,
 *   Node), que Moniter compare aux dernières versions npm. Protégé par `X-Moniter-Key`.
 * - Middleware des robots d'IA (sites headless) : signale leurs passages au plugin Kirby (POST /moniter/bot).
 *
 * Configuration par l'environnement : NUXT_MONITER_KEY (la clé du client dans Moniter, `moniter.key` côté Kirby)
 * et NUXT_MONITER_URL (adresse du Kirby, seulement pour les robots).
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { addServerHandler, addServerTemplate, createResolver, defineNuxtModule } from '@nuxt/kit'

export interface ModuleOptions {
  /** Endpoint des versions `/moniter/status` */
  status: boolean
  /** Signalement des robots d'IA au plugin Kirby (inutile sans Kirby : sans NUXT_MONITER_URL il ne fait rien) */
  bots: boolean
}

type Versions = Record<string, string | null>

// Dépendances qui ne viennent pas de npm : rien à comparer
const NOT_NPM = /^(?:workspace|file|link|portal|git\+?\w*|github|https?):/

const readJson = (file: string) => {
  try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return null }
}

// Version installée : node_modules du projet, puis des dossiers parents (monorepo, dépendances remontées)
function installed(root: string, name: string): string | null {
  for (let dir = root; ; dir = dirname(dir)) {
    const pkg = readJson(join(dir, 'node_modules', name, 'package.json'))
    if (pkg?.version) return pkg.version
    if (dirname(dir) === dir) return null
  }
}

// « pnpm@10.4.1+sha512.… » → « pnpm@10.4.1 » ; sinon le gestionnaire qui lance le build, ou le fichier de verrouillage
function packageManager(root: string, declared?: string): string | null {
  if (declared) return declared.split('+')[0] ?? null
  const agent = process.env.npm_config_user_agent?.match(/^(pnpm|yarn|npm|bun)\/([\d.]+)/)
  if (agent) return `${agent[1]}@${agent[2]}`
  const locks: [string, string][] = [['pnpm-lock.yaml', 'pnpm'], ['yarn.lock', 'yarn'], ['bun.lock', 'bun'], ['bun.lockb', 'bun'], ['package-lock.json', 'npm']]
  return locks.find(([file]) => existsSync(join(root, file)))?.[1] ?? null
}

function collect(root: string, deps: Record<string, string> = {}): Versions {
  const out: Versions = {}
  for (const [name, range] of Object.entries(deps)) {
    if (!NOT_NPM.test(range)) out[name] = installed(root, name)
  }
  return out
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@rllngr/nuxt-moniter',
    configKey: 'moniter',
    compatibility: { nuxt: '>=3.14.0' },
  },
  defaults: { status: true, bots: true },
  setup(options, nuxt) {
    const { resolve } = createResolver(import.meta.url)

    // runtimeConfig.moniter.key / .url ← NUXT_MONITER_KEY / NUXT_MONITER_URL
    const config = nuxt.options.runtimeConfig as Record<string, unknown>
    config.moniter = { key: '', url: '', ...(config.moniter as object | undefined) }

    if (options.status) {
      // node_modules n'est plus là une fois le site déployé : les versions sont relevées au build
      const root = nuxt.options.rootDir
      const pkg = readJson(join(root, 'package.json')) ?? {}
      const info = {
        nuxt: installed(root, 'nuxt') ?? nuxt._version ?? null,
        package_manager: packageManager(root, pkg.packageManager),
        packages: collect(root, pkg.dependencies),
        dev_packages: collect(root, pkg.devDependencies),
        built_at: new Date().toISOString(),
      }
      addServerTemplate({ filename: '#moniter/versions', getContents: () => `export default ${JSON.stringify(info)}` })
      addServerHandler({ route: '/moniter/status', method: 'get', handler: resolve('./runtime/server/status') })
    }

    if (options.bots) {
      addServerHandler({ middleware: true, handler: resolve('./runtime/server/bots') })
    }
  },
})
