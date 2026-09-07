# Assembly capstone source import

Source: Crucible `9d92ae369e0bb876a4dcb8ff0e5ccd6e43196377`, package `courses/academy/assembly`. Mechanical projection preserves all31 JSON files byte-for-byte; exactly four lesson files change from Academy ef82a5dbd2436b958c722d78069f807d04507e3f. Each of the two capstone banks now has15 MCQs per locale; original4 remain unchanged. Source red/green, bilingual correctness, parity and bias evidence lives in the source commit.

`node scripts/generate-content-registry.mjs`: exit0, 11courses/450contentfiles; generated registry unchanged because existing imports already reference these lessons. `npx vitest run --project unit`: exit0,2441passed/2skipped. `npm run lint`: exit1, only3 accepted pre-existing no-require-imports errors in academy-bound-worker-executor.cjs,16warnings. No visibility change: existing syllabus-preview retained.

This is a source import checkpoint. Build, rendered learner acceptance and production deployment are still pending; no live-completion claim.
