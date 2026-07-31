// packages/tokens/products.js
// Per-product accent tokens — derived from logo SVG colors in cyberskills-website/public/logos/
// Source of truth: logo files. Do NOT change accent without a new logo as reference.

// All accent tokens use 'cs-accent' prefix to match existing component class names.
// Components use: text-cs-accent, bg-cs-accent, border-cs-accent, bg-cs-accent-dim, etc.
// This keeps migrations non-breaking — no component file changes required.

const products = {
  website: {
    // Source: --cs-accent in src/app/globals.css (canonical mark: components/v2/Brand.jsx CsMark; see public/brand/README.md)
    'cs-accent':        '#00e6b4',
    'cs-accent-dim':    'rgba(0,230,180,0.20)',
    'cs-accent-border': 'rgba(0,230,180,0.30)',
  },
  phalanx: {
    // Source: logos/logo-phalanx.svg stroke="#534AB7"
    'cs-accent':        '#534AB7',
    'cs-accent-dim':    'rgba(83,74,183,0.20)',
    'cs-accent-border': 'rgba(83,74,183,0.30)',
  },
  star: {
    // Override: white/monochrome — stars appear luminous white in the night sky
    'cs-accent':        '#e2e8f0',
    'cs-accent-dim':    'rgba(226,232,240,0.20)',
    'cs-accent-border': 'rgba(226,232,240,0.25)',
  },
  angler: {
    // Source: logos/logo-angler.svg stroke="#D85A30"
    'cs-accent':        '#D85A30',
    'cs-accent-dim':    'rgba(216,90,48,0.20)',
    'cs-accent-border': 'rgba(216,90,48,0.30)',
  },
  forge: {
    // Source: logos/logo-1000forge.svg stroke="#BA7517"
    'cs-accent':        '#BA7517',
    'cs-accent-dim':    'rgba(186,117,23,0.20)',
    'cs-accent-border': 'rgba(186,117,23,0.30)',
  },
}

module.exports = { products }
