// packages/tokens/foundation.js
// Foundation tokens — identical across ALL CYBERSKILLS products
// Do NOT modify per-product. Open a discussion before changing these values.

const foundation = {
  // Backgrounds
  'cs-bg':        '#060810',   // page background (near-black)
  'cs-surface':   '#0f1623',   // card / panel
  'cs-surface-2': '#1a2332',   // elevated card / hover state
  'cs-border':    '#1e2d3d',   // default border
  'cs-border-2':  '#2a3f55',   // hover / emphasis border

  // Typography
  'cs-text':      '#f0f6ff',   // headings / primary text (canonical)
  'cs-primary':   '#f0f6ff',   // alias — existing components use text-cs-primary
  'cs-body':      '#ccd6e8',   // body text
  'cs-muted':     '#8899aa',   // secondary / labels
  'cs-faint':     '#556677',   // placeholders / disabled

  // Semantic status (shared across all products)
  'cs-amber':     '#ffaa44',   // warnings / "In Development" badges
}

module.exports = { foundation }
