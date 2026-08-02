# SBOM — academy-web

> Software Bill of Materials ตาม security baseline ของ ecosystem —
> รายการ direct dependencies + เวอร์ชันที่ resolve จริงจาก `package-lock.json`
> (lockfile = SBOM ฉบับเต็มของ transitive tree ทั้งหมด; commit คู่กันเสมอ)
> อัปเดตไฟล์นี้ทุกครั้งที่ dependency เปลี่ยน — มี unit test คุมความสอดคล้อง

## Runtime dependencies

| package | range | resolved | หน้าที่ |
|---|---|---|---|
| @cyberskills/tokens | `file:packages/tokens` | local | design tokens (vendored local package) |
| @opennextjs/cloudflare | `^1.20.2` | 1.20.2 | adapter รัน Next.js บน Cloudflare Workers (ยังเป็นตัวเลือก — ดู reports/reviews) |
| @supabase/ssr | `^0.12.4` | 0.12.4 | session ผ่าน cookie ฝั่ง server (M3 auth) |
| @supabase/supabase-js | `^2.111.0` | 2.111.0 | DB client (server-only, service role) |
| next | `^15.5.22` | 15.5.22 | framework (App Router) |
| react | `^18.3.1` | 18.3.1 | UI runtime |
| react-dom | `^18.3.1` | 18.3.1 | UI runtime (DOM) |
| server-only | `^0.0.1` | 0.0.1 | ทำให้ build **แดง** ถ้าโมดูลที่ถือเฉลยถูก import จาก client component (W0-1) — ไม่มี transitive dependency |
| wrangler | `^4.118.0` | 4.118.0 | CLI ของ Cloudflare Workers — ใช้ build/รันทดสอบบน workerd จริงในเครื่อง |
| zod | `^4.4.3` | 4.4.3 | input validation ที่ API boundary |

## Dev dependencies

| package | range | resolved | หน้าที่ |
|---|---|---|---|
| @axe-core/playwright | `^4.12.1` | 4.12.1 | a11y assertions ใน e2e |
| @eslint/eslintrc | `^3.3.6` | 3.3.6 | FlatCompat สำหรับ eslint-config-next |
| @playwright/test | `^1.62.1` | 1.62.1 | e2e runner |
| @types/node | `^24.13.3` | 24.13.3 | types |
| @types/pg | `^8.20.0` | 8.20.0 | types |
| @types/react | `^18.3.31` | 18.3.31 | types |
| @types/react-dom | `^18.3.7` | 18.3.7 | types |
| autoprefixer | `^10.5.4` | 10.5.4 | CSS postprocess |
| @cloudflare/workers-types | `^5.20260801.1` | 5.20260801.1 | types ของ workerd สำหรับ worker.ts (cron) — ใช้เฉพาะตอน typecheck |
| eslint | `^9.39.5` | 9.39.5 | linter |
| eslint-config-next | `^15.5.22` | 15.5.22 | lint rules ของ Next |
| pg | `^8.22.0` | 8.22.0 | Postgres client สำหรับ RLS hardening tests |
| postcss | `^8.5.25` | 8.5.25 | CSS pipeline |
| supabase | `^2.111.0` | 2.111.0 | Supabase CLI (local stack + migrations) — ตรึงใน lockfile |
| tailwindcss | `^3.4.19` | 3.4.19 | utility CSS (ตรึงตาม cyberskills-web) |
| typescript | `^5.9.3` | 5.9.3 | type checker |
| vitest | `^3.2.7` | 3.2.7 | unit/integration runner |
