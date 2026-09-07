#!/usr/bin/env node
import { cpSync, lstatSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'

const sourceDirectory = path.resolve('.open-next/cache')
const targetDirectory = path.resolve('.open-next/assets/cdn-cgi/_next_cache')

function relativeFiles(directory, base = directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name)
    if (entry.isSymbolicLink()) throw new Error(`Symlinks are not allowed in OpenNext cache: ${entryPath}`)
    if (entry.isDirectory()) return relativeFiles(entryPath, base)
    return [path.relative(base, entryPath).replaceAll(path.sep, '/')]
  })
}

try {
  if (!lstatSync(sourceDirectory).isDirectory()) throw new Error('OpenNext cache is not a directory')
  rmSync(targetDirectory, { force: true, recursive: true })
  cpSync(sourceDirectory, targetDirectory, { recursive: true, verbatimSymlinks: false })

  const sourceFiles = relativeFiles(sourceDirectory)
  const targetFiles = relativeFiles(targetDirectory)
  const missing = sourceFiles.filter((file) => !targetFiles.includes(file))
  const extra = targetFiles.filter((file) => !sourceFiles.includes(file))
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(`OpenNext cache copy mismatch (missing: ${missing.length}, extra: ${extra.length})`)
  }
  for (const file of sourceFiles) {
    const source = readFileSync(path.join(sourceDirectory, file))
    const target = readFileSync(path.join(targetDirectory, file))
    if (!source.equals(target)) throw new Error(`OpenNext cache copy differs: ${file}`)
  }
  console.log(`Synced ${sourceFiles.length} OpenNext prerender-cache assets into Workers static assets`)
} catch (error) {
  console.error('Failed to sync OpenNext prerender cache:', error.message)
  process.exitCode = 1
}
