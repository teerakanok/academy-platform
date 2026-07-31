/** @type {import('tailwindcss').Config} */
const { tailwindPreset } = require('@cyberskills/tokens')

// ใช้โครง token ร่วมกับ ecosystem (ชื่อ cs-* เหมือนกันทุก product) แต่ผูกค่ากับ CSS
// variable เพื่อให้สลับ light/dark ได้ด้วย data-theme เดียว โดยไม่ต้องแก้ component
// — ค่าจริงของ Academy อยู่ใน src/app/globals.css
const preset = tailwindPreset('website')

const themeAware = {
  'cs-bg': 'rgb(var(--cs-bg) / <alpha-value>)',
  'cs-surface': 'rgb(var(--cs-surface) / <alpha-value>)',
  'cs-surface-2': 'rgb(var(--cs-surface-2) / <alpha-value>)',
  'cs-border': 'rgb(var(--cs-border) / <alpha-value>)',
  'cs-border-2': 'rgb(var(--cs-border-2) / <alpha-value>)',
  'cs-text': 'rgb(var(--cs-text) / <alpha-value>)',
  'cs-primary': 'rgb(var(--cs-primary) / <alpha-value>)',
  'cs-body': 'rgb(var(--cs-body) / <alpha-value>)',
  'cs-muted': 'rgb(var(--cs-muted) / <alpha-value>)',
  'cs-faint': 'rgb(var(--cs-faint) / <alpha-value>)',
  'cs-accent': 'rgb(var(--cs-accent) / <alpha-value>)',
  'cs-on-accent': 'rgb(var(--cs-on-accent) / <alpha-value>)',
  'cs-accent-2': 'rgb(var(--cs-accent-2) / <alpha-value>)',
  'cs-amber': 'rgb(var(--cs-amber) / <alpha-value>)',
  'cs-accent-dim': 'var(--cs-accent-dim)',
  'cs-accent-border': 'var(--cs-accent-border)',
  'cs-accent-2-dim': 'var(--cs-accent-2-dim)',
  'cs-accent-2-border': 'var(--cs-accent-2-border)',
  'cs-amber-dim': 'var(--cs-amber-dim)',
  'cs-amber-border': 'var(--cs-amber-border)',
}

module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      ...preset,
      colors: { ...preset.colors, ...themeAware },
      fontFamily: {
        // Fraunces = เสียงของ "คน/ความรู้" (หัวเรื่อง) · Inter = อ่านยาว/UI
        // · JetBrains Mono = เสียงของ "เครื่อง" (คำสั่ง/โค้ด)
        display: ['var(--font-fraunces)', 'Georgia', 'serif'],
        body: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains-mono)', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        card: 'var(--cs-shadow-card)',
        lift: 'var(--cs-shadow-lift)',
      },
    },
  },
  plugins: [],
}
