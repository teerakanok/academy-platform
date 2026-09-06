# Academy asset boundary local evidence — 2026-09-06

## Commands and results

- RED: `nice -n 10 npx vitest run --project=unit content security header asset --maxWorkers 1` — exit 1, 6 failed / 80 passed. Log SHA-256 `feee37e4ff6612fba9ee1a55edf221104bd006862cac49cff1fd1955dd4cba0b`; exit SHA-256 `01ba4719c80b6fe911b091a7c05124b64eeece964e09c058ef8f9805daca546b`.
- Gate behavior: asset guard with planted `protected.mp4` — exit 1. Log SHA-256 `b4ef81a76bf933444443c9bfb87ffc272e724264b3e5874170a8e23159dd1465`; exit SHA-256 `4355a46b19d348dc2f57c046f8ef63d4538ebb936000f3c9ee954a27460dd865`.
- GREEN focus + both app/worker TypeScript configs: `nice -n 10 bash -lc 'cd academy-web && npm ci --ignore-scripts --no-audit && npx vitest run --project unit content security header asset --maxWorkers 1 && npx tsc --noEmit && npx tsc -p tsconfig.worker.json'` — final-tree exit 0, 9 files / 86 tests plus both configs. Log SHA-256 `edf9b21081048bf66c0855b4aaafca1c632faa5c661683805c2b18450ca994ee`; exit SHA-256 `9a271f2a916b0b6ee6cecb2426f0b3206ef074578be55d9bc94f6f3fe3ab86aa`.
- Full unit: `nice -n 10 npx vitest run --project unit --maxWorkers 1` — exit 0, 148 files / 2,417 tests. Log SHA-256 `36d8fd93583f5dbe8d267019980cebcca28afc57c967fc06c1d7c47e48bc02f3`; exit SHA-256 `9a271f2a916b0b6ee6cecb2426f0b3206ef074578be55d9bc94f6f3fe3ab86aa`.
- Final-tree full unit: 148 files / 2,417 tests, exit 0. Log SHA-256 `93fc0653112b3fb34a6c6c8cf155c08999cfc09966dbcf6b746b5f07c5f8a79e`; exit SHA-256 `9a271f2a916b0b6ee6cecb2426f0b3206ef074578be55d9bc94f6f3fe3ab86aa`.
- Lint baseline: `nice -n 10 npm run lint` — exit 1, known 3 errors / 16 warnings. Log SHA-256 `246c343efa0f21cd83546bb9445abfe3ae770582d37f87191bdbafceec7301a7`; exit SHA-256 `4355a46b19d348dc2f57c046f8ef63d4538ebb936000f3c9ee954a27460dd865`.
- Asset guard with missing final assets — exit 1 (fail closed). Log SHA-256 `4f8c482e6fc935d6683b44f643f9c9c888a31627671d680710ee6d53dca81fcd`; exit SHA-256 `4355a46b19d348dc2f57c046f8ef63d4538ebb936000f3c9ee954a27460dd865`.
- Independent review hardening: planted protected-extension symlink — guard exit 1. Log SHA-256 `741a875c0b9173393a0ac940745e294e619bfa0a8f63aaab75282febbabadcc3`; exit SHA-256 `4355a46b19d348dc2f57c046f8ef63d4538ebb936000f3c9ee954a27460dd865`.

## Blocked apparatus

- `npm run build:cf`: exit 1; sandbox workerd harness failed `listen EPERM 127.0.0.1` and could not write the Wrangler log under the user home. Log SHA-256 `d86aa659c50f8c28fb32153bd41c78870ea59855eb9e61d897476d8b0ff99be9`.
- Direct OpenNext build: exit 1; controlled network denied `fonts.googleapis.com`. Log SHA-256 `7fbc63d3aac4b6bcfc90a3e662f2a5a0b7d90a714a675ac554f2461a0d8ef6a9`.
- Therefore no actual `.open-next/assets` or copied `_headers` artifact exists locally; deployment and final-artifact gates remain.
