import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { publicShareImagePaths } from './public-share-image-paths.mjs'

const paths = publicShareImagePaths()
const manifest = JSON.parse(readFileSync(join('.next', 'prerender-manifest.json'), 'utf8'))

for (const path of paths) {
  const route = manifest.routes[path]
  if (!route || route.initialRevalidateSeconds !== false || route.initialHeaders?.['content-type'] !== 'image/png') {
    throw new Error(`public share image is not a static PNG: ${path}`)
  }
}

if (manifest.dynamicRoutes['/courses/[slug]/share/[locale]']?.fallback !== false) {
  throw new Error('public share image route must reject unenumerated locale variants')
}

console.log(`verified ${paths.length} static public share images`)
