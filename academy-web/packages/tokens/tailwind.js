// packages/tokens/tailwind.js
// tailwindPreset — spread into theme.extend of any product's tailwind.config.js

const { foundation } = require('./foundation')
const { products }   = require('./products')

function tailwindPreset(productKey) {
  const accent = products[productKey]
  if (!accent) {
    throw new Error(
      `@cyberskills/tokens: unknown productKey "${productKey}". ` +
      `Valid keys: ${Object.keys(products).join(', ')}`
    )
  }
  return {
    colors: {
      ...foundation,
      ...accent,
    },
  }
}

const fontFamily = {
  display: ['Space Grotesk', 'system-ui', 'sans-serif'],
  body:    ['Inter', 'system-ui', 'sans-serif'],
  mono:    ['JetBrains Mono', 'monospace'],
}

module.exports = { tailwindPreset, fontFamily }
