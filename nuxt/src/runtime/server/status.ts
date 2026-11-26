// GET /moniter/status : versions relevées au build, et Node qui sert le site. 401 sans la bonne clé.
import { defineEventHandler, getHeader, setResponseHeader, setResponseStatus, useRuntimeConfig } from '#imports'
// @ts-expect-error — module virtuel écrit par le module au build
import versions from '#moniter/versions'

export default defineEventHandler((event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const key = (useRuntimeConfig(event).moniter as { key?: string } | undefined)?.key
  if (!key || getHeader(event, 'x-moniter-key') !== String(key)) {
    setResponseStatus(event, 401)
    return { error: 'Unauthorized' }
  }
  return { ...versions, node: process.version.replace(/^v/, '') }
})
