import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { publicCoursePagePaths } from './public-course-page-paths.mjs'

function filesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? filesUnder(path) : [path]
  })
}

const cacheDirectory = join('.open-next', 'cache')
if (!existsSync(cacheDirectory)) throw new Error('OpenNext cache is missing; run npm run build:cf first')

const files = filesUnder(cacheDirectory).map((path) => path.replaceAll('\\', '/'))
for (const path of publicCoursePagePaths()) {
  const suffix = `${path.slice(1)}.cache`
  if (!files.some((file) => file.endsWith(suffix))) throw new Error(`OpenNext cache is missing: ${suffix}`)
}

console.log(`verified ${publicCoursePagePaths().length} static Cloudflare public course pages`)
