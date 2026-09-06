#!/usr/bin/env node
import { readdir } from 'node:fs/promises'
import path from 'node:path'

const PROTECTED_EXTENSIONS = new Set(['.mp4', '.vtt', '.pdf', '.zip'])
const assetsDirectory = path.resolve('.open-next/assets')

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true, recursive: true })
  if (entries.some((entry) => entry.isSymbolicLink())) {
    throw new Error('Symlinks are not allowed in final public assets')
  }
  return entries.map((entry) => path.join(entry.parentPath, entry.name))
}

try {
  const candidates = (await files(assetsDirectory)).filter((file) => {
    const extension = path.extname(file).toLowerCase()
    return PROTECTED_EXTENSIONS.has(extension) && path.basename(file) !== '_headers'
  })
  if (candidates.length > 0) {
    console.error(`Protected media payloads found in ${path.relative(process.cwd(), assetsDirectory)}:`)
    for (const file of candidates) console.error(`- ${path.relative(process.cwd(), file)}`)
    process.exitCode = 1
  } else {
    console.log(`Asset guard passed: no mp4/vtt/pdf/zip payloads in ${path.relative(process.cwd(), assetsDirectory)}`)
  }
} catch (error) {
  console.error(`Asset guard could not inspect ${assetsDirectory}:`, error.message)
  process.exitCode = 1
}
