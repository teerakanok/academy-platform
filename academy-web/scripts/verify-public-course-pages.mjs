import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { publicCoursePagePaths } from './public-course-page-paths.mjs'

const manifest = JSON.parse(readFileSync(join('.next', 'prerender-manifest.json'), 'utf8'))
for (const path of publicCoursePagePaths()) {
  const route = manifest.routes[path]
  if (!route) throw new Error(`missing static public course route: ${path}`)
  if (route.initialRevalidateSeconds !== false) throw new Error(`public course route is not immutable: ${path}`)
  if (route.srcRoute !== '/courses/[slug]/[locale]') throw new Error(`public course route has an unexpected source route: ${path}`)
  const locale = path.split('/').at(-1)
  const htmlPath = join('.next', 'server', 'app', ...path.slice(1).split('/')) + '.html'
  const html = readFileSync(htmlPath, 'utf8')
  if (!html.includes(`<html lang="${locale}"`)) throw new Error(`public course document language is wrong: ${path}`)
  if (!html.includes('CYBERSKILLS Academy</title>')) throw new Error(`public course document title is unbranded: ${path}`)
}

const dynamicRoute = manifest.dynamicRoutes['/courses/[slug]/[locale]']
if (!dynamicRoute || dynamicRoute.fallback !== false) throw new Error('localized public course route has a dynamic fallback')

console.log(`verified ${publicCoursePagePaths().length} static public course pages`)
