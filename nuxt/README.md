# @rllngr/nuxt-moniter

Nuxt module that connects a front to [Moniter](https://moniter.rollinger.design), alongside the [kirby-moniter](https://github.com/RLLNGR/kirby-moniter) Kirby plugin.

- **Versions** — `GET /moniter/status` returns the versions actually installed: Nuxt, every direct dependency, the package manager and Node. Moniter compares them to the latest releases on npm.
- **AI bots** (headless sites) — Kirby never sees the pages Nuxt serves, and bots do not run the beacon: a server middleware recognises AI bots by User-Agent and reports each visit to the Kirby plugin (`POST /moniter/bot`, kirby-moniter ≥ 1.8) without waiting for the answer.

## Install

```bash
pnpm add @rllngr/nuxt-moniter
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@rllngr/nuxt-moniter'],
})
```

Environment of the server that runs the site:

```bash
NUXT_MONITER_KEY=…   # the client's key in Moniter (`moniter.key` on the Kirby side)
NUXT_MONITER_URL=…   # the Kirby address, e.g. https://panel.example.com — only for AI bots
```

Without `NUXT_MONITER_KEY` the endpoint answers `401`; without both variables the bot middleware does nothing.

### Options

```ts
export default defineNuxtConfig({
  moniter: {
    status: true, // GET /moniter/status
    bots: true,   // AI bot reporting to Kirby
  },
})
```

## `GET /moniter/status`

Header `X-Moniter-Key: <key>`, `401` without it.

```json
{
  "nuxt": "4.7.0",
  "node": "24.21.0",
  "package_manager": "pnpm@10.33.0",
  "packages": { "nuxt": "4.7.0", "vue": "3.5.46" },
  "dev_packages": { "sass": "1.89.0" },
  "built_at": "2026-11-26T14:23:49.047Z"
}
```

Versions are read from `node_modules` at build time (it is gone once the site is deployed), so they describe the build that is online; `node` is read on each call. The package manager comes from the `packageManager` field of `package.json`, otherwise from the tool running the build or the lockfile. Dependencies that do not come from npm (`workspace:`, `file:`, git…) are left out.

## Limits

- A fully prerendered site (`nuxt generate`) has no server: no endpoint and no bot reporting.
- A page served by an upstream cache (CDN) does not reach the middleware.
- Nothing about human visitors goes through this module; the bot User-Agent is only read to recognise the bot.

## Upgrading from the copied files

Earlier versions were files to copy (`nuxt/moniter-bots.ts` in `server/middleware/`). Delete that file and the `moniterUrl` / `moniterKey` entries of `runtimeConfig`: the environment variables keep the same names.

## Develop

```bash
pnpm install
pnpm build        # dist/
pnpm pack         # tarball to try in a project: pnpm add ./rllngr-nuxt-moniter-1.0.0.tgz
npm publish --access public
```
