/**
 * Moniter — passages des robots d'IA sur un front Nuxt (site headless).
 *
 * Kirby ne voit pas les pages servies par Nuxt, et les robots n'exécutent pas le beacon : ce middleware
 * Nitro repère leur User-Agent et le signale au plugin (POST /moniter/bot, rllngr/kirby-moniter ≥ 1.8),
 * sans attendre la réponse. Le plugin ne garde qu'un compteur par jour et par robot (et la page, pour les
 * robots envoyés par un utilisateur) : ni IP, ni User-Agent, rien sur les visiteurs humains, qui ne passent pas ici.
 *
 * Configuration : NUXT_MONITER_URL (adresse du Kirby, ex. https://panel.exemple.com) et NUXT_MONITER_KEY
 * (la valeur de `moniter.key` dans la config Kirby). Sans les deux, le middleware ne fait rien.
 *
 * Limite : une page servie par un cache en amont (CDN, page prérendue) ne passe pas par ce middleware.
 */
import { defineEventHandler, getHeader, useRuntimeConfig } from '#imports'

// Même liste que Stats::AI_BOTS dans le plugin (src/Stats.php), qui fait autorité : il reclasse chaque passage.
const AI_BOTS = [
  // Entraînement
  'GPTBot', 'ClaudeBot', 'CCBot', 'meta-externalagent', 'MistralAI-Training', 'Amazonbot',
  // Recherche
  'OAI-SearchBot', 'PerplexityBot', 'Claude-SearchBot', 'meta-webindexer', 'MistralAI-Index', 'Amzn-SearchBot', 'Applebot', 'DuckAssistBot',
  // À la demande d'un utilisateur
  'ChatGPT-User', 'Perplexity-User', 'Claude-User', 'meta-externalfetcher', 'MistralAI-User', 'Amzn-User', 'Google-Agent', 'Google-GeminiNotebook',
]
const PATTERN = new RegExp(`(?<![a-z0-9-])(?:${AI_BOTS.join('|')})(?![a-z0-9-])`, 'i')

// Fichiers techniques : seules les pages (et llms.txt) comptent. /__nuxt_error est le rendu interne de la page
// d'erreur, qui repasse par ici avec le User-Agent du robot : la page demandée a déjà été signalée
const SKIP = /^\/(?:api|_nuxt|__nuxt|__nuxt_error|_ipx|moniter)(?:\/|$)|\.(?:js|mjs|css|map|json|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|mp4|webm|pdf)$/i

export default defineEventHandler((event) => {
  if (event.method !== 'GET') return
  const ua = getHeader(event, 'user-agent') || ''
  if (!PATTERN.test(ua)) return
  const path = event.path.split('?')[0] || '/'
  if (SKIP.test(path)) return

  const { url: moniterUrl, key: moniterKey } = (useRuntimeConfig(event).moniter ?? {}) as { url?: string; key?: string }
  if (!moniterUrl || !moniterKey) return

  // Sans attendre : le robot reçoit sa page tout de suite, et une erreur ici ne casse jamais le site
  const sent = fetch(`${String(moniterUrl).replace(/\/+$/, '')}/moniter/bot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Moniter-Key': String(moniterKey) },
    body: JSON.stringify({ ua, p: path }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => {})
  // Cloudflare Workers et consorts : laisse l'envoi se terminer après la réponse
  event.waitUntil?.(sent)
})
