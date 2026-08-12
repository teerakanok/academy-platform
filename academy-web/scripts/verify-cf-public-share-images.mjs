import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { publicShareImagePaths } from './public-share-image-paths.mjs'

const requiredSuffixes = publicShareImagePaths().map((path) => `${path.slice(1)}.cache`)

function filesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? filesUnder(path) : [path]
  })
}

const cacheDirectory = join('.open-next', 'cache')
if (!existsSync(cacheDirectory)) throw new Error('OpenNext cache is missing; run npm run build:cf first')

const files = filesUnder(cacheDirectory).map((path) => path.replaceAll('\\', '/'))
for (const suffix of requiredSuffixes) {
  if (!files.some((path) => path.endsWith(suffix))) throw new Error(`OpenNext cache is missing: ${suffix}`)
}

console.log(`verified ${requiredSuffixes.length} static Cloudflare share-image cache entries`)
