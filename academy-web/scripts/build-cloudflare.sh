#!/usr/bin/env bash
set -euo pipefail

export NEXT_PUBLIC_SUPABASE_URL=
export NEXT_PUBLIC_SUPABASE_ANON_KEY=
export ACADEMY_BUILD_DISABLE_WEBPACK_CACHE=1

if [[ -n "${NEXT_FONT_GOOGLE_MOCKED_RESPONSES:-}" ]]; then
  echo 'Production build refuses mocked font responses' >&2
  exit 1
fi

npm run verify:workerd
npx opennextjs-cloudflare build
npm run cache:sync
npm run asset-guard
node scripts/check-final-worker-startup.mjs
