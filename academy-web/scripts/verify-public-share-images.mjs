import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { publicShareImagePaths } from './public-share-image-paths.mjs'

const paths = publicShareImagePaths()
const manifest = JSON.parse(readFileSync(join('.next', 'prerender-manifest.json'), 'utf8'))

const dynamicRoute = manifest.dynamicRoutes['/courses/[slug]/share/[locale]']
if (dynamicRoute?.fallback !== false) {
  throw new Error('public share image route must reject unenumerated locale variants')
}

for (const path of paths) {
  const route = manifest.routes[path]
  if (route?.initialRevalidateSeconds === false || route?.initialHeaders?.['cache-control']?.includes('immutable')) {
    throw new Error(`public share image must render dynamically so runtime visibility is enforced: ${path}`)
  }
}

console.log(`verified ${paths.length} dynamic public share image paths`)
