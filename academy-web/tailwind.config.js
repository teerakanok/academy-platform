/** @type {import('tailwindcss').Config} */
const { tailwindPreset } = require('@cyberskills/tokens')

// ใช้ preset key `website` ไปก่อน — key `academy` ใน canonical tokens เป็นงาน
// director repo (บันทึกใน PENDING_USER_ACTION.md แล้ว ห้ามแก้ director repo จาก run นี้)
const preset = tailwindPreset('website')

module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      ...preset,
      // ฟอนต์ตาม website: Inter (body/display) + JetBrains Mono ผ่าน next/font CSS vars;
      // ภาษาไทย fallback เป็น system-ui (pattern เดียวกับ cyberskills-web)
      fontFamily: {
        display: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        body: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains-mono)', 'monospace'],
      },
    },
  },
  plugins: [],
}
