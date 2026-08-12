# Academy Production Dependency Audit Local Checkpoint

**Date:** 2026-08-09
**Academy baseline:** `845e371173efb7b15b7605ecbc9496c47e2068fb`
**Status:** local production and dev-inclusive audits green; release-blocked compatibility exception; independent re-review pending

## Outcome

The local production dependency tree resolves the vulnerable transitive packages
to patched releases without changing the Next.js major. This clears the scoped
audit locally, but the sharp override remains outside Next's declared dependency
contract and is not release-ready.

| Package | Baseline path/version | Official patched floor | Final resolution |
|---|---|---|---|
| `nanoid` | PostCSS transitive `3.3.16` | `3.3.17` ([GHSA-2v37-7h3g-55p8](https://github.com/advisories/GHSA-2v37-7h3g-55p8)) | `3.3.17` |
| `postcss` | Next 15.5.22 pinned `8.4.31` | `8.5.23` for the latest listed issue ([GHSA-fxqj-rqcc-2cmp](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp)) | `8.5.26` across the tree |
| `sharp` | Next optional dependency resolved `0.34.5` | `0.35.0` ([GHSA-f88m-g3jw-g9cj](https://github.com/advisories/GHSA-f88m-g3jw-g9cj)) | `0.35.2` across the tree |

The baseline PostCSS audit also listed
[GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93),
[GHSA-6g55-p6wh-862q](https://github.com/advisories/GHSA-6g55-p6wh-862q), and
[GHSA-r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849).
The final `8.5.26` resolution is above every patched floor in that grouped audit.

Next remains `15.5.22`. Official npm metadata for the newer Next `15.5.23` still
pins PostCSS `8.4.31` and declares optional sharp `^0.34.3`; it does not provide
a compatible patched sharp range. The root manifest uses npm overrides for the vulnerable
transitive edges; the PostCSS override references the existing direct dependency
specification as documented by
[npm package overrides](https://docs.npmjs.com/cli/configuring-npm/package-json/#overrides).
This avoids the breaking Next 16.3.0 change proposed by `npm audit fix --force`.

The dev-inclusive audit was remediated through the owning toolchain without a
major upgrade or override:

| Package | Baseline owner/version | Official patched floor | Final resolution |
|---|---|---|---|
| `js-yaml` | `@eslint/eslintrc@3.3.6` range `^4.3.0`, resolved `4.3.0` | `4.3.1` ([GHSA-5p4m-2wfm-xmqj](https://github.com/advisories/GHSA-5p4m-2wfm-xmqj)) | `4.3.1`, within the existing owner range |
| `undici` | `wrangler@4.118.0` -> `miniflare@5.20260730.0-alpha` -> `7.28.0` | `7.29.0` for all findings in the audit | `wrangler@4.120.0` -> `miniflare@5.20260801.1-alpha` -> `undici@7.29.0` |

Wrangler `4.120.0` remains within the `^4.86.0` peer range declared by
`@opennextjs/cloudflare@1.20.2`; Wrangler and Miniflare require Node `>=22`,
which the Academy `24.x` engine satisfies. The updated Miniflare chain also
resolves its owned `@speed-highlight/core` edge to `1.2.24`.

## Audit And Verification

The RED production audit reported four High findings across the vulnerable
`nanoid`, Next-bundled `postcss`, and `sharp` dependency paths. The final command
`npm audit --omit=dev --audit-level=high` exits zero with `found 0
vulnerabilities`.

The first full unit run then failed only the deterministic SBOM consistency
test because the direct PostCSS lock resolution moved from `8.5.25` to `8.5.26`.
After updating that receipt, the focused SBOM suite passed `2/2` and the full
unit suite passed `484/484` across 73 files.

| Gate | Result |
|---|---|
| Production audit RED | 4 High findings |
| Production audit GREEN | 0 vulnerabilities |
| Dev-inclusive audit RED | 2 High and 2 Moderate findings |
| Dev-inclusive audit GREEN | 0 vulnerabilities at `--audit-level=moderate` |
| Toolchain dependency tree | `js-yaml@4.3.1`; `wrangler@4.120.0`; `miniflare@5.20260801.1-alpha`; `undici@7.29.0`; no invalid/peer errors |
| Focused SBOM suite | 2/2 passed |
| Full unit regression | 484/484 passed |
| `npm run lint` | Passed; one existing warning in `registry.generated.ts` |
| Node 24 Next production build | Passed on Next 15.5.22; 29 static pages generated |
| Node 24 `/_next/image` positive | 200 `image/png`; 1,569 bytes; decoded 64x64 from a real 400x400 PNG |
| Node 24 malformed local source | 400 for `/robots.txt` |
| Node 24 unapproved remote source | 400 source-policy rejection |
| Node 24 OpenNext/Cloudflare build | Passed; Worker bundle generated with adapter 1.20.2 |
| Secret scan | `gitleaks detect --source . --no-banner`: no leaks found |
| Patch hygiene | `git diff --check` passed; staged index remained clean |
| Existing local server | PID 59647 remained the listener on port 3003; untouched |

The optimizer smoke used a temporary local raster and port `61012`. The listener,
raster, and response files were removed after verification. The OpenNext build
completed with its existing warning that `compatibility_date` `2025-03-25` could
be newer; this checkpoint did not change deployment configuration.

## CI And Remaining Risk

Academy and its director parent have no tracked CI workflow or CI configuration
boundary. The workspace workflows found during inventory belong to other product
repositories and are not canonical for Academy, so this checkpoint does not
create a workflow. Both `npm audit --omit=dev --audit-level=high` and the stricter
dev-inclusive `npm audit --audit-level=moderate` now exit zero locally; they can
become required gates when Academy adopts a canonical CI runner.

The sharp `0.35.2` override is a release-blocked compatibility exception because
Next 15.5.22 and 15.5.23 declare only `^0.34.3`. The Node `24.19.0` optimizer and
OpenNext evidence proves this local platform path works, but it cannot replace an
upstream-compatible range or explicit release approval for the exception. No
`npm audit fix`, force install, major upgrade, deployment, runtime configuration,
or external system changed here. The sharp exception remains the dependency
release blocker; the Wrangler/Miniflare toolchain findings are closed locally.

Final code/security review remains with the independent reviewer; this report
records author evidence only.
