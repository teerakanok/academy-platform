import { inflateSync } from 'node:zlib'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { publicShareImagePaths } from './public-share-image-paths.mjs'

const PNG_SIGNATURE = '89504e470d0a1a0a'

function paeth(left, above, upperLeft) {
  const estimate = left + above - upperLeft
  const leftDistance = Math.abs(estimate - left)
  const aboveDistance = Math.abs(estimate - above)
  const upperLeftDistance = Math.abs(estimate - upperLeft)
  return leftDistance <= aboveDistance && leftDistance <= upperLeftDistance ? left : aboveDistance <= upperLeftDistance ? above : upperLeft
}

function decodePng(path) {
  const source = readFileSync(path)
  if (source.subarray(0, 8).toString('hex') !== PNG_SIGNATURE) throw new Error(`not a PNG: ${path}`)

  let offset = 8
  let width = 0
  let height = 0
  const chunks = []
  while (offset < source.length) {
    const length = source.readUInt32BE(offset)
    const type = source.subarray(offset + 4, offset + 8).toString('ascii')
    const data = source.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      if (data[8] !== 8 || data[9] !== 6 || data[12] !== 0) throw new Error(`unsupported PNG encoding: ${path}`)
    }
    if (type === 'IDAT') chunks.push(data)
    offset += length + 12
  }

  if (width !== 1200 || height !== 630) throw new Error(`unexpected image size: ${path}`)
  const stride = width * 4
  const compressed = inflateSync(Buffer.concat(chunks))
  const pixels = Buffer.alloc(stride * height)
  let cursor = 0
  for (let y = 0; y < height; y += 1) {
    const filter = compressed[cursor]
    cursor += 1
    for (let x = 0; x < stride; x += 1) {
      const raw = compressed[cursor]
      cursor += 1
      const left = x >= 4 ? pixels[y * stride + x - 4] : 0
      const above = y > 0 ? pixels[(y - 1) * stride + x] : 0
      const upperLeft = y > 0 && x >= 4 ? pixels[(y - 1) * stride + x - 4] : 0
      const value = filter === 0 ? raw : filter === 1 ? (raw + left) & 255 : filter === 2 ? (raw + above) & 255 : filter === 3 ? (raw + Math.floor((left + above) / 2)) & 255 : filter === 4 ? (raw + paeth(left, above, upperLeft)) & 255 : null
      if (value === null) throw new Error(`unsupported PNG filter: ${path}`)
      pixels[y * stride + x] = value
    }
  }
  return { pixels, stride }
}

function countPixels(image, bounds, predicate) {
  let count = 0
  for (let y = bounds.top; y < bounds.bottom; y += 1) {
    for (let x = bounds.left; x < bounds.right; x += 1) {
      const index = y * image.stride + x * 4
      if (predicate(image.pixels[index], image.pixels[index + 1], image.pixels[index + 2], image.pixels[index + 3])) count += 1
    }
  }
  return count
}

const cyan = (red, green, blue, alpha) => alpha > 240 && red >= 40 && red <= 80 && green >= 170 && green <= 205 && blue >= 230
const white = (red, green, blue, alpha) => alpha > 240 && red >= 220 && green >= 220 && blue >= 220

for (const route of publicShareImagePaths()) {
  const path = join('.next', 'server', 'app', ...route.slice(1).split('/').slice(0, -1), `${route.split('/').at(-1)}.body`)
  const image = decodePng(path)
  if (countPixels(image, { left: 60, top: 60, right: 105, bottom: 120 }, cyan) < 100) throw new Error(`missing brand marker: ${route}`)
  if (countPixels(image, { left: 60, top: 180, right: 1120, bottom: 330 }, white) < 500) throw new Error(`missing centered title: ${route}`)
  if (countPixels(image, { left: 60, top: 0, right: 1120, bottom: 30 }, white) > 0) throw new Error(`title is clipped at top edge: ${route}`)
  if (countPixels(image, { left: 60, top: 480, right: 245, bottom: 575 }, cyan) < 500) throw new Error(`missing footer level badge: ${route}`)
}

console.log(`verified composition for ${publicShareImagePaths().length} static public share images`)
