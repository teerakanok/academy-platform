# CyberSkills Academy — Active Plan

> Open work only. Move closed items to `completed_log.md` with evidence.
> Read `../AGENTS.md` first. Provider-neutral — no provider/model names in this plan.
> **Last updated:** 2026-09-03

**Current production-readiness checkpoint (2026-09-03):** The last directly
revalidated Academy Worker baseline remains deployment
`20f58559-daa8-4b77-81f7-7885686c1a14`, version
`bd4aea53-9137-4d49-a5f4-3a74be959736` at `100%`, tag
`release-646206ed7cdd`, with a `500 ms` CPU limit. Shared Identity release
`60920c9cc08bae2befc22f5c8ddbce5f678fefe9` is active with exact GoTrue
timeouts `5,000 ms` for regular calls and `10,000 ms` for OTP start, below the
Account Center outer deadline of `15,000 ms`. Its retained migration records a
post-dispatch timeout or response loss as recoverable `ambiguous`, forbids an
automatic resend, and permits the original code to be verified once within the
bounded challenge lifetime. Code-only mail templates, a server-owned Account
Center return, two distinct fresh Turnstile proofs, server-enforced GoTrue
CAPTCHA, and the approved relay remain active.

Academy is **not production-ready**. The latest owner-present canary reached
code verification, then stopped before callback/session creation because the
Academy client assertion could not be admitted by Identity Control. The Worker
still has the named private-JWK secret binding, but durable off-host custody was
not recovered and the resident value has not been classified as matching,
malformed, or rejected. Binding presence is not proof of a working key. The
reviewed diagnostic at source `eb99d9d58f2fe59a0998f2d5dc07842aca0b839d`
can classify import, registered public fingerprint, local signing, and Identity
admission without exporting the key. Its only attempted run stopped before
candidate upload or provider request because the Cloudflare Access operator
session was unavailable; production deployment and traffic remained unchanged.

Next gate: when the owner is present, renew exactly one bounded Cloudflare
Access session and run the reviewed diagnostic once. Do not rotate the key or
send another OTP before that classification. After the smallest evidence-backed
correction and production postchecks, complete the canary walkthrough through
callback, dashboard/catalog, entitled `setup-and-environment`, progress reload,
desktop and `412x915`, sign-out, and independent cleanup of only
session-created progress. Historical readiness statements below remain dated
evidence and do not override this checkpoint.

**Sole kill-switch operator evidence submitted for Identity review (2026-08-24):**
Academy now has a source-bound public sole-operator designation for Songpon Teerakanok,
Discord route `product-academy`, and email route
`contact@cyberskills.co.th`. A deterministic isolated rehearsal starts and ends disabled with
traffic/network/production operations `0`, runtime mutation `false`, and authority `NONE`.
The exact owner-session attestation binds all disable, verification, recovery, escalation, and
single-operator risk responsibilities; Discord author/content remain explicitly unfetched and
remotely unverified. Focused tests pass `4/4`, full unit passes `2,046/2,046`, lint/type checks and
secret scan pass, the seven-file freeze verifies, and independent review closes at `C0/H0/M0/L0`.
Canonical readiness remains receipts `3/5`, blockers `3/6`, ordered
`5/8` (`62.5%`), conformance `16/23`, authority `NONE`, and operations `0`. Exact next action:
Identity Control independently validates the pushed Academy actual root and accepts or rejects
this submission. Evidence:
`reports/reviews/academy-kill-switch-operator-evidence-local-checkpoint-20260824.md`.

**Public-only client-key registration/rotation evidence submitted locally (2026-08-24):**
Academy now captures one source-bound, local-ephemeral receipt from the reviewed registration
rehearsal. The receipt persists only `ES256`, derived key IDs, exact public-key references,
millisecond activation metadata, SHA-256 digests of public JWKs, active -> overlap+active ->
retired+active phase evidence, and eight boolean acceptance/refusal checks. It contains no public
JWK coordinates, private JWK member, private key, credential, or secret. The capture is bound to
Academy `0d44d22`, Identity `bf663fa`, the committed Identity receipt profile, and the prior
Academy rehearsal freeze. Focused tests pass `10/10`; full unit passes `2,046/2,046`; lint and all
configured TypeScript checks pass; the six-file freeze and secret-shape scan pass. Independent Sol
security review found one Medium spoofable-binding gap; exact sequence comparison, public-JWK
digest recomputation, and a coherent-substitution regression closed it at final `C0/H0/M0/L0`.
This remains submitted for independent
Identity review with blocker status open. Canonical readiness therefore remains receipts `2/5`,
blockers `2/6`, ordered `4/8` (`50.0%`), conformance `16/23`, authority `NONE`, and operations `0`.
Evidence: `reports/reviews/academy-client-public-key-registration-evidence-submission-20260824.json`.

**Lifecycle disabled-rehearsal acceptance ingested (2026-08-24):** Identity Control
independently reproduced Academy evidence root `b3a2010` and accepted only the disabled
authenticated-pull rehearsal at implementation `d4ccd79` and handoff/origin `bf663fa`.
The clean actual-root validator reports receipts `2/5`, closed blockers `2/6`, and ordered
readiness `4/8` (`50.0%`) while authority remains `NONE`, operations remain `0`, and Identity
conformance remains `16/23` (`69.6%`). The exact acceptance and its freeze are retained as
byte-identical Academy evidence. The next local no-traffic production gate is the
`client-public-key-registration-and-rotation-rehearsal` evidence submission: bind the existing
independently reviewed active -> overlap+active -> retired+active rehearsal to reviewed public-key
reference digest, algorithm, key identifier, and activation metadata for Identity actual-root
review. This selection grants no registration, key custody, runtime, traffic, or release authority.
Evidence: `reports/reviews/academy-identity-lifecycle-acceptance-intake-20260824.json`.

**No-traffic current-source candidate uploaded (2026-08-23):** Exact source revision
`be72bd4978b616bcd8d782dfc80106ab27780f67` is now Cloudflare Worker Version
`61fd7863-1152-49c3-acd3-bc4fd27db64e`. The bounded operation used the reviewed strict deployment
parser and proved the current deployment projection byte-identical before/after; the new version is
not in that deployment and receives `0%` production traffic. This supplies candidate-version
evidence only: no deployed-current-candidate smoke, operator receipt, rollback rehearsal, real OAuth
`code`/`state` acceptance, Identity enablement, or production authority was created. Production
admission remains `0/1`; Identity conformance remains `16/23` (`69.6%`). Evidence:
`reports/reviews/academy-no-traffic-candidate-upload-receipt-20260823.json`.

**Lifecycle endpoint/audience disabled rehearsal submitted locally (2026-08-24):**
Academy now binds the exact Identity-selected publisher endpoint, client-assertion audience, and
event audience to one source-bound rehearsal while the runtime consumer policy remains disabled
with all three lifecycle values `null`. Focused Node `3/3`, related scripts `13/13`, full unit
`2,044/2,044`, lint/type checks, and the four-file freeze pass. This local submission was later
accepted by Identity Control as recorded above; its original checkpoint metrics were ordered
readiness `3/8` (`37.5%`), receipts `1/5`, closed blockers `1/6`, and Identity conformance
`16/23` (`69.6%`). Evidence:
`reports/reviews/academy-identity-lifecycle-disabled-rehearsal-local-checkpoint-20260824.json`.

**Canonical-domain and authenticated callback evidence (accepted by Identity Control, 2026-08-23):**
The deployed `cyberskills-academy` Worker now has source-bound canonical-domain evidence for
`academy.cyberskills.co.th`: DNS and unauthenticated requests reach the Cloudflare Access gate,
and an owner-authorized Access session rendered `/`, `/courses` (eight previews), and the exact
no-parameter `/auth/callback` Worker validation response. Identity Control independently accepted
the exact two-artifact submission at `990df31`, closing only the canonical-domain blocker and
advancing accepted production receipts to `1/5`. This does not claim a real OAuth `code`/`state`
acceptance, production admission, or release authority. Closed blockers are `1/6`, ordered
readiness is `3/8`, and Identity conformance remains `16/23` (`69.6%`). Evidence:
`reports/reviews/academy-canonical-domain-deployment-receipt-20260823.json`,
`reports/reviews/academy-canonical-domain-callback-probe-receipt-20260823.json`, and
`reports/reviews/academy-canonical-domain-deployment-evidence-submission-20260823.json`.

**Public waitlist/browser quality checkpoint (closed locally, 2026-08-23):** malformed and
over-320-character email now stops before network; valid email normalization, adjacent accessible
email/consent errors, exact response-envelope handling, transport/body-read failure handling, and
Pixel 7 responsive course-preview geometry are verified. Full unit `2,044/2,044`, public Chromium
`59 passed / 1 intentional skip / 0 failed`, build `65/65`, independent implementation review,
Terra visual review, and Sol final all pass `C0/H0/M0/L0`. Production admission remains `0/1` and
Identity conformance remains `16/23`; the external production-artifact operation below is unchanged.
Evidence: `reports/reviews/academy-waitlist-client-validation-local-checkpoint-20260823.md`.

## Current execution lane — activate identity without widening Pool A access

**Production-admission evidence boundary (accepted local checkpoint, 2026-08-23):**
Academy now has a strict local contract that binds eight required release artifacts to one candidate
and returns at most `admissible_for_authorized_operation`. Focused 29/29 and related Identity 76/76
pass; exact freeze and independent code/security review pass at `C0/H0/M0`. Production admission
remains 0/1 and Identity conformance remains 16/23. The next open step is the separately authorized
operation that supplies and verifies the real source, migrations, runtime projection, visual index,
named operator receipt, deployed smoke, rollback rehearsal, and freeze manifest. Evidence:
`reports/reviews/academy-production-admission-evidence-contract-local-checkpoint-20260823.md`.

**Current-candidate preparation (2026-08-23):** Candidate
`14507463b7a7333e3797de65a7a0bee12ca2c929` has an isolated Node 24 build, a strict no-traffic
Cloudflare dry-run, source and ordered migration inventories, a sanitized runtime projection, and a
rechecked canonical visual index. The existing deployed Worker is deliberately recorded only as a
baseline because it binds `e933a34c126b6a6fd6008951952d0c62796df2a4`, not this candidate. The
available rollback version is likewise a read-only preflight, not a traffic-changing rehearsal.
Operator acknowledgement/receipt and real OAuth `code`/`state` acceptance remain open. This is a
truthful preparation record, not an accepted packet or production admission. Evidence:
`reports/reviews/academy-production-admission-candidate-preparation-20260823.json`.

**Client-assertion registration/rotation local rehearsal (accepted local checkpoint, 2026-08-23):**
Academy now has one local-only rehearsal boundary that generates ephemeral P-256 keys in memory,
derives collision-resistant key IDs from their public material, and drives Identity Control's
committed `ClientControlRegistry` through active -> overlap+active -> retired+active. Its strict
fixture validator binds the exact f0e1cc5 producer bootstrap fields, six-field public JWK
(`crv,key_ops,kty,use,x,y`), `publicKeyReference`, millisecond activation time, runtime map, and
freeze metadata. Assertions run through Identity's committed authenticator and prove active/overlap
acceptance plus retired, unknown, tampered, wrong-client, wrong-audience, and key-material refusal.
Separate validator negatives prove reference, activation-time precision, private-material, and
transition refusal. The existing 23-scenario conformance ledger remains the sole
ledger. Its declaration now points to this current ten-file checkpoint; tests prove the stale
2026-08-14 declaration fails while the refreshed manifest passes. All production flags remain
false. Independent local review closed at `C0/H0/M0/L0` after correcting one overstated evidence
claim. Real key custody, released-runtime rehearsal, canonical conformance `--write/current`, and
production authorization remain external gates. The JSON regeneration
must wait for the other session's protected dirty vault file to clear because the canonical receipt
collector enumerates the full worktree. Evidence:
`reports/reviews/academy-identity-client-assertion-registration-rehearsal-local-checkpoint-20260820.md`.

**Identity conformance rebind หลังรีวิวข้าม repo (2026-08-15):** ลานตรวจอิสระข้าม repo
(read-only ทั้ง Academy `86e94eb` และ Identity Control `fdcaf30`) สรุปว่าไม่พบ contract gap
ที่ต้องปิดก่อนเลื่อน `identityContractDigests` และให้ค่าที่ควร pin มาครบ — ตรวจเองซ้ำแล้ว
digest ทั้งหกไฟล์ที่วัดจากเครื่องตรงกับที่ผู้ตรวจให้มาทุกตัว ที่เปลี่ยนจริงมีสามค่า
(`consumer-conformance-kit.md`, `packages/contracts/src/index.ts`, `packages/testing/src/index.ts`)
· evidence digest ฝั่ง Academy drift หนึ่งไฟล์คือ `identity-client-assertion-conformance.test.ts`
ซึ่งเปลี่ยนที่ `3ea4646` ตอน signer เลิกรับ `CryptoKey` จากผู้เรียก — อธิบายได้และผ่านรีวิวมาแล้ว
อีก 20 ไฟล์ไม่ขยับ · **ledger ไม่ขยับ: 23 scenario 16 pass / 7 not_proven เท่าเดิม** งานนี้
เลื่อนเฉพาะ revision ที่หลักฐานผูกอยู่ ไม่ได้เลื่อนข้ออ้างว่าอะไรพิสูจน์แล้ว · generator
`--write` แล้วเช็คซ้ำได้ `current` · generator test 7/7 · unit 1348/1348 · tsc สะอาด
· eslint 0 error · `releaseApproval=false`, `runtimeWired=false`, `productionEvidence=false`
และ production NO-GO คงเดิม · คำตัดสินดิบ:
`reports/reviews/identity-academy-cross-repo-conformance-review-20260815.md`

**Adversarial sandbox durable snapshot (2026-08-15):** รีวิวอิสระรอบเจ็ดบน HEAD `86e94eb`
คืน `C0/H0/M1/L1 — REJECT` โดยยืนยันว่า M-01 (ยึดพอร์ตหลัง workerd bind) ปิดจริง แต่ชี้ว่า
`restoreOnExit()` ยังทำข้อมูลหายได้โดยไม่ต้องมีผู้โจมตี: snapshot อยู่แต่ในหน่วยความจำ
ถ้า `EACCES` นานเกินสองครั้งที่ handler เรียกติดกัน ไบต์เดิมหายไปพร้อมโปรเซส ทั้งสองข้อ
เป็น in-bound ตาม `checkpoint-ril` §3 (เกณฑ์ ก และ ค) แม้จะอยู่ในเครื่องมือที่ใช้พิสูจน์
ปิดแล้วด้วยการเขียนไบต์เดิมลงดิสก์นอกรีโปพร้อม `manifest.json` ในทุกทางที่ปล่อยไบต์เดิมทิ้ง
แล้ว exit handler พิมพ์คำสั่ง `cp` ที่กู้ได้จริง · POC เดียวกับที่ reviewer ใช้ REJECT commit
ไว้ที่ `academy-web/scripts/adversarial/sandbox-exit-path-poc.mjs` และผ่าน · ตัวเลขหลักฐาน
นับใหม่จากการรันจริง: unit 1348 ข้อ, เลนที่แตะ 73 ข้อ บนทั้ง node 24.18.0 และ 25.5.0,
`tsc` สะอาด, eslint 0 error, ทางหลบ not-wired 11 ทางถูกจับครบ, runner attack 12 รายการ
เป็นไปตามที่ควร · freeze manifest ขยายเป็น 14 ไฟล์ · `enabled=false`,
`releaseApproval=false`, `runtimeWired=false` และ production NO-GO คงเดิม.
ระหว่างทางเจอและปิดเพิ่มหนึ่งข้อ: สัญญาณที่จับไม่ได้ (`SIGKILL`/timeout ที่ฆ่าทั้ง
process group) ทำให้ไฟล์ที่สคริปต์แก้ค้างอยู่ แล้วรอบถัดไปอ่านสภาพนั้นเป็น "ของเดิม"
จนความเสียหายกลายเป็น baseline ถาวรพร้อมผลลวง `SURVIVED` · ปิดด้วย `assertPristine()`
ที่ทั้งสองสคริปต์เรียกก่อนแตะไฟล์แรก ออกด้วยรหัส `2` พร้อมคำสั่งคืนที่ใช้ได้จริง.

**Signed-result runtime composition author checkpoint (2026-08-14):** Academy's production-disabled
callback composition now requires the accepted signed code-exchange result verifier through one
least-capability injected port. Active/overlap producer vectors pass; retired, unknown-key, tampered,
unsigned, issuer/audience/client/nonce/principal/service/time mismatches stop before profile
activation or session creation. The existing dev-local raw fixture remains a separate explicit seam;
registry, routes, config, environment, migrations, database, Cloudflare, deploy, and UI are unchanged.
TDD RED stopped on the missing port. An integration RED passed `53/60` before direct transaction
tests were aligned to the mandatory signed seam. Node 24 focused tests pass `45/45`, related Academy
Identity passes `558/558`, and TypeScript/scoped ESLint pass. A different-independent reviewer
rebound the 11-file authority, verified exact producer compatibility and disabled zero-capability
behavior, and passed final `C0/H0/M0/L0`. Conformance remains `16/23`; all enablement/release flags
remain false and production is `NO-GO`. Evidence:
`reports/reviews/academy-identity-signed-result-runtime-composition-local-checkpoint-20260814.md`.

**Signed code-exchange result consumer checkpoint (2026-08-14):** Academy now
has a local-only Web Crypto ES256 verifier and bounded active/overlap result-key
ring bound to Identity Control producer revision
`5cf3d58e7e0a1dc3fe355de19f6b44a8a1742171`. It accepts the exact producer
positive, active, and overlap vectors and rejects retired, mismatched, tampered,
expired, malformed, ambiguous, lifecycle-key, and client-assertion-key input.
TDD RED stopped on the missing module; initial GREEN passed focused `34/34` and
related Identity `202/202`. The first different-independent review returned
`C0/H0/M1/L0` because the shared raw-result validator omitted the producer's
3..320 verified-email length bound. Remediation RED passed 26 and failed the
321-code-unit rejection; GREEN now passes focused `61/61`, related Identity
`203/203`, TypeScript, and scoped ESLint. A different-independent closure
reviewer passed final `C0/H0/M0/L0`. The consumer is not imported by transport,
callback, routes, or registry; conformance remains 16 pass / 7 `not_proven`,
all enablement/release flags remain false, and production stays NO-GO. Evidence:
`reports/reviews/academy-identity-code-exchange-result-envelope-local-checkpoint-20260814.md`.

**Durable Identity session store author checkpoint (2026-08-14):** A new
local, injected PostgreSQL adapter and forward migration `0027` now prepare the
Academy-owned production session persistence boundary without wiring it into a
route or registry. The adapter accepts only the runtime-completion principal and
activation claims, creates a 256-bit opaque ID, binds the database-clock receipt
back to the exact input, reads with expiry handling, and revokes idempotently.
The table remains inaccessible to browser, `service_role`, and Academy runtime
roles; `academy_runtime` receives only three exact RPC capabilities. Test-only
RED stopped on the missing module; focused `9/9`, related session/completion/
transaction/activation `69/69`, TypeScript, and scoped ESLint pass. The broader
Identity sweep passes `534/534` on the package-supported Node 24 runtime. An
initial Node 25 run reproduced one WebCrypto proxy-test incompatibility; rerun
on the declared engine removed it without a code change. Author evidence is at
`reports/reviews/academy-identity-postgres-session-store-local-checkpoint-20260814.md`.
The first different-independent review returned `C0/H0/M2/L0`. M-01 found that
session principals did not yet reuse the exact lifecycle issuer/UTF-16 subject
contract. M-02 found that SQL `integer` narrowed valid safe revisions above
`2^31-1`. Test-only RED expanded to `18` tests with `10` pass / `8` fail.
Remediation now uses the shared principal validator and the 0026 `subjectKey`
representation/predicates, while SQL uses `bigint` bounded through
`9007199254740991`. Focused `26/26`, related `112/112`, TypeScript, and scoped
ESLint pass. A different-independent closure reviewer rebound the refreshed
six-file authority, reran focused `26/26`, expanded relevant `124/124`,
additional durable-store `12/12`, TypeScript, and scoped ESLint, and passed
final `C0/H0/M0/L0`. Migration `0027` is unapplied, the adapter is unwired,
registry flags remain false, and production stays NO-GO.

**Runtime browser-flow local checkpoint (2026-08-14):** At Academy HEAD
`221fea08264c51bfa982d1237d2b19637e945982`, a local-only injected
boundary now composes authorization start, exact registered redirect, secure
browser-binding cookie, callback parsing, and the accepted runtime-completion
seam. TDD RED stopped on the missing module; GREEN passes focused `8/8`, related
route/runtime/security `67/67`, Academy Identity `537/537`, TypeScript, and
scoped ESLint. The existing routes delegate only through a least-capability
registry seam; the current registry returns no capability, so default start
remains `404` and unreleased Identity mode remains `503`. No endpoint, key,
audience, migration, DB, Cloudflare, deploy, or UI value changed. Conformance
remains 16 pass / 7 `not_proven`; `enabled=false`, `runtimeWired=false`,
`releaseApproval=false`, and production NO-GO remain unchanged. Author evidence
is at `reports/reviews/academy-identity-runtime-browser-flow-local-checkpoint-20260814.md`.
A different-independent RIL rebound the frozen eight-file authority, reran
focused `8/8`, related seam `67/67`, TypeScript, and scoped ESLint, and passed
`C0/H0/M0/L1`. The Low is nonblocking: before registry wiring, add direct
route-level mocks for the future enabled branches to verify status, redirect,
and multiple `Set-Cookie` propagation. It does not widen this disabled local
checkpoint or change the seven production evidence gates.

**Runtime completion seam remediation checkpoint (2026-08-14):** At current Academy
HEAD `ef7bdf21ec3b7ea6886ee14ae62dcf32bc3f75eb`, one local-only injected
composition boundary now orders durable transaction consume -> verified code
exchange -> Academy profile activation commit -> Academy-owned session create.
Original different RIL returned `C0/H0/M1/L0`: activation/session return values
were not bound back to the verified principal. Test-only RED produced 7 exact
failures; remediation binds issuer, subject, canonical email, activation status
and revision, validates exact session claims, and proves session-write failure
preserves callback consumption while fresh authorization can recover. Focused
`13/13`, relevant Identity `111/111`, TypeScript, and scoped ESLint pass.
Different closure RIL bound the remediated authority, reran `133/133` plus
TypeScript/scoped ESLint, and passed final `C0/H0/M0/L0` against
`reports/reviews/academy-identity-runtime-completion-freeze-20260814.json`.
No route, registry, config, migration, DB, Cloudflare, or UI byte changed;
`enabled=false`, `runtimeWired=false`, `releaseApproval=false`, and production
NO-GO remain unchanged.

**Current contract rebind (2026-08-14):** Academy's local conformance ledger
now pins Academy `f497649d06aeaad90eb3d7ac1f9cf0031a100f96` and Identity
Control `4efd9b7e76f48e00aa6e3896bc14626cd38bcb6a`. The only changed
producer contract file is `packages/contracts/src/index.ts`: it exports the new
bot-challenge action and browser authorization/OTP request schemas, and tightens
the existing authorization-start schema to reject surplus keys. The lifecycle
and client-assertion evidence digests remain unchanged. Local conformance stays
16 pass / 7 `not_proven`.
Registry `enabled=false`, `runtimeWired=false`, `releaseApproval=false`, and
production readiness remains false. Different-reviewer closure passed final
`C0/H0/M0/L0`; this rebind does not authorize migration, runtime wiring,
deploy, or release.

Production checkpoint 2026-08-05 ปิดแล้วสำหรับฐานข้อมูล, private-media delivery และ
least-privilege runtime data boundary: migrations `0001`–`0019` อยู่ใน Pool A;
dedicated PostgREST เผยเฉพาะ `academy` ผ่าน
`academy-data.cyberskills.co.th`, bind ที่ loopback, และ Worker version
`b85b7a6d-ceaa-4708-81fd-0d8096462251` ถือ Academy-scoped secret เท่านั้น
(`MEDIA_SIGNING_SECRET`, runtime API URL/secret). Valid runtime JWT ตอบ `200`;
anonymous, forged `service_role`, และ cross-schema ถูกปฏิเสธ `401/403/406` ตามลำดับ.
หลักฐานและ rollback อยู่ใน
[`reports/sessions/academy-production-release-2026-08-05.md`](../reports/sessions/academy-production-release-2026-08-05.md).

Retention boundary ใช้ migration `0020_dedicated_retention_api.sql` แยกจาก runtime
data boundary และ deploy แล้ว; เหลือเพียงหลักฐาน cron รอบ scheduled event แรกตาม
[`reports/academy-retention-api-rollout-2026-08-06.md`](../reports/academy-retention-api-rollout-2026-08-06.md).
Local scheduler checkpoint 2026-08-09 ปิด false completion แล้ว: หากครบ
`MAX_ROUNDS` แต่ทุก round ยังลบได้ job จะ log `retention.backlog_remaining`, emit
`retention.purge_failed`, ทำ job อื่นต่อ และ aggregate reject โดยไม่ emit
`purge_complete` ให้ job ที่ backlog ยังเหลือ. Focused 7/7, security wiring 40/40,
full unit 485/485, lint/typecheck/Next/OpenNext build ผ่าน. นี่ยังไม่แทน cron event
จริง; หลักฐาน local อยู่ที่
[`reports/reviews/academy-retention-backlog-fail-closed-local-checkpoint-2026-08-09.md`](../reports/reviews/academy-retention-backlog-fail-closed-local-checkpoint-2026-08-09.md).

**Identity Control alignment (2026-08-06):** Identity Control อนุมัติ Consumer
Registry v1 policy แล้ว: `client_id=academy-web`, `service_id=academy`,
`activation_policy=open`, callback
`https://academy.cyberskills.co.th/auth/callback`, result audience
`https://academy.cyberskills.co.th`, client-assertion audience
`https://accounts.cyberskills.co.th/v1/code/exchange`, config revision `1`, และ
lifecycle transport `authenticated_pull`. Registry state เริ่มต้นยัง `disabled`;
public-key references, lifecycle endpoint/audience และ kill-switch owner ยังเป็น
canonical `null`/ว่างจนกว่าจะมี evidence และ change record.

Academy local preparation ใช้ transaction boundary ที่เก็บ state, PKCE verifier
และ nonce ฝั่ง server, มี durable file store สำหรับ local restart tests, มี durable
opaque session store ที่ไม่ถือ course entitlement และปฏิเสธ callback ที่ไม่ใช่
`code` + `state`. Direct GoTrue OTP ยังคงเป็น loopback E2E fixture ที่ต้องเปิด
explicit เท่านั้น; real adapter, sign-in production และ session runtime ยังไม่ถูก
wire. ดู
`reports/reviews/academy-identity-control-preparation-2026-08-06.md` และ
`reports/integration/academy-identity-control-consumer-registration-candidate-2026-08-06.md`.

**Identity authorization PostgreSQL transaction store (2026-08-11):** Academy
มี durable local adapter + migration `0025` สำหรับ state, PKCE verifier, nonce,
browser-binding digest, exact client projection และ return path แล้ว.
Authorization start รอ durable create ก่อนส่ง browser ออก; callback รอ atomic
consume ก่อน exchange. Real local PostgreSQL ผ่าน 9/9 โดยพิสูจน์ restart,
one-time concurrent consume, wrong-binding preservation, expiry cleanup และ
runtime RPC-only ACL; focused unit ผ่าน 61/61, full unit 1,152/1,152 และ full
lint/typechecks ผ่าน. หลักฐานอยู่ที่
[`reports/reviews/academy-identity-postgres-transaction-store-local-checkpoint-2026-08-11.md`](../reports/reviews/academy-identity-postgres-transaction-store-local-checkpoint-2026-08-11.md).
First independent RIL คืน `C0/H0/M1/L0` เพราะ create/consume ใช้ DB clock ที่
snapshot ก่อนรอ row/unique lock. Real PostgreSQL RED ผ่าน 7 และล้ม 2 กรณี;
migration refresh clock หลัง arbitration/lock แล้ว GREEN ผ่าน 9/9 พร้อม focused
61/61. Different closure RIL verify manifest 11/11 และผ่าน final
`C0/H0/M0/L0`. Slice นี้ยังไม่มี route caller หรือผลที่
ลูกค้าเห็น; งานถัดไปคือ compose local-disabled authorization start -> callback ->
profile activation -> session แล้วพิสูจน์ด้วย real browser ก่อนเพิ่ม hardening
ย่อยอื่น.

การสร้าง principal ใหม่ไม่เชื่อมหรือย้าย waitlist lead ด้วย email; migration `0021`
จะ null ความสัมพันธ์ legacy เดิมโดยเก็บ lead/consent ไว้. Code exchange local
boundary รับ client assertion ในรูป compact JWS จาก signer ฝั่ง server เท่านั้น และ
ส่ง canonical assertion audience เข้า provider แต่ยังไม่มี signer/key/runtime จริง.

**Identity lifecycle-envelope local conformance checkpoint (2026-08-09):** Academy
มี local-only WebCrypto verifier ที่ผ่าน exact fixture vector จาก Identity Control
revision `a6ef1f430e1939a76fdccdcc35a1da41ff7a4606`; implementation freeze อยู่ที่
`845e371173efb7b15b7605ecbc9496c47e2068fb` และ fail closed สำหรับ signature,
algorithm, key ID, issuer, audience, time/skew/lifetime, strict event schema และ
malformed public key/JWS. Focused suite ผ่าน 4/4, identity regression 48/48, full
unit 478/478, lint/typecheck/build และ secret scan ผ่าน. หลักฐานอยู่ที่
[`reports/reviews/academy-identity-lifecycle-envelope-local-conformance-2026-08-09.md`](../reports/reviews/academy-identity-lifecycle-envelope-local-conformance-2026-08-09.md).
final independent closure review ผ่าน C0/H0/M0/L0; งานไม่ได้ wire transport, route, config, session หรือ
key distribution; `enabled=false` และ `releaseApproval=false` ยังเหมือนเดิม.

**Identity lifecycle projection reducer local checkpoint (2026-08-09):** Academy
มี pure local reducer ที่ mirror executable producer contract revision
`a6ef1f430e1939a76fdccdcc35a1da41ff7a4606`: รับ first valid seed และ contiguous
revision; projected duplicate/stale/gap/conflict ไม่เปลี่ยน current projection;
principal scope และ exact event/projection schema fail closed. Initial RIL
`C0/H0/M1/L0` พบว่า descriptor validation ยัง re-read Proxy ผ่าน `get`.
Remediation จึง snapshot `descriptor.value` ครั้งเดียวต่อ key ลง null-prototype
object แล้ว validate/classify จาก snapshot เท่านั้น; Proxy RED ล้ม 4/25 และ GREEN
ผ่าน focused 25/25, Identity regression 61/61 และ full unit 723/723 บน Node 24.18.0;
lint/typechecks, Next/OpenNext build, offline audits และ dependency tree ผ่าน.
หลักฐานอยู่ที่
[`reports/reviews/academy-identity-lifecycle-reducer-local-checkpoint-2026-08-09.md`](../reports/reviews/academy-identity-lifecycle-reducer-local-checkpoint-2026-08-09.md).
Final independent re-review ผ่าน `C0/H0/M0/L0`. Boundary ยัง library-only/unwired; endpoint/key/audience,
authenticated pull, durable page+cursor commit, owner, DB, deploy และ browser proof
ยังเป็น production gates แยก โดย `enabled=false` และ `releaseApproval=false`.

**Identity lifecycle durable page-store local checkpoint (2026-08-10):** Academy
มี unwired page builder + PostgreSQL RPC boundary สำหรับ verified page แล้ว:
singleton `academy-web` เก็บ cursor กับ approved/observed config latch; projection
ต่อ issuer/subject เก็บ applied state/revision, ready/gap/conflict และ
highest-known revision โดยไม่มี FK/user/email/activation. Commit ล็อก checkpoint,
CAS expected cursor, เขียน final update ต่อ principal, configuration และ cursor
สุดท้ายใน atomic statement เดียว; error ใด ๆ rollback ทั้ง page. TDD ผ่าน focused
41/41, disposable PostgreSQL 16/16, Identity 84/84 และ full unit 739/739 บน Node
24.18.0. Initial RIL `C0/H1/M2/L0` พบ ambient Docker authority/cleanup ambiguity,
raw-RPC gap evidence overwrite และ SQL issuer/UTF-16 parity. Remediation hardwire
validated local Unix socket + minimal Docker env, prove bounded cleanup, preserve
first gap observation และ enforce canonical issuer/UTF-16 bounds; adversarial
harness ผ่าน 7/7. Later RIL `C0/H1/M1/L0` พบว่า direct Vitest ยังเชื่อ marker+URL
ก่อน inspect owned container และ PostgreSQL text เก็บ lone UTF-16 surrogate
ไม่ได้. Remediation จึงบังคับ child inspect exact running ID/name/nonce label/
image/127.0.0.1 port ผ่าน pinned local Docker authority ก่อนสร้าง DB client และ
เปลี่ยน physical/RPC subject เป็น canonical four-hex-per-code-unit `subject_key`
ที่ decode กลับ lossless. GREEN ผ่าน harness 10/10, focused 47/47, disposable
PostgreSQL 23/23, identity-named 83/83 และ full unit 745/745. Lint/typechecks,
Next/OpenNext build, offline audits, dependency tree และ gitleaks ผ่าน. หลักฐานอยู่ที่
[`reports/reviews/academy-identity-lifecycle-page-store-local-checkpoint-2026-08-10.md`](../reports/reviews/academy-identity-lifecycle-page-store-local-checkpoint-2026-08-10.md).
Final independent re-review ผ่าน `C0/H0/M0/L0`; migration ยังไม่
apply นอก disposable loopback PostgreSQL และยังไม่มี puller/endpoint/key/
audience/runtime wiring, PostgREST deploy หรือ reconciliation authority. Registry
`enabled=false` และ `releaseApproval=false` คงเดิม.

**Identity lifecycle principal-contract parity checkpoint (2026-08-12):**
Identity Control revision `d7f517adb408ee2f50f3b5734c10dd14cbea6530`
นิยาม canonical principal issuer แบบ portable ASCII subset และ require subject
เป็น well-formed UTF-16 ไม่เกิน 512 code units. Academy ใช้ predicate เดียวกันใน
envelope verifier, reducer และ durable page-store แล้ว. Forward migration `0026`
แทน SQL helpers ให้ตรง producer และหยุดก่อน deploy หาก projection เดิมมี issuer
หรือ subject key ที่ผิด contract; ไม่มีการลบหรือ rewrite row อัตโนมัติ. TDD จาก
missing-module/lone-surrogate RED เป็น GREEN: lifecycle units 170/170, disposable
PostgreSQL 28/28 พร้อม migration-abort/rollback และ cleanup, scoped ESLint กับ
TypeScript ผ่าน. Different independent RIL bind exact checkpoint authority,
rerun focused 170/170 กับ static/data/reader gates และผ่าน final
`C0/H0/M0/L0`. Checkpoint ยังเป็น local/unwired; migration ที่ Pool A, runtime
wiring, deploy และ release ต้องผ่าน production gate แยก.

**Identity conformance principal-contract rebind (2026-08-12):** Academy
consumer policy mirror กับ deterministic conformance ledger pin Academy
`cbab363b6f7b7af25cb92673b5dfe35540cc8d23` และ Identity Control
`d7f517adb408ee2f50f3b5734c10dd14cbea6530` พร้อม contract digests ล่าสุดแล้ว.
Ledger bind principal-contract report/manifest และ producer signer/verifier bytes
แบบ exact digest โดยไม่ promote scenario ใหม่: คง 16 pass / 7 `not_proven`,
`enabled=false`, `runtimeWired=false`, `releaseApproval=false` และ production
NO-GO. Generator/policy RED จับ revision/evidence mismatch ก่อน GREEN 7/7 และ
4/4. Different independent RIL bind authority 12/12, rerun generator/policy,
canonical intake, receipt, reader และ diff gates แล้วผ่าน final
`C0/H0/M0/L0`; production boundary เดิมยังคงอยู่.

**Identity lifecycle pull-lease local checkpoint (2026-08-10):** Migration
`0023` เพิ่ม database-clock singleton lease สำหรับ logical puller หนึ่งตัวและ
fenced page commit ที่ lock active token ใน transaction เดียวกับ aggregate commit
ของ `0022`. Independent RIL แรกพบ `C0/H0/M1/L0`: narrowed runtime port ไม่มี
unfenced commit แต่ concrete production class ยัง export `commitPage`. M-01
remediation ลบ lower interface/method และ exact unfenced RPC literal ออกจาก
production module แล้ว; 0022 coverage ใช้ test-local `rawCommit` เท่านั้น และ
SQL revoke เดิมยังอยู่. RED ยืนยัน 1 failed / 23 passed ก่อน GREEN focused 28/28;
harness 13/13, disposable PostgreSQL 27/27 พร้อม cleanup, Identity 89/89 และ
typechecks ผ่านบน Node 24.18.0. `academy_runtime` ถูก revoke old commit RPC;
PUBLIC/runtime เขียน lease tableโดยตรงไม่ได้. หลักฐานก่อน remediation ยังมี
full unit 751/751; lint/typechecks,
Next/OpenNext builds, offline audits และ gitleaks ผ่าน. Local database fixture ใช้
exact content-addressed PostgreSQL image ID ที่ inspect แล้วตรงกับ pinned RepoDigest
และ `arm64`, พร้อม `--pull never`; นี่ไม่ใช่ portable CI proof. หลักฐานอยู่ที่
[`reports/reviews/academy-identity-lifecycle-pull-lease-local-checkpoint-2026-08-10.md`](../reports/reviews/academy-identity-lifecycle-pull-lease-local-checkpoint-2026-08-10.md).
Different independent re-review ยืนยัน machine freeze manifest 11 ไฟล์และผ่าน
`C0/H0/M0/L0`; ผู้ตรวจรันซ้ำ focused 28/28, Identity 89/89, harness 13/13,
disposable PostgreSQL 27/27 พร้อม cleanup, Node 24 typecheck, diff, reader และ
secret gates. Checkpoint นี้ยังไม่ wire pull cycle, scheduler, endpoint,
key/audience, runtime config หรือ deploy; registry `enabled=false` และ
`releaseApproval=false` คงเดิม.

**Identity lifecycle pure pull-cycle local checkpoint (2026-08-10):** Academy
มี unwired composition boundary ที่ claim database-clock lease, อ่าน durable
cursor/config, ส่ง cursor กับ cloned verification time ให้ injected verified-page
transport, build strict aggregate และ commit ผ่าน leased fence เท่านั้น. Busy
lease คืน bounded `lease_busy`; transport failure คืน `retry_required` พร้อมปิด
sensitive operations; schema/reducer/store failure reject และไม่ advance cursor.
Page result แยก gap/conflict flags โดยไม่กำหนด precedence และรายงาน
`config_revision_changed` โดยไม่ self-approve observed revision. TDD RED เริ่มจาก
missing module และ durable-config guard 1 failed/9 passed ก่อน GREEN focused
10/10; Identity regression 99/99, full unit 761/761, producer contract 20/20,
Node 24 lint/typecheck/Next build, offline audits และ gitleaks ผ่าน. หลักฐานอยู่ที่
[`reports/reviews/academy-identity-lifecycle-pull-cycle-local-checkpoint-2026-08-10.md`](../reports/reviews/academy-identity-lifecycle-pull-cycle-local-checkpoint-2026-08-10.md).
Independent RIL แรกคืน `C0/H0/M1/L0` เพราะ release `false` ไม่มีสถานะ และ release
throw จาก `finally` กลบ committed/retry/local failure เดิม. Remediation RED ล้ม
14/20; GREEN 20/20 หลังผลทุกชนิดที่ถือ lease มี `leaseRelease` แบบ
`confirmed|not_confirmed|unknown`, committed/retry คง primary outcome และ local
failure wrapper คง original cause. Identity regression หลังแก้ผ่าน 109/109 และ
producer contract 20/20; scoped lint/typecheck ผ่าน. Closure re-review คืน
`C0/H0/M1/L0` อีกครั้งด้วย M-02 เพราะ wrapper
คัดลอก `cause.message` ที่อาจมี credential-like/path/SQL detail ลง public message,
String และ stack. M-02 RED ล้ม 9/29; GREEN 29/29 หลังใช้ fixed allowlisted message,
เก็บ exact cause แบบ non-enumerable และให้ JSON/`Object.keys` เห็นเฉพาะ
`leaseRelease`. Identity regression หลัง M-02 ผ่าน 118/118, producer 20/20 และ
lint/typecheck ผ่าน. Different independent final re-review ยืนยัน remediation
freeze และผ่าน `C0/H0/M0/L0`. Checkpoint ยังไม่ wire endpoint/key/audience,
transport authentication/verification adapter, scheduler, retry/lag policy,
Worker/runtime
binding หรือ deploy; registry `enabled=false` และ `releaseApproval=false` คงเดิม.

**Identity Control conformance ledger local refresh (2026-08-10):** Academy
มี deterministic generator ที่ bind HEAD `845e371173efb7b15b7605ecbc9496c47e2068fb`
กับ Identity Control `a6ef1f430e1939a76fdccdcc35a1da41ff7a4606`, หก producer artifacts และ
final local lifecycle checkpoint evidence แบบ exact digest. Ledger 23 scenarios
คง 9 local passes เดิม, promote เฉพาะ 5 lifecycle scenarios ที่ independent RIL
ผ่านแล้ว และเก็บ 9 runtime-dependent scenarios เป็น `not_proven`. TDD RED ล้ม
เพราะ generator ยังไม่มี; GREEN ผ่าน focused 5/5, Identity unit 125/125 และ full
unit 780/780 บน Node 24.18.0. Canonical receipt exclude เฉพาะ report กับ declared
manifest; final intake ผ่าน 23 verified / 14 pass / 9 not-proven และ manifest
verify ผ่าน exact 8 content files. หลักฐานอยู่ที่
[`reports/reviews/academy-identity-control-conformance-ledger-refresh-local-checkpoint-2026-08-10.md`](../reports/reviews/academy-identity-control-conformance-ledger-refresh-local-checkpoint-2026-08-10.md).
Different independent RIL ผ่าน `C0/H0/M0/L0` และ root re-verify manifest ครบ 8
content files; `enabled=false`, `releaseApproval=false`, `runtimeWired=false` และ
production NO-GO คงเดิม เพราะ endpoint/key/audience/runtime/owner/deployed evidence
ยังไม่พร้อม.

**Identity lifecycle pull-page verifier local checkpoint (2026-08-10):** Academy
มี pure local boundary ที่ validate exact producer page schema, requested limit,
canonical signed-bigint cursor arithmetic และ positive safe config revision ก่อน
verify compact JWS ทุก envelope ด้วย time/policy snapshot เดียว. Test-only RED
หยุดที่ missing module; GREEN ผ่าน focused 34/34, lifecycle 120/120, full unit
814/814, producer contract 14/14 และ full lint/typechecks. Static import proof
ยืนยันว่า Worker/Wrangler/OpenNext/middleware/registry/callback ยังไม่ import
boundary นี้. หลักฐานอยู่ที่
[`reports/reviews/academy-identity-lifecycle-pull-page-verifier-local-checkpoint-2026-08-10.md`](../reports/reviews/academy-identity-lifecycle-pull-page-verifier-local-checkpoint-2026-08-10.md).
Checkpoint คง local-only/unwired หลัง different independent final RIL ผ่าน;
`enabled=false`, `releaseApproval=false`, `runtimeWired=false` และ production
NO-GO คงเดิมจน endpoint/key/audience/transport/scheduler/owner/deployed evidence
ได้รับ authorization แยก.
Independent RIL แรกคืน `C0/H0/M1/L0`: dense-array parser เรียก `ownKeys` ก่อน
reject own length ที่เกิน bound. M-01 test-only RED ล้ม 2/36 เพราะ overbound
envelopes และ JWK `key_ops` Proxy ถูก enumerate อย่างละหนึ่งครั้ง. Remediation
ตรวจ own length data descriptor และ bound ก่อน enumeration; GREEN ผ่าน focused
36/36 โดย trap เป็นศูนย์, lifecycle 122/122, producer 14/14 และ full
lint/typechecks. Different independent final re-review ผ่าน `C0/H0/M0/L0`;
checkpoint ยัง local-only/unwired และ production gates เดิมไม่เปลี่ยน.

**Identity lifecycle verified-page transport local checkpoint (2026-08-10):**
Academy มี pure local decorator ที่เชื่อม future duplicate-safe parsed-page port
เข้ากับ pull-page verifier และ pull cycle ที่ผ่าน independent RIL แล้ว. Boundary
ส่ง exact cursor+configured limit, ใช้ verification time หนึ่งค่าจาก cycle และ
explicit envelope policy ก่อนคืน verified page แบบ all-or-nothing. Missing-module
RED หยุดก่อน collection; GREEN แรกผ่าน 8/8. Author review เพิ่ม Proxy proof แล้ว
RED รอบสองผ่าน 8/9 เพราะ method ถูกอ่านซ้ำ; implementation จึง capture method
ครั้งเดียวพร้อม receiver เดิมและ GREEN ผ่าน 9/9. Relevant lifecycle ผ่าน 131/131,
full unit 825/825, producer contract 14/14 และ full lint/typechecks ผ่าน. หลักฐาน
อยู่ที่
[`reports/reviews/academy-identity-lifecycle-verified-page-transport-local-checkpoint-2026-08-10.md`](../reports/reviews/academy-identity-lifecycle-verified-page-transport-local-checkpoint-2026-08-10.md).
Different independent RIL bind manifest แล้วผ่าน `C0/H0/M0/L0`. Checkpoint คง
local-only/unwired: raw JSON, HTTP authentication/client assertion,
endpoint/key/audience, deadline/retry/lag, scheduler/runtime/deploy และ owner
approval ยังเป็น gates แยก; `enabled=false`, `releaseApproval=false`,
`runtimeWired=false` และ production NO-GO คงเดิม.

**Identity lifecycle pull-request builder local checkpoint (2026-08-10):**
Academy มี pure local builder ที่ bind configured consumer ID กับ client-assertion
audience, ตรวจ canonical durable cursor และ limit ก่อนเรียก injected server-side
signer แล้วคืน exact initial/continued request shape ตาม producer contract.
Missing-module RED หยุดก่อน collection. First run ผ่าน 23/25 โดยสอง failure เป็น
fixture ที่กำหนด length ผิดและ Proxy ขวาง receiver proof ของ test เอง; แก้เฉพาะ
fixture แล้วผ่าน 25/25. Author review เพิ่ม zero-coercion invariant; RED ล้ม 1/26
เพราะ regex เรียก object `toString()`, จากนั้น explicit string guard ทำให้ GREEN
ผ่าน 26/26. Relevant lifecycle ผ่าน 157/157, full unit 851/851, producer 14/14
และ full lint/typechecks ผ่าน. หลักฐานอยู่ที่
[`reports/reviews/academy-identity-lifecycle-pull-request-local-checkpoint-2026-08-10.md`](../reports/reviews/academy-identity-lifecycle-pull-request-local-checkpoint-2026-08-10.md).
Different independent RIL bind manifest แล้วผ่าน `C0/H0/M0/L0`. Checkpoint คง
local-only/unwired. Assertion signature/claims/replay, raw JSON, HTTP endpoint,
credentials/key rotation, deadline/backoff/lag, scheduler/runtime/deploy และ
owner authorization ยังเป็น gates แยก; `enabled=false`, `releaseApproval=false`,
`runtimeWired=false` และ production NO-GO คงเดิม.

**Identity lifecycle pull-operation transport local checkpoint (2026-08-10):**
Academy เพิ่ม pure local composition ระหว่าง pull-request builder กับ injected
logical operation แล้ว. Factory capture config และ operation method ครั้งเดียว,
ตรวจ configured/call limit ก่อน signer/operation และเรียก method ด้วย receiver
เดิม. Missing-module RED หยุดก่อน collection; first GREEN ผ่าน focused 8/8,
relevant lifecycle 165/165, full unit 887/887, producer contract 14/14 และ full
lint/typechecks. Valid empty page วิ่งผ่าน real verifier ไป fenced commit; invalid
cursor relation คืน bounded retry และไม่ commit. หลักฐานอยู่ที่
[`reports/reviews/academy-identity-lifecycle-pull-operation-transport-local-checkpoint-2026-08-10.md`](../reports/reviews/academy-identity-lifecycle-pull-operation-transport-local-checkpoint-2026-08-10.md).
Different independent RIL bind manifest, รัน focused 8/8, lifecycle 165/165,
producer 14/14 และ adversarial one-read/thenable probes แล้วผ่าน
`C0/H0/M0/L0`. HTTP endpoint/status, bounded raw transport,
credential/key ownership, scheduler/runtime/deploy และ production authorization
ยังเป็น gates แยก; `enabled=false`, `releaseApproval=false`,
`runtimeWired=false` และ production NO-GO คงเดิม.

**Identity lifecycle pull JSON operation local checkpoint (2026-08-10):**
Academy เพิ่ม pure local adapter ระหว่าง injected response transport กับ injected
strict JSON reader. Adapter capture method ทั้งสองครั้งเดียว, preserve receiver,
ส่ง exact pull request และคืนเฉพาะ parsed `unknown` เมื่อ reader ให้ `ok=true`.
Missing-module RED หยุดก่อน collection; first implementation ผ่าน 8/9 โดย failure
เดียวเป็น fixture ที่คาด raw target แทน Proxy receiver. แก้เฉพาะ fixture แล้ว
focused ผ่าน 9/9. Independent RIL แรกคืน `C0/H0/M1/L0` เพราะ async return
adopt rejecting thenable หลังออกจาก local catch และปล่อย error detail ได้.
Thenable RED ผ่าน 10/13; remediation ใช้ `return await value` ภายใน catch แล้ว
GREEN ผ่าน focused 13/13, strict-reader+lifecycle 206/206, full unit 900/900,
producer 14/14 และ full lint/typechecks. Real strict-reader test reject duplicate keys;
valid page commit ใต้ lease และ invalid cursor retry โดยไม่ commit. หลักฐานอยู่ที่
[`reports/reviews/academy-identity-lifecycle-pull-json-operation-local-checkpoint-2026-08-10.md`](../reports/reviews/academy-identity-lifecycle-pull-json-operation-local-checkpoint-2026-08-10.md).
Different independent re-review bind manifest ก่อนและหลังทุก gate, rerun focused
13/13, relevant 206/206 และ producer 14/14 แล้วผ่าน final `C0/H0/M0/L0`.
Response transport ยังเป็นเจ้าของ endpoint/auth/HTTP/status; parser values,
scheduler/runtime/deploy และ production authorization เป็น gates แยก. `enabled=false`,
`releaseApproval=false`, `runtimeWired=false` และ production NO-GO คงเดิม.

**Identity lifecycle pull transport composition local checkpoint (2026-08-11):**
Academy เพิ่ม pure factory ที่ snapshot consumer/audience/limit/assertion provider/
response transport/strict reader/envelope policy ครั้งเดียว แล้ว compose JSON
operation, request operation transport และ verified-page transport ที่ผ่าน RIL
แล้ว. Shared `requestedLimit` ค่าเดียวจึงผูกทั้ง signed request กับ page relation.
Missing-module RED หยุดก่อน collection; GREEN ผ่าน focused 11/11 หลังเพิ่ม
invalid-limit characterization, strict-reader+lifecycle 217/217, full unit
911/911, producer 14/14 และ full lint/typechecks บน Node 24.18.0. หลักฐานอยู่ที่
[`reports/reviews/academy-identity-lifecycle-pull-transport-local-checkpoint-2026-08-11.md`](../reports/reviews/academy-identity-lifecycle-pull-transport-local-checkpoint-2026-08-11.md).
Independent RIL แรกคืน `C0/H0/M1/L0` เพราะ verified-page owner destructure runtime
input ก่อน `try`; throwing Proxy getter จึงปล่อย raw detail และ malformed input
เรียก downstream ได้. RED ล้ม 6/16; remediation snapshot cursor/time ครั้งเดียว
ภายใน catch, validate ก่อน `pullPage`, แล้ว GREEN ผ่าน owner 16/16, combined
focus 27/27, relevant 224/224, full 918/918 และ full lint/typechecks. Different
independent re-review bind manifest ก่อนและหลัง gates แล้วผ่าน final
`C0/H0/M0/L0`. Module ยังไม่มี runtime import;
endpoint/key/audience/HTTP/parser/scheduler/operator/deploy และ production
authorization เป็น gates แยก. `enabled=false`, `releaseApproval=false`,
`runtimeWired=false` และ production NO-GO คงเดิม.

**Identity client-assertion provider local checkpoint (2026-08-11):** Academy
เพิ่ม provider ฝั่ง server ที่สร้าง compact JWS ตาม producer verifier โดยเรียก
injected ES256 signer เท่านั้น ไม่ generate/import/export key และไม่อ่าน secret.
แต่ละ instance pin client ID, exact HTTPS audience, key ID, lifetime 30–300 วินาที
และ purpose `code_exchange | lifecycle_pull`; cross-purpose request หยุดก่อน clock,
JTI หรือ signer. Missing-module RED หยุดก่อน collection; first GREEN 20/20.
Resource RED ล้ม 2/22 ก่อนเพิ่ม producer-aligned header/claims ceilings และตรวจ
signature 64 ไบต์ก่อน fixed copy. Purpose-isolation RED ล้ม 3/25 ก่อน pin purpose;
first different RIL พบ `C0/H0/M1/L0` เพราะ signer port ยังไม่ bind
client/purpose/key จึง reuse capability ข้าม boundary ได้. Remediation RED ผ่าน
25 เดิมและล้ม 3 binding cases; provider จึงตรวจ signer binding ก่อน side effect
และส่ง binding เดิมเข้า `sign` ให้ runtime signer ตรวจซ้ำ. Focused ปัจจุบันผ่าน
30/30, Identity regression 17 files/258 tests, full unit+type 90 files/952 tests,
producer verifier + lifecycle contract 22/22 และ full lint/TypeScript ทุก config
ผ่านโดยมี warning เดิมใน generated registry 1 จุด.
หลักฐานอยู่ที่
[`reports/reviews/academy-identity-client-assertion-provider-local-checkpoint-2026-08-11.md`](../reports/reviews/academy-identity-client-assertion-provider-local-checkpoint-2026-08-11.md).
Different independent re-review bind manifest ก่อนและหลัง gates แล้วผ่าน final
`C0/H0/M0/L0`. Test ใช้ ephemeral non-exportable key
และ `.example` lifecycle audience เท่านั้น; production key ceremony, public-key
registration/rotation, exact lifecycle endpoint/audiences, secret-store binding,
JTI owner, HTTP/scheduler/runtime/deploy และ authorization ยังเป็น gates แยก.
`enabled=false`, `releaseApproval=false`, `runtimeWired=false` และ production
NO-GO คงเดิม.

**Identity client-assertion JTI source local checkpoint (2026-08-11):** Academy
เพิ่ม zero-argument server adapter ที่ใช้เฉพาะ `globalThis.crypto.randomUUID()`
เพื่อสร้าง canonical UUID v4 ซึ่งตรง producer JTI grammar. Module capture
Web Crypto object/method ครั้งเดียว, preserve receiver, reject missing/throwing/
malformed output ด้วย fixed failure และไม่เปิด entropy injection หรือ fallback
ไป weak randomness. Missing-module RED หยุดก่อน collection; first implementation
ผ่าน 9/10 เพราะ explicit `null` fallback ไป global crypto, แล้ว GREEN 10/10 หลัง
แยก omitted/malformed input. Security self-audit RED 10/11 เพราะ factory ยังรับ
entropy override; zero-argument API ทำให้ final GREEN 11/11. Identity regression
ผ่าน 18 files/269 tests, full unit+type 91 files/963 tests, producer 22/22 และ
full lint/TypeScript ผ่านโดยมี generated warning เดิม 1 จุด. หลักฐานอยู่ที่
[`reports/reviews/academy-identity-client-assertion-jti-source-local-checkpoint-2026-08-11.md`](../reports/reviews/academy-identity-client-assertion-jti-source-local-checkpoint-2026-08-11.md).
Different independent RIL verified the frozen manifest and returned final
`C0/H0/M0/L0`. Identity Control ยังเป็นเจ้าของ
atomic replay reservation; signer/key ceremony, exact lifecycle values,
HTTP/scheduler/runtime/deploy และ release authorization ยังเป็น gates แยก.
`enabled=false`, `releaseApproval=false`, `runtimeWired=false` และ production
NO-GO คงเดิม.

**Identity client-assertion Web Crypto signer local checkpoint (2026-08-11):**
Academy เพิ่ม pure server capability ที่รับ opaque `CryptoKey` ซึ่งต้องเป็น
private P-256, non-exportable และ sign-only ก่อน bind client/purpose/key ID แล้ว
เรียก captured `crypto.subtle.sign`. Module ไม่ generate/import/export/read secret
และคืน raw 64-byte ES256 signature ให้ provider ที่ผ่าน RIL แล้ว. Missing-module
RED หยุดก่อน collection; first GREEN 13/13. Security self-audit เพิ่ม stateful
key-metadata case แล้ว RED ล้ม 1/15 เพราะอ่าน nested `namedCurve` ซ้ำ; one-read
fix ทำให้ GREEN 15/15 พร้อม byte-snapshot proof. Different independent RIL แรก
คืน `C0/H0/M1/L0` เพราะ ordinary key metadata reads เชื่อ own-property shadow;
extractable key จึงปลอม `extractable=false` แล้ว sign ได้. Remediation RED ผ่าน
15 เดิมและล้ม 3 native-brand cases; captured `CryptoKey.prototype` getters ทำให้
GREEN 18/18. Provider/JTI/signer focus ผ่าน 59/59, Academy Identity 287/287,
full unit 91 files/977 tests, producer 22/22 และ full lint/ทุก TypeScript config
ผ่านโดยมี generated warning เดิม 1 จุด. หลักฐาน
อยู่ที่
[`reports/reviews/academy-identity-client-assertion-webcrypto-signer-local-checkpoint-2026-08-11.md`](../reports/reviews/academy-identity-client-assertion-webcrypto-signer-local-checkpoint-2026-08-11.md).
Different independent re-review bind manifest และผ่าน final `C0/H0/M0/L0` บน
supported Node 24. Node 25 compatibility probe ยังคืน native metadata จริงและไม่
เกิด extractable bypass; literal Proxy behavior ต้อง rerun กับ pinned `workerd`
compatibility date ตอน runtime wiring. Module พิสูจน์ได้เฉพาะ native metadata และ
call binding ของ opaque capability; key ceremony/secret-store/public digest ยัง
ต้องพิสูจน์ว่า underlying key ไม่ถูก reuse ข้าม purpose. ไม่มี runtime import;
exact values, public-key registration/rotation, HTTP/scheduler/deploy/release ยัง
เป็น external gates. `enabled=false`, `releaseApproval=false`,
`runtimeWired=false` และ production NO-GO คงเดิม.

> **แทนที่แล้ว (2026-08-14):** ย่อหน้าข้างบนบรรยาย contract ที่เลิกใช้แล้ว signer
> ไม่รับ opaque `CryptoKey` จากผู้เรียกอีกต่อไป และไม่ตรวจ native metadata อีกแล้ว
> ข้อความ "Node 25 ... ไม่เกิด extractable bypass" กับ "Proxy behavior ต้อง rerun
> กับ pinned workerd compatibility date" ได้รับการพิสูจน์แล้วว่าข้อแรกผิดและข้อสอง
> จำเป็นจริง: บน Node 25 `Object.create(realKey)` ที่บัง `Symbol(kExtractable)`
> ผ่านทุก getter แล้วถูกรับไปเซ็น และบน workerd ที่ compatibility ของแอป
> `CryptoKey.prototype` ไม่มี getter เลยส่วน `structuredClone` โยน `DataCloneError`
> สถานะปัจจุบันอยู่ที่
> [`academy-identity-client-assertion-webcrypto-signer-contract-rebind-local-checkpoint-20260814.md`](../reports/reviews/academy-identity-client-assertion-webcrypto-signer-contract-rebind-local-checkpoint-20260814.md)

**Identity client-assertion canonical conformance refresh (2026-08-11):**
Academy เพิ่ม focused composition ที่ใช้ JTI source, provider และ Web Crypto
signer ที่ผ่าน RIL ร่วมกันเพื่อสร้าง ES256 assertion จริงสองใบสำหรับ exact
`academy-web` + code-exchange audience, ตรวจ signature/claims/lifetime/JTI และ
reject wrong audience ก่อนขอ JTI เพิ่ม. Generator RED หยุดเพราะยังไม่มี
client-assertion scenario export; GREEN ผ่าน 5/5 หลัง source-bind integration test
กับ final provider/JTI/signer reports+manifests. Identity regression ผ่าน 288/288,
full unit 92 files/978 tests, producer assertion+lifecycle 22/22 และ full lint/
TypeScript ผ่านโดยมี generated warning เดิม 1 จุด. Canonical ledger ขยับ
จาก 14 pass/9 not-proven เป็น 15 pass/8 not-proven โดยยังคง `enabled=false`,
`releaseApproval=false`, `runtimeWired=false` และ production NO-GO. Generator
current check, final canonical intake 23 verified/15 pass/8 not-proven และ
freeze manifest 9 files ผ่านใน author freeze; first RIL history และ final
closure อยู่ด้านล่าง. Public-key registration/rotation, deployed replay store,
endpoint/runtime/operator/deploy/release ยังเป็น external gates.
First different RIL พบ `C0/H0/M1/L0`: composition test ถูกใส่ verdict ทั้งที่
ไม่มี review report และ machine evidence ยังไม่ bind producer verifier/replay.
Test-only RED ผ่าน 4/6; remediation แยก test evidence ออกจาก reviewed checkpoint,
ลบ empty report/self-verdict, bind exact Identity verifier+replay test digests และ
เพิ่ม drift rejection จน generator GREEN 6/6. Different closure RIL bind exact
nine-file manifest และผ่าน final `C0/H0/M0/L0`.

**Identity callback browser-binding checkpoint (2026-08-11):** Academy เพิ่ม
browser secret แยกจาก `state` ใน local transaction boundary. Begin คืน raw
32-byte opaque binding ให้ server caller แยกจาก authorization request และ store
เก็บเฉพาะ SHA-256 digest. Memory consume เทียบแล้ว delete ใน synchronous no-await
operation เดียว; file consume ทำ compare-before-delete ภายใต้ exclusive lock.
Binding ผิดหรือสั้นคืน `browser_mismatch`, ไม่เรียก signer/exchange และไม่กิน
transaction ของ browser ที่เริ่ม flow. Local file schema ขยับ
เป็น v2; v1 และ digest เสีย fail closed โดยไม่ rewrite. Initial TDD RED ล้ม
4/21 ก่อน GREEN 21/21 และ expanded focused 23/23. First different RIL พบ
`C0/H0/M2/L0`: concrete stores ยังรับ surplus/raw caller fields, digest alias และ
state ซ้ำที่ consume ได้สองครั้งหลัง restart. Remediation RED 23 ผ่าน/6 ล้ม;
exact own-data projection, canonical digest re-encode และ lock-held duplicate-state
rejection ปิดเป็น GREEN 29/29. Identity regression ผ่าน 328/328, full unit ผ่าน
93 files/1018 tests, Identity producer authorization 30/30 และ full lint/all
TypeScript configs ผ่านโดยมี generated warning เดิม 1 จุด. หลักฐานอยู่ที่
[`reports/reviews/academy-identity-callback-browser-binding-local-checkpoint-2026-08-11.md`](../reports/reviews/academy-identity-callback-browser-binding-local-checkpoint-2026-08-11.md).
Different independent closure RIL ปิด implementation เป็น `C0/H0/M0/L1` และชี้
เฉพาะคำอธิบาย lock ของ memory/file store ที่กว้างกว่าสource; แก้ wording แล้ว
text-only recheck ผ่าน final `C0/H0/M0/L0`. Slice นี้ไม่แตะ route/cookie/session/
registry/Wrangler/DB/runtime และไม่ promote `callback.login-csrf`; canonical
conformance คง 15/23 (`65.2%`), production readiness ประมาณ 20% และ production
NO-GO คงเดิมจน cookie/Origin/Fetch Metadata/durable runtime/browser/deploy/release
evidence พร้อม.

**Identity code-exchange result verifier checkpoint (2026-08-11):** Academy
เพิ่ม strict local boundary ก่อน callback ใช้ผลจาก Identity Control. Verifier
รับเฉพาะ exact seven-field result + two-field activation, snapshot own data
descriptor ครั้งเดียว, bind issuer/audience/service/nonce กับ server transaction และคืน
fresh projection แทน object ของ adapter. Missing-module RED หยุดก่อน collection;
self-audit RED เพิ่มอีกสองรอบเพื่อปิด malformed expectation และ binding field
classification. First different RIL พบ `C0/H0/M1/L1`: verifier ยอมรับ foreign
issuer และ report นับ reader units คลาดหนึ่ง. Issuer RED ล้ม 2/39; remediation
เพิ่ม caller-provided `expectedIssuer` ลง exact expectation และ server transaction
โดยไม่ hardcode/infer production issuer. Final focused ผ่าน 44/44, Identity
regression 317/317, full unit final bytes 93 files/1007 tests, producer 44/44
และ full lint/all TypeScript configs ผ่านโดยมี generated warning เดิม 1 จุด.
หลักฐานอยู่ที่
[`reports/reviews/academy-identity-code-exchange-result-verifier-local-checkpoint-2026-08-11.md`](../reports/reviews/academy-identity-code-exchange-result-verifier-local-checkpoint-2026-08-11.md).
Different independent closure RIL bind manifest 7/7, rerun focused 44/44 กับ
producer 44/44 และผ่าน final `C0/H0/M0/L0`; final bookkeeping reader lint ได้
107 units / 0 findings. Canonical conformance คง 15/23 (`65.2%`) เพราะ
`exchange.result-binding` ผ่านอยู่ก่อนแล้ว; production readiness ไม่เพิ่ม.
Endpoint/key/rotation/replay store/strict HTTP operation/durable callback และ
activation transaction/operator/deploy/release ยังเป็น external gates โดย
`enabled=false`, `releaseApproval=false`, `runtimeWired=false` และ production
NO-GO คงเดิม.

**Identity code-exchange JSON operation checkpoint (2026-08-11):** Academy เพิ่ม
pure local operation ที่ snapshot exact five-field producer request, ส่ง fresh
projection ให้ injected response transport, ส่ง `Response` ต่อให้ accepted strict
JSON reader และคืน parsed `unknown` เฉพาะผล reader ที่สำเร็จ. Module จับ method ของ
สอง port ครั้งเดียว, รักษา receiver และรวม transport/reader/thenable failures เป็น
fixed detail-free error. Missing-module RED หยุดก่อน collection; focused ผ่าน
17/17, Academy Identity ผ่าน 22 files/345 tests, full unit ผ่าน 94 files/1,035
tests, Identity producer authorization+assertion ผ่าน 38/38 และ full lint/all
TypeScript configs ผ่านโดยมี generated warning เดิม 1 จุด. หลักฐานอยู่ที่
[`reports/reviews/academy-identity-code-exchange-json-operation-local-checkpoint-2026-08-11.md`](../reports/reviews/academy-identity-code-exchange-json-operation-local-checkpoint-2026-08-11.md).
Different independent RIL bind manifest, rerun focused 17/17, Identity 345/345,
producer 38/38, proportional static/security/reader gates และผ่าน final
`C0/H0/M0/L0`. Slice นี้ไม่เลือก endpoint, credential, HTTP
method/status/deadline, runtime import หรือ deploy policy; canonical conformance
คง 15/23 (`65.2%`), readiness ไม่เพิ่ม, registry/runtime disabled และ production
NO-GO คงเดิม.

**Identity code-exchange response transport checkpoint (2026-08-11):** Academy
เพิ่ม pure injected HTTP boundary สำหรับ exact `/v1/code/exchange`: canonical
HTTPS endpoint, fresh five-field JSON body, POST + JSON headers, omitted ambient
credentials, redirect refusal, cache bypass, exact status 200 และ response
`no-store`. Shared request projector เดียวกันป้องกัน JSON operation กับ transport
validation drift. Private deadline สูงสุด 5 วินาทีปิดงานได้แม้ fetch ไม่ร่วมมือ
และ cancel late response. Missing-module RED หยุดก่อน collection; first GREEN
41/41. Abort mutate-then-throw self-audit RED ล้ม 1 selected case ก่อน guard จะทำ
targeted GREEN. Different independent RIL แรกคืน `C0/H0/M1/L0` เพราะ controller/
timer setup อยู่นอก bounded `try` และ timer cleanup อาจปล่อย platform error เดิม.
Adversarial RED ล้ม 4/30 โดย 26 เคสเดิมผ่าน; remediation ย้าย deadline transaction
เข้า bounded path, track armed timer, guard cleanup และ cancel response เมื่อ cleanup
ไม่ยืนยัน. GREEN ผ่าน transport 30/30; final seam transport+JSON+result verifier
ผ่าน 73/73, Academy Identity 23 files/375 tests, full unit 95 files/1,065 tests,
Identity producer API+authorization+assertion 59/59 และ full lint/all TypeScript
configs ผ่านโดยมี generated warning เดิม 1 จุด. หลักฐานอยู่ที่
[`reports/reviews/academy-identity-code-exchange-response-transport-local-checkpoint-2026-08-11.md`](../reports/reviews/academy-identity-code-exchange-response-transport-local-checkpoint-2026-08-11.md).
Different independent re-review bind remediation manifest, rerun focused 73/73,
Identity 375/375, producer 59/59 และ proportional static/security/reader gates
แล้วผ่าน final `C0/H0/M0/L0`. Module รับ endpoint/fetch เป็น injected capability
และไม่มี production import/network call; exact approved host,
key/rotation/replay/runtime/deploy/release ยังเป็น external gates. Conformance คง
15/23 (`65.2%`), readiness ไม่เพิ่ม และ production NO-GO คงเดิม.

**Identity code-exchange transport composition checkpoint (2026-08-11):**
Academy เพิ่ม pure factory ที่ capture endpoint/timeout/fetch port/strict reader
ครั้งเดียว แล้ว compose response transport กับ JSON operation ที่ผ่าน RIL แล้ว.
Module ไม่ duplicate HTTP/request/parser policy และคืน parsed value เป็น
`unknown` จนกว่า transaction-bound result verifier จะตรวจ issuer/audience/
service/nonce. Missing-module RED หยุดก่อน collection; GREEN ผ่าน focused 7/7,
combined response+JSON+result seam 80/80, Academy Identity 24 files/382 tests,
full unit 96 files/1,072 tests, Identity producer API+authorization+assertion
59/59 และ full lint/all TypeScript configs ผ่านโดยมี generated warning เดิม 1
จุด. หลักฐานอยู่ที่
[`reports/reviews/academy-identity-code-exchange-transport-local-checkpoint-2026-08-11.md`](../reports/reviews/academy-identity-code-exchange-transport-local-checkpoint-2026-08-11.md).
Different independent RIL bind author freeze, rerun focused 7/7, seam 80/80,
Identity 382/382, producer 59/59 และ proportional static/security/reader gates
แล้วผ่าน final `C0/H0/M0/L0`. Module ไม่มี runtime import หรือ production value;
exact endpoint, signer/key rotation, replay store, strict
reader values, durable callback/activation, operator/deploy/release ยังเป็น gates
แยก. Conformance คง 15/23 (`65.2%`), readiness ไม่เพิ่ม และ production NO-GO.

**Identity code-exchange least-capability adapter checkpoint (2026-08-11):**
Academy เพิ่ม pure bridge จาก accepted composed JSON operation ไปยัง
`IdentityCodeExchangePort` ที่มีเฉพาะ `exchangeCode`; callback transaction
เปลี่ยนจาก broad `IdentityAdapter` มา depend on port แคบ และ remote result ยังคง
เป็น `unknown` จน transaction verifier ตรวจ issuer/audience/service/nonce/shape.
Missing-module RED หยุดก่อน collection; GREEN ผ่าน focused 7/7, callback/code-
exchange seam 104/104, Academy Identity 25 files/389 tests, full unit 97 files/
1,079 tests, Identity producer API+authorization+assertion 59/59 และ full
lint/all TypeScript configs ผ่านโดยมี generated warning เดิม 1 จุด. หลักฐานอยู่ที่
[`reports/reviews/academy-identity-code-exchange-adapter-local-checkpoint-2026-08-11.md`](../reports/reviews/academy-identity-code-exchange-adapter-local-checkpoint-2026-08-11.md).
Different independent RIL แรกคืน `C0/H0/M0/L1`: code/security ผ่าน แต่ report ใช้
คำว่าไม่มี network authority กว้างเกินจริง เพราะ `exchangeCode` เรียก injected
network operation ได้. Text-only remediation แยก request-scoped exchange
capability ออกจาก raw fetch/endpoint/configuration surface แล้ว; source/test ไม่
เปลี่ยน. Different closure re-review bind manifest ใหม่, rerun focused 7/7,
seam 104/104, Academy Identity 389/389, producer 59/59 และ proportional
static/security/reader gates แล้วผ่าน final `C0/H0/M0/L0`. Slice นี้ไม่มี runtime import,
endpoint/credential, registry, route, DB หรือ deploy value; conformance คง 15/23
(`65.2%`), readiness ไม่เพิ่ม, registry/runtime disabled และ production NO-GO.

**Identity final code-exchange port composition checkpoint (2026-08-11):**
Academy เพิ่ม pure final factory ที่ compose accepted response/JSON transport
กับ least-capability adapter แล้วคืน `IdentityCodeExchangePort` โดยตรง. Port มี
request-scoped exchange authority แต่ไม่เปิด raw fetch, endpoint/configuration,
authorization-start, registry หรือ production-admission surface. Missing-module
RED หยุดก่อน collection; GREEN ผ่าน focused 8/8, callback/code-exchange seam
112/112, Academy Identity 26 files/397 tests, full unit 98 files/1,087 tests,
Identity producer API+authorization+assertion 59/59 และ full lint/all TypeScript
configs ผ่านโดยมี generated warning เดิม 1 จุด. หลักฐานอยู่ที่
[`reports/reviews/academy-identity-code-exchange-port-local-checkpoint-2026-08-11.md`](../reports/reviews/academy-identity-code-exchange-port-local-checkpoint-2026-08-11.md).
Different independent RIL bind manifest, rerun focused 8/8, seam 112/112,
Academy Identity 397/397, producer 59/59 และ proportional
static/security/reader gates แล้วผ่าน final `C0/H0/M0/L0`. Slice นี้ไม่เลือก endpoint,
credential, strict-reader values, env, route, registry, DB หรือ deploy value;
conformance คง 15/23 (`65.2%`), readiness ไม่เพิ่ม, registry/runtime disabled
และ production NO-GO.

**Identity code-exchange runtime config projection checkpoint (2026-08-11):**
Academy เพิ่ม pure data-only projector สำหรับ exact scalar config ของ future
server composition. Input ต้องมี own enumerable data fields ห้าตัวตรงชุด,
endpoint/client-assertion audience/timeout ต้อง absent ทั้งชุดหรือ valid ทั้งชุด,
และ projector จะคืน usable values เฉพาะเมื่อทั้ง `enabled` กับ
`releaseApproval` เป็น `true`; blocked result ไม่คืน endpoint หรือ authority
ใด ๆ. Endpoint/timeout predicates ถูกแยกเป็น identity-local scalar policy เดียว
ที่ response transport reuse จึงไม่ duplicate validation. Missing-module RED
หยุดก่อน collection; GREEN ผ่าน focused config+transport 53/53, Identity 27
files/420 tests, full unit 99 files/1,110 tests, producer 59/59 และ full
lint/all TypeScript configs โดยมี generated warning เดิม 1 จุด. หลักฐานอยู่ที่
[`reports/reviews/academy-identity-code-exchange-runtime-config-local-checkpoint-2026-08-11.md`](../reports/reviews/academy-identity-code-exchange-runtime-config-local-checkpoint-2026-08-11.md).
คำว่า `admitted` ใน module นี้เป็น local scalar classification เท่านั้น; gate
provenance, env schema, fetch/reader/signer capabilities, runtime import, deploy
และ production admission ยังอยู่นอก slice. Canonical state คง
`enabled=false`, `releaseApproval=false`, `runtimeWired=false` และ production
NO-GO. Different independent RIL แรกคืน `C0/H0/M1/L1`: empty trailing `?`/`#`
ผ่าน URL checks เดิมเป็น noncanonical aliases และ report reader count stale.
Remediation RED ล้ม 4 cases ขณะที่เดิมผ่าน 53; shared predicate ตอนนี้ require
raw value เท่ากับ canonical origin+exact path ทำให้ aliases หยุดก่อน fetch
method access. GREEN ผ่าน focused 57/57, Identity 424/424, full unit 1,114/1,114,
producer 59/59 และ full lint/type. Different reviewer bind manifest 8/8,
rerun focused 57/57, Identity
424/424, producer 59/59 และ proportional static/security/reader gates แล้วผ่าน
final `C0/H0/M0/L0`; source/test คง frozen semantic set เดิม.

**Identity final code-exchange port admission gate checkpoint (2026-08-11):**
Academy เปลี่ยน canonical final factory เดิมให้รับ exact runtime config แล้วเรียก
accepted projector ก่อนอ่าน injected fetch/strict-reader capabilities. Factory
สร้าง least-capability port เฉพาะ `admitted`; ทั้งสาม blocked gate combinations
และ malformed config คืน fixed construction failure โดยไม่อ่าน nested method.
ไม่มี factory คู่ขนาน, runtime import, env/registry read หรือ production value.
Test-only RED ล้ม 5/8; GREEN ผ่าน focused 10/10, code-exchange/callback seam
141/141, Academy Identity 426/426, full unit 1,116/1,116, producer 59/59 และ full
lint/all TypeScript configs โดยมี generated warning เดิม 1 จุด. หลักฐานอยู่ที่
[`reports/reviews/academy-identity-code-exchange-port-admission-gate-local-checkpoint-2026-08-11.md`](../reports/reviews/academy-identity-code-exchange-port-admission-gate-local-checkpoint-2026-08-11.md).
Different independent RIL bind manifest 5/5, rerun focused 10/10, seam 141/141,
Academy Identity 426/426, producer 59/59 และ proportional static/security/reader
gates แล้วผ่าน final `C0/H0/M0/L0`. Slice ยังคง local/unwired; gate provenance,
signer coherence, endpoint ownership, strict-reader values, durable transactions,
operators, deploy และ release authorization เป็น external gates. Conformance คง
15/23 (`65.2%`), readiness ไม่เพิ่ม, registry/runtime disabled และ production
NO-GO.

**Identity profile activation store local checkpoint (2026-08-11):** Academy
เพิ่ม durable boundary สำหรับส่วนที่ product เป็นเจ้าของหลังผล code exchange
ผ่าน verifier แล้ว: exact profile projection กับ activation copy ถูก commit ผ่าน
RPC เดียวและ PostgreSQL statement transaction เดียว. Migration 0024 upsert
ผู้ใช้ด้วย canonical `(issuer, subject)` และ reuse revision-aware activation
sync; function body ไม่มี entitlement หรือ staff-role mutation. Test-only RED
หยุดก่อน collection เพราะ module ยังไม่มี; GREEN ปัจจุบันผ่าน focused 21/21,
local PostgreSQL integration 11/11, Academy Identity 29 files/448 tests, full unit
100 files/1,137 tests, producer 59/59 และ full lint/all TypeScript configs โดยมี
generated warning เดิม 1 จุด. หลักฐานอยู่ที่
[`reports/reviews/academy-identity-profile-activation-store-local-checkpoint-2026-08-11.md`](../reports/reviews/academy-identity-profile-activation-store-local-checkpoint-2026-08-11.md).
First different independent RIL คืน `C0/H1/M0/L0`: stale lower activation
revision ยังอัปเดต profile และคืน success ได้เพราะ migration ไม่ตรวจผล durable
หลัง revision-aware sync. Remediation RED ผ่าน 10 และล้ม 1 stale case; migration
จึง require durable status/revision ให้ตรง input ภายใน statement transaction,
ยอม exact duplicate และ rollback profile เมื่อ stale/conflict. GREEN local
PostgreSQL integration ปัจจุบันผ่าน 11/11. Different independent closure RIL
bind remediated manifest 7/7, rerun focused 21/21, Academy Identity+callback
450/450, producer 59/59 กับ proportional static/security/reader gates และผ่าน
final `C0/H0/M0/L0`. Checkpoint ยังไม่ promote
`academy.activation-profile-only`: callback/session transaction ไม่มี runtime
import, existing `academy_runtime` ACL ที่กว้างกว่า function นี้ยังต้อง review
ตอน production, conformance คง 15/23, registry/runtime disabled และ production
NO-GO.

**Identity Control profile-activation conformance refresh (2026-08-11):** หลัง
profile-activation store checkpoint ผ่าน different RIL แล้ว deterministic
generator bind exact report+manifest digests และ promote เฉพาะ
`academy.activation-profile-only`. TDD RED ผ่าน 6/7 และล้ม scenario ที่ยังเป็น
`not_proven`; GREEN ผ่าน 7/7 พร้อม exact 16 pass/7 not-proven summary และยืนยัน
`enabled=false`, `releaseApproval=false`, `runtimeWired=false`. Generator
write/current, canonical intake 23/23 และ manifest exact 8 content files ผ่านแล้ว.
Different independent RIL rebind authority, ยืนยัน delta เฉพาะ scenario เดียว,
rerun focused/canonical/static/security/reader gates และผ่าน final
`C0/H0/M0/L0`. Production readiness ไม่เพิ่ม และ callback cookie provenance,
authenticated exchange, durable runtime transaction, operator/deploy/release
gates ยังคงเป็น NO-GO.

**Identity registered authorization redirect local checkpoint (2026-08-11):**
Academy เปลี่ยน authorization-start boundary ให้รับ exact
`{client, redirectUris}` จาก future trusted server composition. Selected
callback ต้องตรงกับ canonical registered entry แบบ byte-exact ก่อน
สร้าง PKCE/browser binding หรือเขียน transaction. List จำกัด 16
entries, snapshot own data descriptors, และ reject duplicate/sparse/accessor/
symbol/hostile/overbound/query/fragment/non-canonical input ก่อน mutation.
TDD RED ผ่านเดิม 17 แล้วล้ม valid registration; intermediate RED จับ
empty `?` alias; final GREEN ผ่าน focused 19/19, affected seam 48/48,
Academy Identity 452/452, full unit 1,139/1,139, producer 51/51 และ full
lint/all TypeScript configs. หลักฐานอยู่ที่
[`reports/reviews/academy-identity-authorization-registered-redirect-local-checkpoint-2026-08-11.md`](../reports/reviews/academy-identity-authorization-registered-redirect-local-checkpoint-2026-08-11.md).
Different independent RIL bind manifest 8/8, rerun focused 19/19, affected seam
48/48, Academy Identity 452/452, producer 51/51 และ proportional
static/security/reader gates แล้วผ่าน final `C0/H0/M0/L0`. Source ไม่มี
runtime caller, conformance คง 16/23, readiness ไม่เพิ่ม และ production
NO-GO.

**Shared strict JSON response boundary checkpoint (2026-08-10):** Academy รับช่วง
existing untracked BYOB + duplicate-safe parser จาก concurrent client work มา
audit และเพิ่ม standalone adversarial suite โดยไม่ stage consumer/UI files. RED
ผ่าน 18/20 และล้มตรง caller ขอ allocation เกิน 1 MiB กับ depth 65 ยังถูกยอมรับ.
Helper ปัจจุบันมี hard ceilings 1 MiB/depth 64 และ reject/cancel ก่อน read;
GREEN รอบแรกผ่าน focused 20/20, importer clients 210/210 และ full unit 871/871.
Full lint/typechecks ผ่านหลังแก้ test fixture ให้ copy bytes ลง owned ArrayBuffer;
source behavior ไม่เปลี่ยนจากการแก้ type นั้น. หลักฐานอยู่ที่
[`reports/reviews/academy-strict-json-response-local-checkpoint-2026-08-10.md`](../reports/reviews/academy-strict-json-response-local-checkpoint-2026-08-10.md).
Independent RIL แรกพบ `C0/H0/M1/L1`: stateful option getter bypass hard cap หรือ
throw หลัง lock reader ได้ และ report ใช้คำว่า tracked/committed เร็วเกินจริง.
Test-only RED ใหม่ผ่าน 20/22; remediation snapshot byte/depth/signal/timeout
ครั้งเดียวก่อน body access/allocation, allocate ก่อน acquire reader และแก้ wording.
GREEN ผ่าน focused 22/22, current importers 212/212 และ full unit 877/877.
Closure RIL รอบสองพบ `C0/H0/M1/L0`: Proxy(native AbortSignal) ยัง throw จาก
state/listener หลัง acquire reader, leak error detail และทิ้ง body lock ได้.
Signal-boundary RED ผ่าน 22/25; remediation capture/preflight signal ก่อน body,
ใช้ internal deadline controller และแยก deadline cleanup จาก reader release.
GREEN รอบนั้นผ่าน focused 25/25, importers 215/215 และ full unit 880/880.
Closure RIL รอบสามพบ `C0/H0/M1/L0`: one-byte fragmentation ทำให้ BYOB view
allocation สะสมแบบกำลังสองและ microtask chain วิ่งข้าม nominal timer ได้.
Deterministic RED ผ่าน 25/26; remediation ใช้ scratch buffer ไม่เกิน 256 KiB+1,
reuse backing buffer และหยุดก่อน read ครั้งที่ 129. GREEN ปัจจุบันผ่าน focused
26/26, importers 216/216 และ full unit 85 files/877 tests; ยังรอ different
independent closure review ที่ bind manifest ใหม่. Review รอบสี่พบ
`C0/H0/M1/L0`: hostile add wrapper attach listener แล้ว throw ก่อน cleanup flag
ทำให้ internal deadline listener ค้างได้. Listener RED ผ่าน 26/27; first fix
เผย fail-closed regression 23/27 ก่อน final implementation จะ require native
signal method identities, ใช้ module-captured EventTarget intrinsics และ arm
cleanup ก่อน add. GREEN ปัจจุบันผ่าน focused 27/27, importers 217/217 และ full
unit 85 files/878 tests. Review รอบห้าพบ `C0/H0/M1/L0`: read loop ยัง register
internal deadline listener แบบ dynamic จึง leak ได้เมื่อ prototype ถูก wrap ก่อน
module load. Fresh-module RED ผ่าน 27/28 และพบ listener ค้างสองตัว. Final design
ตัด internal listener ออกทั้งหมด โดย race BYOB read กับ private deadline promise;
external signal ยังใช้ native transaction เดิม. GREEN ปัจจุบันผ่าน focused
28/28, importers 218/218 และ full unit 85 files/879 tests; ยังรอ different
closure review ใหม่. Review รอบหกผ่าน code/security `C0/H0/M0` แต่คืน `L1`
เพราะ report ระบุสาเหตุ timer ไม่ตรง source; wording แก้เป็น scheduled callback
ถูก microtask starvation แล้ว. Different independent text-only closure bind
manifest ใหม่, rerun focused 28/28 และคืน final `C0/H0/M0/L0`. Helper เป็น
raw-response primitive เท่านั้น; lifecycle network listener/method/status/endpoint,
request credentials และ runtime authorization ยังเป็นงานถัดไป.

**Identity session-cookie local checkpoint (2026-08-09):** future
`academy_session` มี raw-header parser ที่รับเฉพาะ canonical name แบบ exact-one,
reject duplicate โดยไม่พึ่ง order และจำกัด opaque ID ที่ URL-safe 32-160 ตัวอักษร.
Creation/deletion ใช้ host-only `Path=/`, `HttpOnly`, `SameSite=Lax` และ `Secure`
policy เดียวกัน; deletion เป็น deterministic `Max-Age=0`. Focused 6/6, full unit
484/484, lint/typecheck/build ผ่าน. Boundary นี้ยัง unit-only/unwired; production
browser proof และ runtime wiring ยังเป็น gate แยก. หลักฐานอยู่ที่
[`reports/reviews/academy-identity-session-cookie-local-checkpoint-2026-08-09.md`](../reports/reviews/academy-identity-session-cookie-local-checkpoint-2026-08-09.md).

**HTTP security-header local checkpoint (2026-08-09):** `next.config.ts` ส่ง
report-only CSP สำหรับ observation, HSTS, nosniff, `X-Frame-Options: DENY`,
referrer policy, permissions policy และ
DNS-prefetch control แบบ catch-all แล้ว. Unit 481/481, lint/typecheck/build ผ่าน และ
local production response ของทั้ง page/API มี header ครบ. หลักฐานอยู่ที่
[`reports/reviews/academy-security-headers-local-checkpoint-2026-08-09.md`](../reports/reviews/academy-security-headers-local-checkpoint-2026-08-09.md).
CSP ยังอยู่ใน observation mode; การ enforce ต้องรอ browser evidence บน deployed
topology และ external media ที่อนุมัติแล้ว.

**Production dependency-audit local checkpoint (2026-08-09):** local production tree
ย้าย transitive `nanoid` เป็น 3.3.17, PostCSS เป็น 8.5.26 และ sharp เป็น 0.35.2
ผ่าน npm overrides โดย Next ยังเป็น 15.5.22. `npm audit --omit=dev
--audit-level=high` จาก RED 4 High เป็น 0 vulnerabilities; full unit 484/484,
lint/typecheck/build ผ่านและ SBOM ตรง lockfile. Node 24.19.0 runtime optimizer
รับ real PNG แล้วคืน 200 PNG 64x64, reject malformed/unapproved source เป็น 400,
และ OpenNext/Cloudflare build ผ่าน. อย่างไรก็ตาม sharp 0.35.2 ยังอยู่นอก optional
range `^0.34.3` ของทั้ง Next 15.5.22 และ 15.5.23 จึงเป็น release-blocked
compatibility exception; local evidence ไม่ใช่ upstream support. Dev-inclusive audit
จาก 2 High + 2 Moderate เป็น 0 หลังยก Wrangler เป็น 4.120.0, Miniflare เป็น
5.20260801.1-alpha, `undici` เป็น 7.29.0 และ `js-yaml` เป็น 4.3.1; Node 24
OpenNext build ผ่านและ dependency tree ไม่มี invalid/peer error. Repo/director ยังไม่มี
canonical CI workflow จึงไม่ได้สร้าง gate ใหม่. หลักฐานอยู่ที่
[`reports/reviews/academy-production-dependency-audit-local-checkpoint-2026-08-09.md`](../reports/reviews/academy-production-dependency-audit-local-checkpoint-2026-08-09.md).

**Public-to-learner feature-wave integration checkpoint (2026-08-12):** งาน public
catalogue/syllabus, learner dashboard/progress/attempt/simulation/skill map,
localized chrome/theme และ retention boundary ถูกรวมเป็น journey เดียวแล้ว. Response
ของ surface ที่เปลี่ยนใช้ bounded duplicate-safe JSON และ exact projection; return path
ใช้ canonical same-origin policy จุดเดียว. ผู้เรียนไทยเห็น overview, roadmap, recovery
และ reset flow เป็นไทยทั้ง desktop/mobile โดย roadmap ไม่มี horizontal overflow.
Node 24 full unit ผ่าน 1,184/1,184, production Next build ผ่าน 30 routes และ public
Chromium/Pixel 5 ผ่าน 34/34. Different-agent code/debt review ผ่าน
`C0/H0/M0/L0`; security และ UX behavior ผ่านโดยเหลือเฉพาะ Low ในรายงาน และ
different text/authority recheck หลังแก้ถ้อยคำผ่าน final `C0/H0/M0/L0`.
Checkpoint นี้ปิด local แล้ว แต่ยังห้าม deploy, migrate DB, run retention หรือเปิด
Identity/runtime จนกว่า production gates แยกจะปิด. หลักฐานอยู่ที่
[`reports/reviews/academy-public-learner-feature-wave-integration-checkpoint-20260812.md`](../reports/reviews/academy-public-learner-feature-wave-integration-checkpoint-20260812.md).

**Public syllabus checkpoint (2026-08-09):** ผู้เยี่ยมชมดูผลลัพธ์, ลำดับบท,
prerequisite, เวลาประมาณการ และ required checkpoint ของ `basic-os-linux` ได้ก่อนมี
บัญชี โดยไม่ส่ง lesson body, ข้อสอบ, เฉลย, private-media path หรือ learning record
ไป browser. `publicAvailability` เป็น default-deny ใน portable course contract;
`content-formats-demo` จึงถูกตัดจาก catalog, direct public route, sitemap และ OG
params. หน้า public ตรวจสถานะบัญชีหลัง hydrate: ผู้ที่ยังไม่ลงชื่อเข้าใช้หรือ
ตรวจไม่ได้เห็น syllabus โดยไม่เรียก progress; ผู้ที่ยืนยัน session แล้วจึงโหลด
overview/progress เดิม. การทำงานนี้เป็น preview surface เท่านั้น ไม่ได้เปิดบัญชี,
บทเรียน หรือประกาศว่าเป็น catalog ที่พร้อมขาย. หลักฐานอยู่ที่
[`reports/reviews/public-course-syllabus-checkpoint-2026-08-09.md`](../reports/reviews/public-course-syllabus-checkpoint-2026-08-09.md).

**Public course locale-continuity checkpoint (2026-08-09):** `?lang=en|th`
บน public course เป็น source of truth ที่ตรงกันสำหรับ course content, chrome,
`html[lang]`, cookie และ metadata หลัง hydrate. ผู้ที่มี locale เดิมเปิด bare
course URL จะถูก canonicalize เฉพาะภาษาที่คอร์สนั้นเสิร์ฟได้จริง; query/hash เดิม
ไม่หาย และ locale ที่คอร์สไม่รองรับจะ normalize ไป locale ที่ serve จริง. หน้าร้าน
catalog ยังคง static แต่หน้า course ที่ใช้ `?lang` ไม่ใช่ prerendered query variant;
ข้อแก้ไขและ static-evidence control อยู่ใน
`memory/feedback_static_evidence_and_generated_manifest_hygiene.md`. Signed-out flow
ไม่เรียก progress. หลักฐานและ RIL อยู่ที่
[`reports/reviews/public-course-locale-continuity-checkpoint-2026-08-09.md`](../reports/reviews/public-course-locale-continuity-checkpoint-2026-08-09.md).

**Public course catalog locale checkpoint (2026-08-09):** `/courses` เป็น
static catalog ที่แสดงเฉพาะ course preview ซึ่ง opt-in ผ่าน
`publicAvailability`; catalog card ใช้ DTO allowlist และพา locale ไปหน้าคอร์สโดย
ไม่ส่ง lesson, เฉลย, media, cue, skill weight หรือ learner data ไป browser. ทุก
locale ที่ course ประกาศต้องมี `course.json` copy ที่ไม่เป็น null ก่อน registry
จะผ่าน validation จึงไม่มี card ที่โฆษณาภาษาแล้วพาไป 404. Thai/English catalog,
chrome, landmark และ mobile language control ตรงกันหลัง hydrate; invalid/duplicate
locale normalize เป็นค่าเดียวโดยเก็บ query/hash ที่ไม่เกี่ยวข้องไว้. ยังเป็น preview
surface ไม่ได้เปิดบัญชี บทเรียน หรือประกาศ catalog พร้อมขาย. หลักฐานและ RIL อยู่ที่
[`reports/reviews/public-course-catalog-locale-checkpoint-2026-08-09.md`](../reports/reviews/public-course-catalog-locale-checkpoint-2026-08-09.md).

**Public course localized share-image checkpoint (2026-08-09):** metadata ของ
public course ใช้ภาพ `/courses/{slug}/share/{locale}` ตาม locale ที่ serve จริง;
ทั้ง PNG ภาษาอังกฤษและไทย prerender จาก public course DTO เท่านั้น พร้อมฟอนต์ไทยที่
เก็บใน repo พร้อม license/provenance จึงไม่มีการดึง font หรือ content ระหว่าง runtime.
Route สร้าง static params เฉพาะ public course และ locale ที่ประกาศ, ปฏิเสธ slug/locale
อื่นเป็น `404`, และ middleware ไม่ส่ง invalid share URL ไปหน้า sign-in. Build
verification ตรวจ Next manifest, Cloudflare static cache และ pixel bounds ของ
brand/title/footer ทั้งสองภาษา. นี่ทำให้ **ภาพแชร์** static; ไม่ได้เปลี่ยนสถานะของ
หน้า course ที่ใช้ `?lang`. หลักฐานและ RIL อยู่ที่
[`reports/reviews/public-course-share-image-checkpoint-2026-08-09.md`](../reports/reviews/public-course-share-image-checkpoint-2026-08-09.md).

**Public course canonical locale checkpoint (2026-08-09):** หน้า preview ใช้
URL หลัก `/courses/{slug}/{locale}` และ prerender เฉพาะ public course กับ locale
ที่ประกาศจริงเท่านั้น. HTML static, chrome ตั้งต้น, canonical/hreflang, JSON-LD และ
share image ตรงกันทั้ง EN/TH ตั้งแต่ก่อน hydration; legacy `?lang=` redirect แบบ
ถาวรไป URL หลักโดยเก็บ query/hash ที่ไม่ใช่ภาษา. Public route ใช้ DTO allowlist และ
ไม่เรียก progress เมื่อ signed-out; learner overview แยกไป `/learn` ที่ต้องผ่าน
session, activation และ course entitlement. Next และ OpenNext cache ตรวจจาก
content admission list แล้ว. รายละเอียดและ RIL อยู่ที่
[`reports/reviews/public-course-canonical-locale-checkpoint-2026-08-09.md`](../reports/reviews/public-course-canonical-locale-checkpoint-2026-08-09.md).

**Learner course skill-map checkpoint (2026-08-09):** ผู้เรียนที่ผ่าน session,
activation และ course entitlement เห็นแผนที่ความครอบคลุมตามหัวข้อบน `/learn` เท่านั้น.
แผนที่นับเฉพาะบทที่เรียนจบ, ไม่นับการข้าม, และบอกตรงๆ ว่าไม่ใช่คะแนนหรือหลักฐานการ
ประเมิน; ด่านที่ผ่านยังอยู่ใน Learning record แยกต่างหาก. API คืนเฉพาะค่าที่คำนวณแล้ว
และไม่ cache; public page/Flight ไม่ส่ง weights, media, cue, skill label หรือ map request.
EN/TH, loading, unavailable/retry, session expiry และ access loss มี state ที่แยกกัน.
หลักฐานและ RIL อยู่ที่
[`reports/reviews/learner-course-skill-map-checkpoint-2026-08-09.md`](../reports/reviews/learner-course-skill-map-checkpoint-2026-08-09.md).

Local skill-map client response checkpoint 2026-08-09 เปลี่ยน
`response.json()` ที่ไม่จำกัดเป็น shared bounded, duplicate-safe JSON boundary
พร้อม exact deep projection ใหม่ก่อนข้อมูลถึง chart. Wrapper/item ต้องมี keys
ตรงทั้งหมด, coverage ต้องไม่ว่าง, ID ไม่ซ้ำ, value เป็น integer 0-100 และผลลัพธ์
ไม่คืน object จาก response โดยตรง. AbortController เดียวครอบทั้ง fetch และ body;
401/403/non-success ยังใช้ state เดิมและไม่อ่าน body. Initial RIL
`C0/H0/M1/L0` พบว่า client รับ `notStarted=true` พร้อม positive value;
remediation บังคับ invariant ทางเดียวนี้ให้ value เป็นศูนย์ แต่ยังรับ
`notStarted=false,value=0` ที่เกิดจากการปัดเศษได้. RED ล้ม 1/34 แล้ว focused ผ่าน
34/34, relevant 42/42 และ full unit 687/687 บน Node 24.18.0; lint/typechecks,
Next/OpenNext builds, offline audits, dependency tree และ gitleaks ผ่าน. Independent
closure review ผ่าน C0/H0/M0/L0. Route, shared parser, UI, DB และ config ไม่ถูกแก้;
authenticated route/browser proof ยังเป็น gate แยก.
หลักฐานอยู่ที่
[`reports/reviews/academy-course-skill-map-client-response-validation-local-checkpoint-2026-08-09.md`](../reports/reviews/academy-course-skill-map-client-response-validation-local-checkpoint-2026-08-09.md).

**Learner dashboard data-boundary checkpoint (2026-08-09):** `/dashboard` ไม่ส่ง
course registry ผ่าน Flight อีกต่อไป. หลัง session, service activation และ
course entitlement เท่านั้น `GET /api/progress` จึงคืน DTO ของ dashboard ที่มีเพียง
roadmap/card copy และ global coverage weights; ไม่มี version, public availability,
skill รายบท, media, cue หรือ skill label. ทุก GET response เป็น `private, no-store`;
client reject DTO/progress ที่ malformed, duplicate หรือ entitlement list ไม่ตรงกันไป
state unavailable/retry แทนการบอกผิดว่าไม่มีคอร์ส. radar อธิบายชัดว่าเป็น lesson
coverage ไม่ใช่ proficiency. หลักฐานและ RIL อยู่ที่
[`reports/reviews/learner-dashboard-data-boundary-checkpoint-2026-08-09.md`](../reports/reviews/learner-dashboard-data-boundary-checkpoint-2026-08-09.md).

Local resume correctness checkpoint 2026-08-09 ทำให้ dashboard ส่ง
`record.lastNodeId` เข้า roadmap boundary และเลือกค่านั้นเฉพาะเมื่อ node ยังเป็น
`in-progress`; หาก completed, skipped, tested-out, locked, missing หรือไม่ส่งค่า จะ
fallback ตามลำดับเดิม. Equal `updatedAt` tie ยังไม่เปลี่ยนเพราะ record ไม่มี causal
sequence ที่รองรับ tie-break policy. Focused 20/20 และ full unit 488/488 ผ่าน;
หลักฐาน local อยู่ที่
[`reports/reviews/academy-dashboard-resume-last-node-local-checkpoint-2026-08-09.md`](../reports/reviews/academy-dashboard-resume-last-node-local-checkpoint-2026-08-09.md).

Local progress-client response checkpoint 2026-08-09 ปฏิเสธ learner record ที่
malformed หรือ slug ไม่ตรงกับคอร์สที่ร้องขอในทั้ง lesson load และ reset reconcile
ด้วย exact local schema projection ที่ตรวจ wrapper/record keys, nested arrays/maps
และไม่คืน object ที่ยังเป็นของ response; ผล fail-closed ยังเป็น
`unavailable`/`unknown` ตาม contract เดิม. Preliminary RIL `C0/H0/M2/L0` พบ
dependency กับ dirty `progress.ts` และ incomplete projection; remediation ตัด import
นั้นออกแล้ว โดยไม่แก้ `progress.ts`. Focused 19/19 และ full unit 499/499 ผ่าน;
independent re-review ยัง pending. หลักฐาน local อยู่ที่
[`reports/reviews/academy-progress-client-response-validation-local-checkpoint-2026-08-09.md`](../reports/reviews/academy-progress-client-response-validation-local-checkpoint-2026-08-09.md).

Local player-attempt storage checkpoint 2026-08-09 คง record schema `v1` แต่ key ใหม่
ใช้ private `k2` namespace กับ length-prefixed segments ที่ไม่ชนกันเมื่อ ID มี
delimiter หรือ lone surrogate. Loader จะ copy legacy ไป k2 เมื่อ record ผ่าน
deep validation และ ID ตรงทั้งคู่เท่านั้น; legacy ที่ invalid/mismatch จะคงอยู่และไม่
แจ้ง reset เพราะ ownership ของ raw key กำกวม. `latestAttempt` parse k2 ตาม exact
content, parse legacy จาก record, dedupe โดยเลือก k2 และเรียง tie ด้วย attemptId
code-unit ascending. Original RIL ได้ `C0/H0/M2/L0`; remediation RED ล้ม
9/17, focused GREEN 17/17, relevant 32/32 และ full unit 698/698 บน Node 24.18.0.
ไม่มี UI, route, DB, Identity, config หรือ deploy เปลี่ยน; final independent re-review
ผ่าน `C0/H0/M0/L0`. หลักฐานอยู่ที่
[`reports/reviews/academy-player-attempt-storage-scope-local-checkpoint-2026-08-09.md`](../reports/reviews/academy-player-attempt-storage-scope-local-checkpoint-2026-08-09.md).

Local unsubscribe-client response checkpoint 2026-08-09 แสดงสถานะสำเร็จเดิม
เฉพาะเมื่อ same-origin request ได้ทั้ง HTTP success และ JSON แบบ exact one-key
`{ok:true}`. HTTP 2xx ที่ body เป็น explicit failure, wrong type, extra key, null,
array, malformed หรือว่างจะใช้ failure/retry state เดิมแทน โดยไม่เปลี่ยน request,
API route, anti-enumeration contract, bearer-token fragment, copy หรือ layout.
Behavior RED ล้ม 7/10 และ initial GREEN ผ่าน 10/10. Preliminary RIL
`C0/H0/M1/L0` พบว่า `response.json()` collapse duplicate key ก่อนตรวจ one-key;
remediation จึง require `application/json`, อ่าน raw stream ไม่เกิน 128 bytes,
decode UTF-8 แบบ fatal และยอมรับเฉพาะ sole raw envelope โดย duplicate ทั้งสองลำดับ
ถูกปฏิเสธและ valid JSON whitespace ยังผ่าน. Remediation RED ล้ม 3/15, GREEN ผ่าน
15/15. Re-review พบ L-01 ว่า `TextDecoder` default กลืน UTF-8 BOM ก่อน raw match;
เพิ่ม `ignoreBOM:true` ให้ BOM คงอยู่และถูก regex ปฏิเสธ, โดย BOM RED ล้ม 1/16
และ GREEN ผ่าน 16/16. Unsubscribe/security regression ผ่าน 51/51 และ full unit
515/515; Node 24 lint/typechecks, Next/OpenNext build และ audits ผ่าน. นี่เป็น local
client-contract evidence; deployed browser/DB proof ยังอยู่ใน gate แยก และ
independent closure review ยัง pending. หลักฐานอยู่ที่
[`reports/reviews/academy-unsubscribe-client-response-validation-local-checkpoint-2026-08-09.md`](../reports/reviews/academy-unsubscribe-client-response-validation-local-checkpoint-2026-08-09.md).

Local attempt-client response checkpoint 2026-08-09 ย้าย lesson attempt hook ออกจาก
inline `response.json()` casts มาผ่าน raw response boundary ที่อ่านไม่เกิน 256 KiB,
reject duplicate JSON key ทุกระดับ และสร้าง exact deep projection ของ wrapper,
MCQ, simulation และ public challenge. UUIDv4, Gregorian calendar-valid RFC3339
expiry profile, arrays ที่ต้องมี,
nested maps และ unique task IDs ต้องผ่านทั้งหมด; malformed success ใช้ `error`
เดิม ส่วน 401/403/429 ยังเป็น `access-lost`/`quota` และรับ retry เฉพาะ exact bounded
integer. Behavior RED ล้ม 34/47, focused GREEN ผ่าน 50/50, attempt/security ผ่าน
170/170 และ full unit ผ่าน 565/565. Preliminary RIL `C0/H0/M1/L0` พบว่า
`Date.parse()` normalize วันที่/เวลาที่ไม่มีจริง; remediation RED ล้ม 4/64 แล้ว
GREEN ผ่าน 64/64 โดยตรวจ component ranges, days-in-month และ century leap-year
rule โดยไม่เทียบ device clock. Regression ใหม่ผ่าน 177/177 และ full unit 579/579;
RFC3339 re-review ปิด finding นี้แล้วแต่พบ medium ใหม่ว่า required field อาจไม่มีใน
`initial` หรือ surface ไม่รองรับ. Cross-field RED ล้ม 2/67 แล้ว GREEN ผ่าน 67/67
โดย reuse shared `network-interface` allowlist เดียวกับ producer; regression ผ่าน
180/180 และ full unit 582/582. Node 24 lint/typechecks, Next/OpenNext build และ
audits ผ่าน. Route/public types/LessonView/progress ไม่ถูกแก้; independent re-review
ของ remediation ล่าสุดยัง pending. หลักฐานอยู่ที่
[`reports/reviews/academy-attempt-client-response-validation-local-checkpoint-2026-08-09.md`](../reports/reviews/academy-attempt-client-response-validation-local-checkpoint-2026-08-09.md).

Local public-waitlist response checkpoint 2026-08-09 ปิด false success ของหน้า
landing แล้ว: Form จะขึ้นสถานะสำเร็จเฉพาะ HTTP success ที่เป็น raw JSON exact
one-key `{ok:true}` ไม่เกิน 128 bytes และ media type ถูกต้อง. Final review พบ
M-01 ว่า default reader อาจ materialize single chunk ขนาดใหญ่ก่อนเช็ก bound และ
ไม่มี deadline; M-02 พบ non-ok `response.json()` แบบ unbounded พร้อมส่ง server text
เข้า Form. Remediation ใช้ BYOB view ไม่เกิน `max+1`, deadline 5 วินาที,
optional AbortSignal และ cancel แบบไม่รอผล; non-ok ไม่อ่าน/parse body และคืน generic
local rejection เท่านั้น. Request contract, network copy และ UI layout ไม่เปลี่ยน.
Remediation RED เป็น 12 failed / 36 passed; GREEN ผ่าน waitlist 32/32 + unsubscribe 16/16,
waitlist/security 114/114 และ full unit 614/614; Node 24 lint/typechecks,
Next/OpenNext build และ audits ผ่าน. Independent final review ผ่าน C0/H0/M0/L0.
Route/E2E/DB/legal/Identity/config ไม่ถูกแก้; deployed-browser BYOB proof ยังเป็น
release gate แยก. หลักฐานอยู่ที่
[`reports/reviews/academy-waitlist-client-response-validation-local-checkpoint-2026-08-09.md`](../reports/reviews/academy-waitlist-client-response-validation-local-checkpoint-2026-08-09.md).

Local practice-simulation client response checkpoint 2026-08-09 ย้าย learner
verdict ออกจาก inline `response.json()`/truthy `ok` มาผ่าน shared bounded BYOB +
deadline + duplicate-safe JSON boundary และ exact deep projector. Capstone รับเพียง
`{ok:true,passed:boolean}`; regular verdict ต้องตรง public requirements ตาม ID,
label, ลำดับ, counts, passed และ hint/debrief policy ก่อน UI ใช้. Parser เดิมของ
attempt ถูก extract แทนการสร้างชุดที่สาม; exact-ok ยังคง sole 128-byte raw envelope.
Behavior RED ล้ม 29/37; GREEN ผ่าน simulation 37/37, shared consumers 152/152,
relevant/security 208/208 และ full unit 651/651. Node 24 lint/typechecks,
Next/OpenNext builds, offline audits, dependency tree และ gitleaks ผ่าน.
Independent RIL `C0/H0/M2/L0` พบว่า variant ไม่ได้ bind กับ trusted `node.kind`
และ deadline เริ่มหลัง fetch พร้อม reset budget ตอนอ่าน body. Remediation RED ล้ม
6/41; GREEN ผ่าน focused 41/41, shared consumers 156/156, relevant/security
278/278 และ full unit 655/655. Variant chain ตอนนี้มาจาก LessonView และ capstone
ปฏิเสธไม่ให้ per-requirement response ผ่านเข้า verdict/UI; AbortController เดียวเริ่มก่อน fetch และ reader
ได้เฉพาะเวลาที่เหลือ. Independent final re-review ผ่าน C0/H0/M0/L0. Route, DB/SQL,
Identity, config, deploy, copy/layout ไม่ถูกแก้; browser/runtime proof ยังเป็น gate แยก. หลักฐานอยู่ที่
[`reports/reviews/academy-practice-simulation-client-response-validation-local-checkpoint-2026-08-09.md`](../reports/reviews/academy-practice-simulation-client-response-validation-local-checkpoint-2026-08-09.md).

งานหลักถัดไปตามลำดับ:

1. **เปิด auth/runtime และ bootstrap owner จาก stable identity จริง**
   - Academy ปิด direct GoTrue OTP บน non-loopback เสมอ แม้มี public Supabase values;
     local E2E fixture ต้องมี explicit switch + loopback Academy/Supabase origin
   - callback real flow รอ Identity Control publish client public-key reference,
     lifecycle pull contract, kill-switch owner, conformance evidence และ separate
     production authorization; ห้าม redirect `/sign-in` ไป Account Center หรือเขียน
     Academy session ก่อนครบ
   - local lifecycle-envelope verifier ถูก freeze และ final independent review ผ่าน
     C0/H0/M0/L0; ยังใช้แทน runtime key distribution/transport evidence ไม่ได้
   - durable page store และ database-clock lease มีเฉพาะ local checkpoint;
     pure pull-cycle composition, production migration และ runtime wiring ยังไม่ทำ
   - founder ต้อง sign in หนึ่งครั้งหลัง runtime พร้อม เพื่อสร้าง `academy.users` จาก
     `(canonical_issuer, subject)`; จากนั้น dry-run/apply `scripts/manage-staff-role.mjs`
   - ปัจจุบัน `academy.users=0`, active owner `=0`; ห้ามสร้าง UUID หรือใช้ email แทน identity
2. **ยืนยัน execution จริงของ retention cron รอบแรก**
   - dedicated retention API และ Worker แยกจาก runtime deploy แล้ว: role
     `academy_retention` เรียกได้เฉพาะ wrapper purge ทั้ง 5, PostgREST expose
     เฉพาะ schema `academy`, และ Worker ถือ credential เฉพาะของ API นี้
   - Cron `0 3 * * *` ยังต้องมีหลักฐานจาก event จริง: log ต้องพบ
     `retention.purge_complete` ครบทั้ง 5 งาน หรือ `retention.purge_failed` ที่
     surfaced ชัดเจน; ห้ามเรียก production purge RPC ด้วยมือเพียงเพื่อบังคับ retry
   - หลักฐาน deployment/rollback อยู่ใน
     [`reports/academy-retention-api-rollout-2026-08-06.md`](../reports/academy-retention-api-rollout-2026-08-06.md)
3. **ปิด public-launch gates ที่เหลือ**
   - private media: delivery grant ย้ายจาก URL ไป `HttpOnly` path-scoped cookie แล้ว;
     source test/build/dry-run ผ่าน แต่หลัง deploy ต้องตรวจ clean media URL, cookie
     renewal, video range/captions/PDF และ edge log ก่อนถือว่า gate ปิด
   - restricted case-system owner/access configuration
   - legal review ภาษาไทยสำหรับ privacy/retention/appeal
   - เก็บ deployed browser CSP compatibility evidence แล้วจึงตัดสิน enforce policy
   - CNAME/Zero Trust/public exposure decision แยกจาก Worker preview deployment
4. **ตัดสินการเปิด public indexing หรือ Thai social campaign เมื่อมี release authorization**
   - canonical static URL `/courses/{slug}/{locale}` และ legacy compatibility redirect
     ปิดแล้ว; ก่อนเปิด indexing ให้ตรวจ environment switch, catalog approval และ
     public-launch gates ทั้งหมดอีกครั้ง
   - งานนี้แยกจาก identity และไม่อนุญาตให้เปิดบัญชีหรือ lesson ก่อนเวลา
5. **ยืนยัน learner-only visual data กับ identity runtime ก่อนเปิด account**
   - course-specific skill map กลับมาแล้วผ่าน protected derived-data boundary โดย
     ไม่ส่ง weights ข้าม Flight; เมื่อ identity runtime/fixture พร้อม ให้ทำ browser
     E2E ของผู้เรียนที่มีสิทธิ์จริงทั้ง EN/TH, retry/access-loss/reset/locale และ
     viewport 320/390 ก่อนถือว่า UX runtime ผ่าน
   - ภาพแชร์และ metadata ไทยพร้อมตาม locale แล้ว; ก่อนเปิด indexing หรือ Thai social
     campaign ให้ตรวจ release authorization และ public-launch gates ทั้งหมดอีกครั้ง

**สถานะ release:** production infrastructure checkpoint ผ่าน แต่ยังไม่พร้อม public launch
และยังไม่พร้อมรับ learner account จนกว่างาน 1–2 จะปิดครบ.

---

## ⛔ Pre-continuation audit gate — 2026-08-02

ตรวจ implementation เดิมทั้ง code, security และ learner UX แล้ว แม้ baseline ผ่าน
`lint` (0 errors), test 347 ตัว และ E2E 111 ตัว แต่ยังพบ production blockers ที่ suite
ไม่ครอบคลุม จึง **ห้ามถือว่า Academy พร้อมรับ production traffic หรือออก certificate**
จนกว่าจะปิด P0 ใน
[`reports/reviews/academy-implementation-audit-2026-08-02.md`](../reports/reviews/academy-implementation-audit-2026-08-02.md)

ลำดับที่ใช้เดินงาน: local security batch → integrity batch → learner-safety batch →
owner decisions → Pool A ภายใต้ authorization ใหม่ → release verification

Pool A, production schema/PGRST, R2, deploy และ secrets **ยังไม่ได้ถูกแตะ** ใน audit นี้
และยังคงใช้ authorization gate ตาม active handoff

### Local Security Batch — ปิดแล้ว 2026-08-03

- [x] auth cookie policy จุดเดียว: `HttpOnly`, `SameSite=Lax`, host/path scope และ
      production fail-secure; auth mutation ปฏิเสธ transport ที่ไม่ผ่าน HTTPS edge
- [x] same-origin/Fetch Metadata + JSON content-type guard ครบ mutation routes
- [x] bounded streaming JSON ครบ public/mutation endpoints ที่รับ body
- [x] activation + course entitlement + node prerequisite เป็น resource guard กลาง
      ครบ lesson, progress, attempts, explanations และ practice
- [x] dashboard/lesson มี typed denied, unavailable และ access-lost states; sign-out
      ตรวจ provider failure และไม่ redirect แบบสำเร็จปลอม
- [x] evidence: lint/typecheck, 388 unit/integration tests, clean build และ Playwright
      121 passed / 10 skipped; independent Code/Security/UX review = C0/H0/M0 ทุก lane

### Integrity Batch — ปิดแล้ว 2026-08-03

- [x] claim token fence + atomic attempt outcome/progress; concurrent claim แยกจาก invalid
      และ UI reconcile ผลเดิมก่อนออก attempt ใหม่
- [x] progress epoch fence ครบ attempt และ generic open/skip/video/checkpoint; reset,
      activation suspend และ entitlement revoke ชนะ in-flight request ตามลำดับ transaction
- [x] activation sync เป็น monotonic revision; revision เท่ากันแต่ status ขัดกันถูก reject
- [x] explanation snapshot ผูกกับ passing attempt และ fail closed เมื่อ pointer/snapshot หาย
- [x] evidence: lint/typecheck, Vitest 413/413, clean build, DB lint และ Playwright
      122 passed / 10 skipped; independent Code/Security/UX review = C0/H0/M0 ทุก lane

### Learner-Safety Batch — ปิดแล้ว 2026-08-03

- [x] validation ความครบของ simulation ก่อน consume attempt: per-mode public readiness,
      Apply/dirty state, legacy snapshot normalization และ policy snapshot; incomplete payload
      ไม่กิน quota/ปิดใบและ UI คงคำตอบกับ attempt เดิม
- [x] reset confirmation และ recovery contract ที่บอกผลตามจริงโดยไม่ทำให้ผู้เรียนเสียงาน
- [x] focus trap/return focus สำหรับ image/lab dialogs และ keyboard/video cue accessibility
- [x] แก้ learner-facing copy ที่ยังอ้าง persistence/issuance ไม่ตรง implementation จริง

**Evidence checkpoint 1:** lint/typecheck ผ่าน · Vitest **426/426** · clean build ผ่าน ·
Playwright **124 passed / 10 skipped** · independent Code/Security/UX review C0/H0/M0 ทุก lane

**Evidence checkpoint 2:** reset ใช้ confirmation ที่บอกขอบเขต/attempt quota ตามจริง,
operation ID + bounded receipt สำหรับ idempotent recovery, transaction recheck สิทธิ์และ
progress epoch, current-record reconciliation และ fail-closed overview state · lint/typecheck
ผ่าน · Vitest **440/440** · fresh local migration + clean build ผ่าน · Playwright
**136 passed / 10 skipped** · independent Code/Security/UX review **C0/H0/M0 ทุก lane**

**Evidence checkpoint 3:** image/lab ใช้ native modal + shared focus trap และคืน focus
ไป opener; reset dialog รักษา focus ระหว่าง slow request/reopen/terminal states พร้อม stable
fallback; video cue ใช้ non-modal semantics, keyboard-only flow, persistent live status และ
คืน focus ไป video · lint/typecheck ผ่าน · Vitest **440/440** · clean build ผ่าน · Playwright
**137 passed / 10 skipped** · desktop/mobile visual review ผ่าน · independent
Code/Security/UX review **C0/H0/M0/L0 ทุก lane**

**Evidence checkpoint 4:** dashboard พิสูจน์ server-backed learning record ผ่าน
browser context ใหม่; certificate surface แสดงเพียง course-record status และบอก
ว่า issuance/verification ยังไม่เปิด; ตัด test-out/cross-product capability ที่ยังไม่มี;
CTA ไป public catalog; consent `v2` เป็น bilingual artifact ที่ versioned ทั้งก้อนและ
`consent_events` เก็บ v1→v2 แบบ additive/idempotent ด้วย `SELECT, INSERT` เท่านั้น ·
lint/typecheck ผ่าน · Vitest **444/444** · clean build ผ่าน · clean local DB reset
ผ่าน migration 0001–0016 · Playwright **138 passed / 10 skipped** · desktop/mobile visual
review ผ่าน · independent Code/Security/UX review **C0/H0/M0/L0 ทุก lane**

**ยังไม่ใช่ production-ready:** migration `0016` ต้อง apply ก่อน deploy code ที่ใช้
consent `v2`/RPC; private `/media/*`, HTTPS runtime `Set-Cookie` proof บน
deployment topology จริง, privacy/retention, dependency advisories, durable abuse control,
least-privilege production credential และ owner decisions ที่ค้างยังเป็น launch gates

---

## ⚠️ อ่านก่อนลงมือ — แผน implement ที่ผ่าน RIL แล้ว (2026-08-02)

**`plans/implementation-plan-2026-08-02.md` คือแผนที่ session ถัดไปต้องเดินตาม**
ผ่าน RIL 7 รอบ สองเลนอิสระ (codex `model_reasoning_effort=high` + Claude critic)
→ **PASS ทั้งสองเลนในรอบที่ 7**

**สิ่งที่ RIL เปลี่ยนไปจากความเข้าใจเดิม — สำคัญมาก:**
ร่างแรกเขียนว่า "แกนหลักฐานต่อครบแล้ว เหลือแค่ต่อ simulation" ซึ่ง **ไม่จริง**
พิสูจน์ด้วยการรันจริงแล้วพบ 5 ข้อบกพร่อง (F1–F5) ที่ยังอยู่บน HEAD วันนี้:

| # | ข้อบกพร่อง | สถานะ (2026-08-02) |
|---|---|---|
| F1 | เฉลยและคำอธิบายถูกส่งไป browser ทั้งชุด (MCQ · video cue · simulation · `/player`) | ✅ ปิด — W0-1 |
| F2 | บทปกติ "ผ่าน" ด้วยการตอบครบ ไม่ต้องตอบถูก | ✅ ปิด — W0-3 |
| F3 | ใบรับรองนับ `completed` เป็น "พิสูจน์แล้ว" → ตอบผิดทุกข้อก็ได้ใบ | ✅ ปิด — W0-3 |
| F4 | UI ประกาศว่าผ่านก่อนเซิร์ฟเวอร์ตอบ (ทิ้ง `outcome`) | ✅ ปิด — W0-2 |
| F5 | คำถามกลางวิดีโอตรวจและบันทึกจริง แต่ไม่ถูกใช้ตัดสินอะไร | ✅ ปิด — W0-4 (นิยามเป็น formative) |

→ **W0 (ซ่อมแกนหลักฐาน) ต้องทำก่อนทุกอย่าง** และงานแรกจริงๆ คือ **W0-0**
(โครง attempt + คลังข้อ) เพราะกติกาอื่นทั้งหมดพึ่งมัน

> **สถานะ W0 ณ 2026-08-02: ปิดครบทั้งห้าข้อ** · รายละเอียดแต่ละงานอยู่ในบันทึก
> ความคืบหน้าด้านล่าง · **สิ่งที่ยังค้างและบล็อกการ "ปิด W0" อย่างเป็นทางการ**:
> คลังข้อ capstone EN 39 ข้อ (W-content) และการต่อ attempt เข้า `/api/progress`
> — สองอย่างนี้คือเงื่อนไขของการเปิด `test-out` กลับมา

**ลำดับที่บังคับ:** W0-0 → W0-1..4 → W1 → W2 → W3 → W4 · W-content ทำขนานกับ W0 ได้

**Founder blocker ที่ต้องขอตั้งแต่เปิด session** (§4.2b ของแผน):
R2 bucket สำหรับย้าย media · และอนุญาต deploy หนึ่งครั้งเพื่อ verify `/media/*`
(ลอง `wrangler dev --remote` ก่อน)

**ความคืบหน้า W0-0 (2026-08-02) — โครง attempt เสร็จ ผ่าน RIL cross-model 2 รอบ:**
- migration 0005: ตาราง `academy.attempt` (RLS default deny) + `issue_attempt`
  (โควตา 3/30นาที นับจากแถว DB + advisory lock) + `consume_attempt` (UPDATE เดียว
  เงื่อนไข ownership/context/replay/expiry ใน `WHERE` เดียว) + revoke execute
  PUBLIC/anon/authenticated ทั้ง 5 ฟังก์ชันของสคีมา + index รองรับ retention
- `POST /api/attempts` ออกโจทย์สุ่ม + remap key ต่อ attempt · `params` ฝั่ง server
  เก็บ **answerKeys snapshot** ณ ตอน issue (กัน version drift ระหว่าง issue/consume)
- เทส 30 ตัว (unit 12 · integration 13 · e2e 5) — race/replay/ownership/expiry/
  โควตา concurrent/window rollover/function grants/no-leak — full chain เขียว
- **ยังไม่ปิด W0-0**: เหลือต่อ consume เข้า `/api/progress` (คู่กับ W1) ·
  คลังข้อ 39 (W-content) · retention job (รอเลือกกลไก cron)

**W0-1 เสร็จ (2026-08-02) — เฉลยไม่ออกจากเซิร์ฟเวอร์แล้ว (ปิด F1) และ F4/W0-2 ปิดตาม:**
- `public-lesson.ts` — `PublicLesson` DTO เป็น **ชนิดที่บังคับ** ไม่ใช่วินัยของคนเขียน:
  client component รับได้เฉพาะชนิดที่ไม่มี `correct`/`explanation`/`operator`/`hints`
  อยู่ในโครง · `answer-key.ts` เป็นทางเข้าเดียวของเฉลย ปิดด้วย `server-only`
  (เพิ่ม dependency ตามที่ W0 acceptance ระบุ · SBOM อัปเดตแล้ว)
- `/api/progress` — assessed (capstone/test-out) คืน `{ passed }` เท่านั้น เหมือนกัน
  ทั้งผ่านและไม่ผ่าน · learn คืนผลรายข้อ + คำอธิบาย
- `/api/practice/simulation` ใหม่ — โหมดฝึกตรวจที่เซิร์ฟเวอร์ และเซิร์ฟเวอร์เป็นคน
  ตัดสินว่าถึงเวลาให้คำใบ้ (เดิม `SimulationBlock` ถือ hints เองแล้วนับครั้งเอง)
- `/api/explanations` ใหม่ — เปิดเฉลยเฉพาะบทที่อ่านจาก DB แล้วพบว่าผ่านจริง
- **F4/W0-2 ปิดไปด้วย**: client ไม่มีเฉลยแล้วจึงต้องรอ `outcome.passed` จากเซิร์ฟเวอร์
  ก่อน `setDone()` · ระหว่างรอแสดง "Checking…" ไม่ประกาศผลล่วงหน้า
- เทสใหม่: `answer-leak` ยิงหน้าจริงทั้ง 15 บทอ่าน HTML+RSC+JS chunk ·
  `assessed-redaction` ตรวจรูป response รวม Mastermind · `player-boundary` กันขอบเขต
  `/player` · `ui-waits-for-server` วัดบนหน้าจอก่อน reload (เกณฑ์ W0-2 ที่แผนล็อก)

**RIL cross-model บน W0-1 จับสองรูที่ผมมองข้าม — แก้แล้ว (commit 4c1c07c):**
- 🔴 **โหมดสอนเป็นเครื่องเฉลยของโหมดวัดผล**: บทปกติใช้ checkpoint ชุดเดียวกันทั้ง
  learn/test-out → ยิง learn เก็บเฉลย แล้วไปยิง test-out ได้ `tested-out` ที่นับเป็น
  พิสูจน์แล้ว → `assessment-policy.ts` **ปิด test-out ทั้งหมด** จนกว่า node จะมีคลังข้อ
  ของตัวเอง (แผน W0-0 ล็อกไว้ตั้งแต่แรกแต่ยังไม่ได้ทำ) · ปุ่มและ copy บน UI ผูกกับ
  นโยบายเดียวกัน — **การเปิด test-out กลับต้องมาพร้อมคลังข้อ ≥3 เท่า (W-content)**
- 🔴 **`/player` เปิดให้ผู้เรียนทุกคนที่ล็อกอิน** (เทสรุ่นแรกวัดแค่ anon จึงเขียวทั้งที่
  รูเปิด) → `internal-surface.ts` fail-closed ด้วย `INTERNAL_SURFACES` (ไม่ตั้ง = ปิด,
  ตอบ 404 ก่อนชั้น auth) · ซ่อนลิงก์ทั้งเมนูและ dashboard · spec ของ `/player`
  (player, visual-matrix, full-acceptance) ข้ามเมื่อปิดและผ่านเมื่อเปิด — ยืนยันสองโหมด
- MAJOR: DTO บังคับจริงด้วย `?: never` + เทสระดับชนิด (พิสูจน์ด้วยการถอด guard แล้วแดง) ·
  `course-source.ts` ใส่ `server-only` · practice endpoint จำกัด body/จำนวน key ·
  คำใบ้เปลี่ยนเป็นผู้เรียนกดขอ (เดิมเชื่อ attempt count จาก client ที่ปลอมได้) ·
  cache answer key
- chain: vitest **241** (รวม type tests) · playwright **85 + 10 skipped** (พื้นผิวภายใน)

**W1 เสร็จ (2026-08-02) — simulation เป็นด่านจริงแล้ว · RIL 2 รอบ:**
- `CheckpointItem` union (MCQ | simulation) **ไม่ breaking** — loader เติม `kind:'mcq'`
  ให้รูปเดิม ไฟล์เนื้อหา 20 ไฟล์ไม่ต้องแก้
- เซิร์ฟเวอร์ตรวจ simulation เอง · MCQ+simulation นับรวมเป็นชุดเดียว (กดตรวจครั้งเดียว)
- migration 0006: เก็บหลักฐาน **ราย requirement + ลายนิ้วมือกติกา + เวลา**
- migration 0007: **หลักฐานเลื่อนขึ้นอย่างเดียวเหมือนสถานะ** — RIL จับว่าเดิมผ่านแล้ว
  ส่งผิดซ้ำจะทำให้ "สถานะบอกว่าผ่าน แต่หลักฐานบอกว่าไม่ผ่าน" ขัดกันเอง
- `gradingFingerprint()` — เดิมบันทึก `structure.version` ของคอร์สซึ่งไม่ขยับเมื่อ
  requirements เปลี่ยน จึงตอบไม่ได้ว่าผ่านด้วยกติกาชุดไหน
- grader **fail-closed**: ไม่มี field ในสถานะ = ไม่ผ่านเสมอ · operator ที่ต้องมี value
  แต่ไม่มี = ไม่ผ่าน (เดิม `undefined === undefined` ทำให้ "ไม่ทำอะไรเลย" ผ่านด่านได้)
- เขียน simulation ลง capstone จริง 1 จุด (static IP ให้ print server, 5 requirements)
- chain: vitest **288** · playwright **100 + 10 skipped**

**ข้อจำกัดที่รู้อยู่และต้องปิดใน W4:** `courseRecordSummary` ตัดสินจากสถานะอย่างเดียว
ยังไม่อ่าน `simulationEvidence` — ถ้าเนื้อหาเพิ่มด่านใหม่เข้า capstone ที่ผ่านไปแล้ว
สถานะจะยัง completed ทั้งที่หลักฐานของด่านใหม่ยังไม่มี · W4 ต้องอ่านหลักฐานจริงประกอบ
เพราะใบรับรอง snapshot หลักฐาน ณ วันออก ไม่ใช่สถานะปัจจุบัน (บันทึกในโค้ดแล้ว)

**W1d เสร็จ (2026-08-02) — โจทย์จำลองสุ่มค่าเป้าหมายต่อ attempt:**
- `/api/attempts` สุ่มตัวแปรเก็บใน `params.simulationVars` แล้วส่งโจทย์ที่แทนค่าแล้ว ·
  `/api/progress` consume attempt แล้วตรวจด้วยค่าของ attempt นั้น คำตอบจึงแชร์กันไม่ได้
- `PublicCheckpointItem.challenge` เป็น optional **โดยตั้งใจ** — หน้า lesson ส่งได้แค่
  "มีด่าน id นี้" ตัวโจทย์มาจาก attempt เท่านั้น (เดิมส่งแม่แบบ `{{targetIp}}` ไปกับ payload)
- `useLessonAttempt` เป็น state machine (รอ / พร้อม / ขอไม่ได้) — ด่านไม่ปรากฏจนกว่า
  โจทย์จะเป็นของผู้เรียนจริง · โควตาเต็มบอกตรงๆ พร้อมเวลาที่ขอได้อีกครั้ง

**RIL รอบ W1 (cross-model, xhigh) — พบ 3 blocker + 5 should-fix บน commit ที่ "เขียวหมด":**
ปิดแล้วใน `77a14f2`:
- **oracle ที่ GET** — POST ปิดผลรายข้อไว้แล้ว แต่ `GET /api/progress` คืน
  `checkpointResults` รายข้อของ capstone + ผลราย requirement · ส่งผิดสามชุดก็ได้เฉลย
  ครบ → `toPublicProgress()` ตัดทุกเส้นทางที่ส่งไป browser (fail closed)
- **ลองใหม่แล้วตัน** — attempt ถูกใช้ไปตั้งแต่กดตรวจ ปุ่ม Try again ส่ง id เดิมซ้ำ → 409
  ตลอด · ตอนนี้ขอโจทย์ชุดใหม่จริง
- **แม่แบบที่ยังไม่แทนค่าถูกเอาไปตรวจ** — attempt เก่าข้าม deploy ทำให้ค่าที่ต้องได้เป็น
  สตริง `"{{targetIp}}"` ตรงตัว → กรอกตามก็ผ่าน · `resolveChallenge` fail closed แล้ว
- **reset ลบสมุดนับโควตา** — คนไล่ลองเฉลยไม่มีอะไรให้เสีย จึง reset สลับขอ attempt ได้
  ไม่จำกัด · reset ไม่แตะ `attempt` อีก โควตาเป็นค่าคอนฟิกให้เทสตั้งสูงแทน
- **ออก attempt ทั้งที่ทำจบแล้ว** — `hold` จนกว่าจะรู้สถานะบท

**ยังเปิดอยู่จาก RIL รอบนี้ (จดเป็นงาน ไม่ใช่ปล่อยผ่าน):**
- consume + บันทึกความคืบหน้าไม่ atomic → 500 กลางทางกินสิทธิ์ผู้เรียนถาวร ·
  และ attempt ที่ response หายกลางทางก็กินโควตาโดยไม่ได้อะไร (ต้องมี idempotency)
- ตาราง `attempt` ไม่มี retention — ตั้ง batch cleanup ก่อนเปิด traffic จริง
- **ด่านจำลองยังพิสูจน์ได้แค่ "ส่งสถานะปลายทางที่ถูก"** ไม่ใช่ "ลงมือทำ" — ยิง API ตรง
  ก็ผ่าน · แผนยอมรับข้อจำกัดนี้ไว้แล้ว แต่ **W4 ต้องไม่อ้างเกินนี้ในใบรับรอง**
  (lab จริงหรือ session ฝั่งเซิร์ฟเวอร์เท่านั้นที่ยกระดับได้)

**W0-0b เสร็จ (2026-08-02) — remap key มีผลจริงแล้ว:**
เดิม `/api/attempts` ออก MCQ ที่ remap key ต่อ attempt มาตั้งแต่ W0-0 แต่ไม่มีใครใช้ —
UI เรนเดอร์จากไฟล์ (key จริง) และ `/api/progress` ตรวจด้วย key จริง แปลว่าคำตอบ capstone
คงที่ตลอดและบอกต่อกันได้ ซึ่งเป็นสิ่งที่ W0-0 ตั้งใจกันตั้งแต่แรก
- UI รับทั้ง MCQ และด่านจำลองจาก attempt · ลำดับข้อก็มาจาก attempt
- API แปลง key กลับด้วยตารางของ attempt แล้วเทียบกับ **เฉลย snapshot ใน attempt**
  ไม่ใช่ไฟล์ปัจจุบัน · key ที่ไม่มีในตาราง = ปฏิเสธทั้ง submission
- `requiresAttempt()` เป็นจุดเดียวที่ตัดสินว่าด่านไหนต้องมี attempt (UI กับ API ต้องตอบ
  เหมือนกัน ไม่งั้นผู้เรียนกดตรวจแล้วได้ 400 โดยไม่มีอะไรบอก)
- e2e เลิกคลิก `input[value="B"]` ทั้งชุด — เลือกจากข้อความของตัวเลือกเหมือนผู้เรียนอ่าน
  (ของเดิมจะเขียวเองแบบสุ่ม ~1 ใน 4 ครั้ง)
- mutation 2 แบบแดงตามคาด ผ่าน `scripts/mutation-check.sh` (คืนไฟล์จากสำเนา ไม่ใช่ git)

**RIL รอบ 2 (หลัง W0-0b) — พบว่า remap ยัง "ไม่กันอะไร" เพราะชุด key จริงยังหลุด:**
ปิดแล้วใน `da68a29`:
- **หน้า capstone ส่ง `choices` ชุด key จริงมาด้วย** แม้ UI แสดงชุดที่ remap แล้ว →
  คนที่ผ่านแล้วบอกเพื่อน "B, C, B" เพื่อนเทียบข้อความแล้วแปลงเป็น key ของตัวเองได้ทันที
  · ตอนนี้หน้าส่งได้แค่รายชื่องาน เนื้อโจทย์มาจาก `/api/attempts` ที่เดียว
- `/api/explanations` เลิกคืน key เฉลย (คืนแค่คำอธิบาย)
- `/api/attempts` ใช้ `requiresAttempt` เหมือน UI/API อื่น (บทปกติที่มีด่านจำลองเคยตัน)
- คำตอบที่เกินมาถูกเมินเงียบๆ → ตรวจให้ชุด key ตรงกับโจทย์ของ attempt พอดี
- 409 แล้วตัน → ขอโจทย์ชุดใหม่ให้อัตโนมัติ

**ปิดครบแล้วทั้งชุด (migration 0008–0011):**
- `0008` — `passed_attempt_id` + `passed_challenge_version` บน `node_progress`
  เขียนได้ครั้งเดียว · ตั้งใจไม่ผูก FK เพราะ retention จะกวาดแถว attempt ทิ้ง
- `params.simulations` + `params.questions` — attempt หนึ่งใบถือทุกอย่างที่ใช้แสดง
  และตรวจงานของตัวเอง · `simulationsToGrade()` เป็นจุดเดียวที่ตอบว่าใช้โจทย์ชุดไหน
- `0009` — attempt จำผลสุดท้ายไว้ · ส่งซ้ำหลังจบ = คืนผลเดิม · ค้างไม่มีผลเกิน 30
  วินาที = ล้มกลางทาง ให้ตรวจใหม่ได้ (ต้องมีเวลากันไว้ ไม่งั้นยิงคู่ได้สองสิทธิ์)
- `0010` — attempt ที่ยังไม่ถูกใช้ถูกคืนซ้ำ · เปิดหน้าซ้ำ/สองแท็บไม่กินโควตา และ
  หมุนโจทย์ทิ้งด้วยการ refresh ไม่ได้อีก · หนึ่งช่องโควตา = หนึ่งชุดโจทย์ที่ใช้จริง
- `0011` — `purge_expired_attempts()` ไม่แตะของที่ยังใช้ได้และช่วงที่โควตายังนับ
  (**ยังไม่มีตัวตั้งเวลา** — เลือกกลไกอยู่ที่เจ้าของระบบ · PENDING_USER_ACTION §7b)

**RIL รอบ 3 — สองเลนอิสระ (reviewer xhigh + red-team) บน `1dc3de9`:**
ชี้ตรงกันสามข้อ ปิดแล้วใน `347660b` (migration 0012):
- **claim ไม่ต่ออายุ → attempt เดียวถูกตรวจได้หลายครั้ง** · `coalesce(consumed_at, now())`
  ไม่ต่ออายุ พอพ้น 30 วินาทีทุกคำขอที่ยิงพร้อมกันผ่านหมด → `set consumed_at = now()`
  · red-team ชี้ทางสร้างสภาพนั้นได้ฟรี (payload key ไม่ตรง → consume ก่อนแล้วค่อย 400)
  → ทุกทางออกที่ปฏิเสธหลัง consume ต้อง finalize ปิด attempt
- **ผลรายข้อถูกทับได้แม้ผ่านแล้ว** → หลักฐานถูกแช่แข็งทั้งชุดเมื่อมีตัวชี้
- **ตัวกวาดลบใบที่เป็นหลักฐาน** → `not exists` + partial index
- red-team เพิ่ม: deploy ระหว่างทางกินสิทธิ์ผู้เรียน (ตรวจจาก snapshot ล้วนแล้ว) ·
  cron ที่ล้มถูกนับว่าสำเร็จ (throw แทน log)

⚠️ บทเรียนที่บันทึกไว้: ทั้งสามข้อคือ "ตั้งกติกาแล้วบังคับไม่ครบพี่น้องของฟิลด์นั้น"
และเทสที่เขียนเองก็ตรวจแค่ครึ่งที่คิดถึง — เทสข้อ 3 ยืนยันพฤติกรรมผิดด้วยซ้ำ

**สถานะ production ณ ปิด session (ตรวจจริง 2026-08-02):**
- Worker `cyberskills-academy` deploy ล่าสุด 2026-08-01 · **ไม่มี secret ตั้งไว้เลย**
  → ทุกฟีเจอร์ที่ใช้ DB ปิดอยู่ตามที่ตั้งใจ (หน้า sign-in บอกว่ายังไม่เปิด)
- ตาม `reports/state/supabase.md` (2026-08-01) Pool A **ยังไม่มีสคีมา `academy`** และ
  `PGRST_DB_SCHEMAS` ก็ยังไม่มี → migration 0001–0012 อยู่แค่ในเครื่อง
- `/media/*` เสิร์ฟผ่าน ASSETS binding ตรง request ไม่ถึง Worker → **วิดีโอบทเรียน
  โหลดได้โดยไม่ต้องมีบัญชี** · middleware แก้ไม่ได้เพราะไม่เคยถูกเรียก
- founder อนุมัติแล้ว (2026-08-02): สร้างสคีมา `academy` บน Pool A + งานบน Pool A +
  R2 bucket + deploy หนึ่งครั้ง · **ยังไม่เปิดระบบบัญชีบน preview** (รอ identity contract)

**⚠️ ข้อจำกัดที่ยังจริงอยู่และต้องพูดตรงๆ:** ตราบใดที่คลังข้อยังเท่าจำนวนที่เสิร์ฟ
(W-content ยังไม่เข้า) การบอกต่อ **ข้อความ** ของตัวเลือกที่ถูกยังทำได้อยู่ดี — สิ่งที่
ปิดช่องนั้นคือการหมุนคลังข้อ ไม่ใช่การซ่อน key

**เงื่อนไขที่เหลือก่อนเปิด `test-out` กลับมา:** คลังข้อ capstone EN 39 ข้อ (W-content)

**W0-3 + W0-4 เสร็จ (2026-08-02) — ปิด F2/F3/F5 · W0 ครบทั้งห้าข้อแล้ว:**
- `assessment-policy.ts` เป็น **จุดเดียว** ที่ตอบสองคำถาม: "อะไรผ่าน" (`passesLearnMode`)
  และ "อะไรนับเป็นหลักฐาน" (`isProofBearing`) — เดิมสองคำถามนี้กระจายอยู่ API/UI/
  ใบรับรอง แล้วหลุดไม่พร้อมกัน ซึ่งเป็นต้นเหตุของ F2/F3 ตั้งแต่แรก
- เกณฑ์บทปกติ: ผิดไม่เกิน 1 **และต้องมีข้อที่ถูกอย่างน้อยหนึ่งข้อ**
  ⚠️ เกณฑ์ "ผิดไม่เกิน 1" ตามที่แผนล็อกไว้ใช้ตรงๆ ไม่ได้ เพราะคอร์สจริงมีบทที่มี
  checkpoint 1–2 ข้อ ซึ่งจะกลายเป็น "ผ่านโดยไม่ต้องตอบถูกสักข้อ" (เทส e2e จับได้
  ตั้งแต่รันครั้งแรก) — founder เปลี่ยนตัวเลขได้ที่ `LEARN_MODE_ALLOWED_WRONG`
- `courseRecordSummary` แยกสองชั้นที่ต้องผ่านทั้งคู่ (เดินครบทุกบท **และ** ทุก
  capstone ผ่าน) · คอร์สที่ไม่มี capstone ออกใบไม่ได้ → `courseIssue: 'no-assessment'`
  แยกจาก `blocking` เพราะ UI ทำ blocking เป็นลิงก์ไปหน้าบทเรียน
- คำว่า **proven สงวนให้ด่านวัดผลเท่านั้น** ทั้ง codebase — rename `provenCount`→
  `lessonsFinished`, `provenPercent`→`finishedPercent`, `isProven`→`isFinished` และ
  copy ทุกจุด (roadmap summary, dashboard, radar, legend, CheckpointQuiz, courses intro)
- **RIL cross-model 4 รอบ** — จับ: mutation `eligible=true` ไม่ถูกเทสจับเลย (เทสไม่เคย
  ดูการ์ดจริง) · blocker ระดับคอร์สสร้างลิงก์ไป node ที่ไม่มีอยู่ · เทสเดินด้านเดียว
  ของเงื่อนไขสองชั้น · คำว่า proven ที่ยังหลงเหลือ 3 รอบติด
- ข้อจำกัดที่ยังเปิด: mutation "ลบ guard `assessedTotal > 0`" ยังไม่มีเทสจับ เพราะ
  ไม่มีคอร์สจริงที่ไม่มี capstone (logic มี unit คุมผ่าน `courseIssue`) — ปิดเมื่อมี fixture
- chain: vitest **262** · playwright **91 + 10 skipped**
- **หนี้ระบบที่พบ**: ภาพ artifact ที่ track ไว้ถูก e2e regen ทุก run เพราะฝัง
  อีเมล `e2e-learner-<timestamp>` ใน header → byte ต่างตลอด (เทียบภาพแล้วเนื้อหา
  เหมือนเดิม จึง `git restore` ทุกครั้ง) — ควรแก้ให้ e2e ไม่เขียนทับ artifact
  ที่ track หรือ mask อีเมลตอน capture

---

## Objective

Stand up **CyberSkills Academy** (cert exam-prep courses + sold mock tests +
trend-driven pro courses). **Founder เคาะ 2026-07-31: build-first** — สร้าง
platform (DIY) ทันทีแบบ content-agnostic; การเลือก course catalog + demand
validation ต่อ course เป็นรอบ pitch + poll ของ founder ภายหลัง (Phase 0 deferred).

---

## Current phase: **PLATFORM BUILD — founder เคาะ 2026-07-31 (Phase 0 = DEFERRED)**

> **Founder decision (in-session, 2026-07-31):** ถือว่ามี demand — เริ่ม build
> platform ทันที; **Phase 0 (validate demand) ไม่ทิ้ง แต่ defer**: จะกลับมาทำตอน
> เคาะว่าจะทำ course อะไรบ้าง โดย **founder จะไป pitch + poll ผ่าน channels
> ต่างๆ เอง** (ใช้ channel inventory จาก Lane B —
> `reports/reviews/channel-inventory-2026-07-31.md` — เป็น input ของรอบนั้น);
> ระหว่างนี้ build ทุกส่วนแบบ **content-agnostic** (player/engine เสพ Crucible
> portable JSON — ไม่ผูก course ใด course หนึ่ง)
>
> **CAS-005 gate: ตัดออกจากแผน (founder 2026-07-31)** — ไม่ได้ focus course ใด
> ตอนนี้; ตัว key fix เสร็จสมบูรณ์แล้ว (Crucible `640c8613`, verify 29/29) —
> ถ้าวันหน้าจะเอา bank ออก public ค่อยตัดสินใจเรื่อง confirm pass ตอนนั้น
>
> **CPO note:** demand validation ต่อ course จะเกิดตอนรอบ pitch + poll ของ
> founder → การ build ตอนนี้เสี่ยงต่ำลงเพราะเป็น foundation ที่ vision ที่ล็อก
> ต้องใช้อยู่ดี + recurring cost ~0 บน owned infra

### Build roadmap (content-agnostic, ยึด infra + implementation ที่ล็อก 2026-07-31)

- [x] **M1 — Foundation:** ✅ **เสร็จ 2026-07-31 (local acceptance ครบ)** —
  `academy-web/` build+lint+test+e2e เขียวจาก `npm ci` บน local Supabase จริง;
  landing + PDPA + lead capture + schema `academy` RLS default deny
  (ดู `completed_log.md` entry 2026-07-31 one-shot executed); ส่วน deploy
  Vercel `sin1` / CNAME / Zero Trust = external checkpoints รอ founder ตาม
  `PENDING_USER_ACTION.md` §1–3 (ห้ามทำใน AFK)
- [x] **M2 — Course player (commodity core):** ✅ **เสร็จ 2026-07-31** — loader
  เสพ Crucible portable JSON + practice (explanation/pool/shuffle/retake) +
  timed exam (deadline timer/resume) + PBQ checks/select/order + exhibit +
  scoring spec + module nav + progress + axe + visual matrix; fixture =
  CAS-005 internal (นับจริง 150 MCQ — เลข 165 ในแผนเดิมคลาดเคลื่อน); video
  slot เป็น placeholder จนกว่า commit CF Stream (M5)
- [~] **M3 — Identity + personalized path v0** — 🟡 **แกนหลักเสร็จ 2026-08-01**
  (auth ครบวงจร + gating + progress ผูกบัญชี พิสูจน์บน Cloudflare runtime แล้ว;
  เหลือ Google sign-in ที่ต้องใช้ OAuth credential จริง และหน้าโปรไฟล์/ชื่อจริง)
  (founder เคาะ ADR ครบ 5 ข้อ; ดู `docs/adr/ADR-draft-single-account.md` §0)
  - **เคาะแล้ว:** Option A (shared issuer Pool A GoTrue + identity contract) ·
    เปิด asymmetric JWT/JWKS · consent ecosystem · **บังคับสมัครถ้าจะใช้**
    (founder overrule คำแนะนำเดิม — เหตุผล: ค่า infra ต่อหัวไม่ใช่ศูนย์ โดยเฉพาะ
    lab compute ใน M4 + การสมัครเป็น filter ของความตั้งใจ) · login = email OTP
    **และ** Google
  - **Account = universal CYBERSKILLS account** ไม่ใช่ account ของ Academy —
    หน้าสมัครพูดในนาม CYBERSKILLS, ครอบทุกบริการ, **รวมถึง certification ที่เรา
    อาจออกเองในอนาคต** → identity ต้อง verified email ตั้งแต่วันแรก และห้ามถอย
    ไปใช้ email เป็น join key (ใช้ `(issuer, subject)`)
  - **ขอบเขต gate:** ทุกอย่างที่ "ใช้" ต้องมี account (บทเรียน/quiz/lab/progress)
    ส่วนหน้าร้าน (landing, รายการคอร์ส, หน้าแนะนำคอร์ส) เปิดสาธารณะ — เพราะเป็น
    สิ่งที่ทำให้คนอยากสมัคร และเป็นหน้าเดียวที่ search + การแชร์ลิงก์เข้าถึงได้
    ซึ่งสำคัญเพราะ "หา distribution channel ไม่ได้" ยังเป็นข้อเปิดในแผน
  - **ทำได้เลยบน local Supabase:** ตาราง `academy.users` `(issuer, subject)` ·
    หน้าสมัคร/เข้าสู่ระบบ · route gating · ย้าย progress จาก browser → DB ·
    ผูก waitlist lead ↔ account ด้วย verified email ณ เวลา sign-up
  - ⚠️ ก่อนแตะ Pool A ทุกครั้ง อ่าน `ecosystem/SHARED_INFRA_ACCESS.md` และ `reports/state/supabase.md`
    ของ director repo ก่อน — เป็น shared infra ที่ Crux/STAR/Forge ใช้ร่วมกัน
  - **ติด external checkpoint:** asymmetric JWT/JWKS บน Pool A (founder เท่านั้น —
    `PENDING_USER_ACTION.md` §4.1) · ระหว่างรอ ให้ verify ฝั่ง server ไปก่อน
    (แบบ Crux) ซึ่งไม่ต้องใช้ JWKS
  - **ต้อง DD สดตอนลงมือ:** ความสามารถ asymmetric JWT ของ GoTrue เวอร์ชันที่รันจริง

- [ ] **M3.5 — Certificate of completion** (founder เพิ่ม 2026-08-01: Academy ต้อง
  ออกใบรับรองเมื่อเรียนจบคอร์ส)
  - ✅ **claim ล็อกแล้ว 2026-08-05** — `Certificate of Course Completion`; เรียนครบ
    ทุก requirement และผ่าน required assessed checkpoint ทุกด่าน; ระบุชัดว่าไม่ใช่
    professional certification
  - ✅ **กติกา course record สองชั้นทำแล้ว** — `courseRecordSummary()` ใน
    `src/lib/course/roadmap.ts`: บททั่วไปต้องทำครบในฐานะความคืบหน้า และ capstone
    ทุกจุดต้องผ่านในฐานะ assessed evidence; การข้ามกั้น record แต่กลับมาทำได้
  - [ ] **W4 ต้องตัดสินจากหลักฐานจริง** — ห้ามออกใบจาก progress status อย่างเดียว;
    ต้องตรวจและ snapshot passing attempt/simulation evidence + course version
  - [ ] **ต้องมี account ก่อน** (ขึ้นกับ M3) — ใบรับรองเอ่ยชื่อคน จึงออกให้คนที่
    ไม่มีตัวตนไม่ได้ ข้อนี้ยืนยันการตัดสินใจบังคับสมัครของ founder อีกทาง
  - [ ] **ชื่อบนใบ** — ต้องมีฟิลด์ชื่อจริงตอนสมัคร (email อย่างเดียวไม่พอ) และ
    ต้องแก้ได้ก่อนออกใบ เพราะพิมพ์ผิดแล้วออกไปแล้วแก้ยาก
  - [ ] **ต้อง verify ได้ตั้งแต่ใบแรก** — ใบที่ตรวจสอบไม่ได้คือรูปภาพที่ใครก็ทำปลอมได้
    ต้องมี id + หน้า verify ตั้งแต่วันแรก **ย้อนหลังใส่ให้ใบที่ออกไปแล้วไม่ได้**
  - [ ] **PDPA** — หน้า verify เปิดเผยชื่อ + คอร์ส ต้องให้ผู้เรียนเลือกได้ว่าจะให้
    ตรวจสอบสาธารณะไหม และหน้า verify ต้องไม่ให้ search engine เก็บ index
  - [ ] แยกให้ชัดจาก **certification exam** (ที่ founder พูดถึงว่าอาจทำเอง) —
    completion = จบคอร์สนี้ · certification = สอบผ่านมาตรฐานที่เราออก คนละน้ำหนัก
    ห้ามให้หน้าตาใบเหมือนกันจนคนเข้าใจผิด

- [ ] **M4 — Lab gate:** เสียบ Crux lab plane (แยก GCP project + budget alarm),
  checkpoint-lab flow + credit meter v0 (ภายใน)
- [ ] **M5 — Commerce + video:** credit ledger จริง + edition/pricing logic +
  payment gateway ไทย (DD เลือก vendor ตอนนั้น) + commit Cloudflare Stream +
  custom player (ห้าม iframe embed ตามเงื่อนไขที่ล็อก)

### Hosting — ยังไม่ตัดสิน (พิสูจน์แล้วว่าไปได้ทั้งสองทาง 2026-08-01)

founder ถามเรื่องย้าย frontend ไป Cloudflare — **ข้อเท็จจริงสำคัญ: ยังไม่เคย deploy
ขึ้น Vercel เลย** จึงไม่ใช่การย้าย แต่คือการเลือกก่อนลงครั้งแรก ต้นทุนตอนนี้ ≈ ศูนย์

พิสูจน์ด้วยการ build + รันบน workerd จริงในเครื่อง (`wrangler dev`):
- ตอนแรกพัง 3 หน้า ด้วยสาเหตุเดียว: `fs.readFileSync is not implemented`
- **แก้ที่ต้นเหตุแล้ว** — เนื้อหาผูกเข้ามาตอน build ผ่าน `registry.generated.ts`
  (`scripts/generate-content-registry.mjs` + เทสกันล้าสมัย) ไม่มีการอ่านดิสก์ตอน
  request อีก **ได้ประโยชน์ไม่ว่าจะเลือกทางไหน**
- ผลล่าสุด: ทุกหน้า 200 บน workerd พร้อมเนื้อหาจริง · `next/og` ใช้ได้ ·
  worker 2.2 KB + assets 1.8 MB (เพดานฟรี 3 MiB)
- `src/lib/content/source.ts` (engine ของ /player ที่เป็น internal-only) ยังอ่าน
  ดิสก์อยู่ — ไม่แก้เพราะ /player ห้าม deploy public อยู่แล้ว **ถ้าจะขึ้น Cloudflare
  จริงต้องกันเส้นทางนี้ออกจาก bundle หรือแปลงให้เหมือนกัน**

ยังไม่ตัดสิน เพราะข้อที่เหลือไม่ใช่เรื่องเทคนิค: **DB อยู่กรุงเทพที่เดียว** หน้าร้าน
เป็น static/SSG หมด (edge ชนะขาด) แต่หน้าที่ล็อกอินแล้วต้องคุย DB ข้ามทวีป
→ ต้องวัดจริงหลัง M3 มี progress ลง DB แล้ว ไม่ใช่เดา (Smart Placement อาจช่วย
แต่ยังไม่ยืนยัน)

### Simulation challenge — โจทย์จำลองหน้าจอจริง (founder เพิ่ม 2026-08-01)

**ปัญหาที่แก้:** อ่านเรื่องตั้งค่า WPA2 / DHCP / GPO จบแล้วยังไม่รู้ว่าหน้าจอจริงหน้าตา
อย่างไร ความมั่นใจไม่เกิด และผู้เรียนเองก็รู้ว่ายังไม่รู้จริง เครื่องจริงก็ไม่มีให้ทุกคน

**ทำแล้ว (v1):**
- contract + engine ตัดสิน: `src/lib/simulation/types.ts` — ตัดสินจาก**สถานะสุดท้าย**
  ไม่ใช่ลำดับการคลิก (ของจริงมีหลายทางไปถึงผลเดียวกัน การบังคับลำดับ = สอนให้ท่องขั้นตอน)
- surface แรก: `network-interface` (หน้า IPv4 properties) — เลือก DHCP แล้วช่องกรอกปิด
  กด OK แล้วได้ค่ามาจาก "เซิร์ฟเวอร์" จริง
- block kind `simulation` ใน content contract + loader validation
- บทเรียน demo: สองโจทย์บนหน้าจอเดียวกันที่**คำตอบตรงข้ามกัน** (print server ต้อง static ·
  laptop ที่ย้ายที่ต้อง DHCP) — สอน "ทำไมถึงมีสวิตช์นี้" ไม่ใช่สอนกรอกฟอร์ม
- โหมด practice (ตรวจซ้ำได้ บอกทีละข้อว่าอะไรค้าง แต่ไม่เฉลยค่า) กับ assessed
  (ตรวจครั้งเดียว บอกแค่ผ่าน/ไม่ผ่าน) — ต่างกันที่ผลตอบกลับ ไม่ใช่ต่างที่หน้าจอ
- คำใบ้โผล่หลังลองเองสองครั้ง และมีเทสคุมว่าคำใบ้ห้ามเฉลยค่าที่ต้องกรอก

**ยังไม่ทำ:**
- [ ] **เอาไปใช้เป็นข้อสอบ prove it จริง** — โหมด assessed มีแล้วแต่ยังไม่ผูกเข้า
      checkpoint/test-out (ต้องขยาย checkpoint ให้รับ item ที่ไม่ใช่ MCQ)
- [ ] surface เพิ่ม ตามที่ founder ยกตัวอย่าง: WPA2/wireless · AD Group Policy editor
      (GPO เป็นตัวที่ต่างจากของเดิมมากที่สุด — ต้องมี tree + properties pane
      น่าจะเป็น archetype ที่สองของระบบ ไม่ใช่แค่ฟอร์ม)
- [ ] คอร์สเครือข่ายจริงที่บทนี้ควรอยู่ (ตอนนี้ฝากไว้ในคอร์ส demo)
- [ ] ให้ Crucible ผลิต simulation ได้ (ตอนนี้เขียนมือใน JSON ของบทเรียน)

### Identity Control — ทิศทางที่ล็อกแล้ว และสิ่งที่ Academy ทำไปแล้ว (2026-08-01)

**ทางเข้ากลางคือ `accounts.cyberskills.co.th`** ทั้งสมัครและเข้าสู่ระบบ · Academy
redirect ไปที่นั่นพร้อม client_id / redirect_uri / state / PKCE / nonce / service_id
แล้วรับ **one-time code + state กลับมาทาง browser เท่านั้น** · backend แลก code ด้วย
PKCE verifier แล้วได้ (issuer, subject, verified email, service_id, nonce,
activation status/revision) · **ไม่มี cookie ระดับโดเมนแม่**

**สี่ชั้นสถานะ และชั้นก่อนหน้าไม่เคยแปลว่าได้ชั้นถัดไป:**
`account exists → service activation → product entitlement → resource authorization`

**Academy เป็นเจ้าของเอง:** academy.users/profile, purchase, invitation, course access,
progress, quiz, certificate, resource authorization
**Identity Control ไม่แตะของพวกนี้** และ **Academy ห้ามค้นหา/รวม/สร้าง identity ด้วย
email เอง**

#### ทำแล้ว
- [x] adapter boundary หลัง interface + fake (`src/lib/identity/`) — fake บังคับกฎเดียว
      กับของจริง (code ใช้ครั้งเดียว · PKCE · redirect_uri ตรงเป๊ะ · หมดอายุ) ไม่ใช่
      stub ที่ตอบ ok เสมอ
- [x] registry ที่**ปฏิเสธ adapter ปลอมบน production ตั้งแต่ตอนเรียก**
- [x] callback route เตรียมไว้ (`/auth/callback`) — ยังไม่ต่อจริง และ**ปฏิเสธ callback
      ที่มี subject/email/token/otp/invite ติดมาใน URL** เพราะนั่นแปลว่าอีกฝั่งผิดสัญญา
- [x] migration 0004: `service_activation` (สำเนาจาก Identity Control พร้อม revision)
      แยกจาก `course_entitlement` (Academy เป็นเจ้าของ) + ฟังก์ชัน
      `has_course_entitlement` เพื่อให้มีคำตอบเดียวที่ทุกเส้นทางใช้ร่วมกัน
- [x] เทส 11 ข้อยืนยันว่า **เปิดใช้บริการสำเร็จไม่ได้ให้สิทธิ์คอร์สใดเลย** ·
      suspended ใช้บริการไม่ได้แต่สิทธิ์คอร์สยังอยู่ (คนละชั้น) · เพิกถอน/หมดอายุ
      ใช้ไม่ได้แต่ยังตอบได้ว่าเคยมี
- [x] session เป็น host-scoped อยู่แล้ว (ไม่มีการตั้ง domain ที่ไหนในโค้ด)
- [x] map ด้วย (issuer, subject) และ email เป็น attribute ที่เปลี่ยนได้ — ทำไว้ตั้งแต่ M3

#### ยังไม่ทำ
- [x] เสียบ activation + `has_course_entitlement` + node prerequisite เข้าเส้นทาง
      lesson/progress/attempt/explanation/practice/reset ผ่าน guard กลาง
- [~] local transaction contract ฝั่ง backend (เก็บ state/PKCE verifier/nonce) พร้อม
      fake-first tests แล้ว; durable store และ callback runtime รอ registered runtime
      inputs กับ authorization จาก Identity Control
- [ ] `/sign-in` เปลี่ยนเป็น redirect ไป Account Center — **ทำเมื่อ Identity Control
      พร้อมต่อจริงเท่านั้น**
- [ ] adapter ตัวจริงที่คุยกับ Identity Control (รอ P3 provider/persistence + release gates)

#### ⚠️ ข้อขัดสองข้อ — **session identity เป็นคนตัดสิน Academy ปรับตาม** (founder 2026-08-01)

Academy จะไม่แก้สองข้อนี้เอง และไม่แตะ Pool A เพื่อแก้มัน แค่ส่งข้อมูลให้ session
identity ตัดสิน แล้วรอรับผลกลับมาปรับ
- **Academy ถือ `SUPABASE_SERVICE_ROLE_KEY` ของ Pool A** ซึ่งเป็น shared service-role
  ที่ทิศทางระบุว่า "ห้ามถือ" — ใช้เขียนสคีมา `academy` ของตัวเอง
  ทางแก้: สร้าง Postgres role เฉพาะที่ grant แค่สคีมา `academy` แล้วให้ Academy ถือ
  ตัวนั้นแทน (ต้องทำฝั่ง Pool A จึงเป็นงานของ founder/session identity ไม่ใช่ของ session นี้)
- **Pool A ตั้ง `GOTRUE_COOKIE_DOMAIN=.cyberskills.co.th` ไว้แล้ว** ซึ่งขัดกับข้อ
  "ไม่มี shared parent-domain cookie" — cookie ของ Academy เองเป็น host-scoped
  แต่ค่าที่ตั้งไว้ที่ GoTrue ควรถูกทบทวนโดย session identity

#### สิ่งที่ Academy จะต้องรื้อถ้าทิศทางเปลี่ยน
`/sign-in` ของ Academy (รหัส 6 หลักผ่าน GoTrue โดยตรง) เป็นของชั่วคราวและ **ไม่ควร
เปิดใช้บน production** — ดังนั้นการลงแรงทำ rate limiter แบบ distributed ให้ OTP ของ
Academy เองเป็นงานที่จะถูกทิ้ง ความรับผิดชอบนั้นย้ายไปอยู่ที่ Identity Control
(ปรับลำดับงานตามนี้แล้ว)

### ความปลอดภัย — ที่แก้แล้ว และที่ยังเปิดอยู่ (review 2026-08-01)

รีวิวข้ามโมเดลรอบภาพรวม (codex, persona: hostile appsec) แล้วพิสูจน์ทุกข้อด้วยการ
โจมตีจริง ไม่เชื่อรายงานทันที

**แก้แล้ว — CRITICAL:** client ประกาศเองได้ว่า 'เรียนจบ' → ยิง 10 request ได้ครบ
คอร์สโดยไม่ตอบคำถามเลย และมีสิทธิ์ใบรับรอง (พิสูจน์ 10/10 ก่อนแก้ · 0/10 หลังแก้)
ตอนนี้ client ส่งได้แค่ action/answers เซิร์ฟเวอร์ตรวจกับเฉลยเอง + เทสกันย้อนกลับ

**ยังเปิดอยู่ — ต้องปิดก่อนเปิดสมัครจริง:**
- [ ] **HIGH · เดารหัส OTP ได้** — rate limit อยู่ใน memory ของ process และ key มาจาก
      header ที่ปลอมได้; บน Workers แต่ละ isolate มี memory แยก รหัส 6 หลัก = ล้านค่า
      → ต้องใช้ limiter แบบ distributed (KV/DO/Redis) จำกัดทั้ง IP และ email
      และล็อก challenge หลังผิดกี่ครั้ง
- [x] **HIGH · ไม่มี entitlement ต่อคอร์ส** — ปิดใน app paths ด้วย activation +
      entitlement + node prerequisite guard; `/media/*` ยังแยกเป็น launch gate ด้านล่าง
- [ ] **MEDIUM · ไฟล์บทเรียนอยู่ใน public/** — วิดีโอ/PDF โหลดได้โดยไม่ล็อกอิน
      ขัดกับมติ "ต้องสมัครถ้าจะใช้"
- [ ] **MEDIUM · shouldCreateUser:true บน endpoint สาธารณะ** — ยิงอีเมลจำนวนมากได้
- [ ] **MEDIUM · MAX_TRACKED_KEYS ไม่ใช่เพดานจริง** — memory โตไม่หยุดจาก IP ปลอม

### การป้องกันเนื้อหา · refund · เครดิต — ข้อสรุปจากการคุย 2026-08-02

#### จุดยืนที่ founder เคาะ
**ยอมรับว่ากันคนที่อ่านช้าๆ แล้วก๊อปไปเรื่อยๆ ไม่ได้ และไม่เป็นไร** — เพราะคูเมืองจริง
คือ lab + simulation + ใบรับรองที่ verify ได้ + ประสบการณ์ใช้งาน ซึ่ง clone ไม่ได้
เป้าหมายจึงเป็น **"ทำให้การขโมยไม่คุ้ม"** ไม่ใช่ "ทำให้ขโมยไม่ได้" และโฟกัสที่การกัน bot

> ⚠️ **คูเมืองคือ "การร้อยกัน" ไม่ใช่ชิ้นส่วนใดชิ้นเดียว** (founder แก้จุดเน้น 2026-08-02)
>
> lab อย่างเดียวไม่ใช่คูเมือง — แพลตฟอร์มอื่นก็มี lab สิ่งที่ลอกยากจริงคือการที่
> **วิดีโอ + คำถามคั่น + checkpoint + simulation + lab อยู่บนแกนเดียวกัน** โดยมี
> progress และ "หลักฐานว่าพิสูจน์แล้ว" วิ่งผ่านทุกชิ้นและสะสมขึ้นเป็นแผนที่ทักษะเดียว
> คนที่ดูดข้อความหรือวิดีโอไปได้ **ชิ้นส่วน** แต่สิ่งที่เราขายคือ **เส้นทาง**
>
> **ผลต่อลำดับงาน: "รอยต่อที่ยังไม่เชื่อม" มีค่ากว่า "ชิ้นส่วนใหม่"**
>
> รอยต่อที่เชื่อมแล้ว: **checkpoint → course-record gate → แผนที่ความครอบคลุม**
> (W0-3 · ยังไม่ใช่ certificate issuance หรือ skill mastery; W4 ต้อง snapshot
> หลักฐานจริงก่อนออกใบ)
> ⚠️ **คำถามกลางวิดีโอไม่ใช่รอยต่อของแกนหลักฐาน** — มันเป็น *formative* คือมีไว้ให้
> ผู้เรียนตื่นตัวและจับว่าตัวเองเข้าใจผิดตรงไหน ผลถูกบันทึกไว้ใช้ปรับปรุงเนื้อหา
> แต่ไม่ถูกใช้ตัดสินสถานะใดๆ (W0-4 ล็อก) — ถ้าทำให้เป็นด่านจะกลายเป็นการบังคับ
> ให้ดูวิดีโอครบ ซึ่งขัดกับ "แผนที่ ไม่ใช่คิว"
> **รอยต่อที่ยังขาด: simulation (มีโหมด assessed แล้วแต่ยังไม่ต่อเข้า checkpoint) · lab**
> → การทำ simulation surface อันที่สองก่อนต่ออันแรกเข้าแกน = ผิดลำดับ

#### กัน bot — ลำดับที่ตกลง
- [ ] **1. Turnstile เมื่อพฤติกรรมผิดปกติ** (Cloudflare มีให้ใช้อยู่แล้ว) — คุ้มที่สุด
      เพราะเก็บค่าใช้จ่ายจากคนที่น่าสงสัยเท่านั้น คนอ่านปกติไม่เจออะไรเลย
- [ ] **2. ย้าย rate limiter ไปที่เก็บถาวร + วัดความเร็วต่อบัญชี** (ไม่ใช่ต่อ IP —
      เขาล็อกอินอยู่แล้ว และ IP หมุนได้) วัด: บทต่อชั่วโมง · เวลาที่อยู่ในบท ·
      **ความเร็วในการผ่าน checkpoint** ปลดหนี้ in-memory limiter ไปด้วย
- [ ] **3. ลายน้ำต่อบัญชี** — เพื่อสาวกลับได้เมื่อเนื้อหาหลุด (หลักฐาน ไม่ใช่กำแพง)

#### ❌ ตัดสินว่าไม่ทำ: ล็อกบทธรรมดาจนกว่าจะพิสูจน์บทก่อนหน้า
เหตุผล:
- ด่านที่เป็น MCQ **AI ผ่านง่ายกว่าคนรีบๆ ด้วยซ้ำ** จึงกันคนขี้เกียจก๊อปได้ แต่กัน
  AI crawler ที่ตั้งใจได้น้อย
- **เปลี่ยน "ค้าง" ให้เป็น "เลิก"** — วันนี้คนที่ทำ checkpoint ไม่ผ่านยังข้ามแล้วเรียนต่อ
  ได้ ยังอยู่ในระบบ ถ้าล็อกคือติดอยู่บทเดียวแล้วหายไปเลย ราคานี้แพงกว่าประโยชน์

**ทำแทน: เพิ่มความถี่ของ capstone** — capstone ข้ามไม่ได้และต้องตอบถูกทุกข้อโดย
เซิร์ฟเวอร์ตรวจอยู่แล้ว คอร์ส 10 บทที่มี capstone 3 จุดบังคับให้ crawler ผ่านของจริง
3 รอบ ได้ผลใกล้เคียงการล็อกทุกบท แต่ผู้เรียนไม่มีทางตัน
**และเป็นการตัดสินใจเรื่องเนื้อหา ไม่ใช่โค้ด** — แก้ `course.json` ถอยกลับได้ทันที
- [ ] ทดลองกับ Basic OS & Linux: ย้าย capstone จากจุดเดียวตอนจบ เป็น 3 จุด

#### กฎ UX ที่ต้องยึดไม่ว่าจะเลือกทางไหน
**ล็อก ≠ มองไม่เห็น · ล็อก ≠ ไปไม่ถึง**
บทที่ล็อกต้องบอกได้ทุกอย่างที่ใช้ตัดสินใจ (ชื่อ · สาระที่ครอบคลุม · เวลา · **ทำไมล็อก** ·
**ทำอะไรถึงเปิด**) และต้องมีปุ่ม "ฉันรู้เรื่องนี้อยู่แล้ว ขอพิสูจน์เลย" เสมอ
— กลไกเดียวกันแต่ความรู้สึกคนละขั้ว: "ระบบควบคุมคุณ" กับ "เกมบอกด่านถัดไป"
เหตุผลที่สำคัญเป็นพิเศษ: **การแอบดูคือข้อมูลที่ใช้ตัดสินใจ ไม่ใช่ทางลัด** ปิดทางลัด
= ต้องออกแรงหน่อย · ปิดการมองเห็น = "เชื่อฉันไปก่อนสิ" ซึ่งคนละน้ำหนักกับคนที่จะจ่ายเงิน

#### Refund — เสนอไว้ ยังไม่เคาะ
กรอบที่ใช้ได้ไม่ใช่ "คืนของ" (ความรู้คืนไม่ได้) แต่คือ **"เราส่งมอบตามที่สัญญาไหม"**
- ชั้น 1: คอร์สฟรีที่เต็มรูปแบบจริง → ตัดสินใจได้ก่อนจ่าย จนแทบไม่ต้องขอคืน
- ชั้น 2: **คืนเงินได้ตราบใดที่ยังไม่มีบทไหนถูกบันทึกว่าพิสูจน์แล้ว** (ภายใน 14 วัน)
  — เกณฑ์นี้**ใช้ได้เพราะเราวัด "การพิสูจน์" ได้แม่น** ซึ่งแพลตฟอร์มอื่นทำไม่ได้
  (เขาต้องใช้ "ดูวิดีโอไม่เกิน x%" ที่กำกวมและโกงง่าย) และมันตรงกับสิ่งที่เราขายจริง
- ทางเลือก: คืนเป็นเครดิตแทนเงินสด — ตัดความเสี่ยง chargeback
- ⚠️ **ต้องให้คนรู้กฎหมายไทยดูก่อน** — สินค้าดิจิทัลกับสิทธิผู้บริโภคมีข้อกำหนดของมัน

#### เครดิตจากการเรียนจบ — เห็นด้วย ยังไม่เคาะ ทำตอน M5
ให้รางวัลกับ**การพิสูจน์** ไม่ใช่การจ่ายเงิน ซึ่งตรงกับแบรนด์และแพลตฟอร์มอื่นไม่ทำ
เสียบเข้า `course_entitlement` ที่มี `source: 'grant'` อยู่แล้ว ไม่ต้องสร้างระบบใหม่
**สามกับดักที่ต้องกันตั้งแต่ออกแบบ:**
1. **ฟาร์มคอร์สฟรี** — เรียนฟรี 4 แล้วได้คอร์สเสียเงินฟรี = แจกของให้คนที่ไม่เคยจ่าย
   → เครดิตต้องมาจากคอร์สที่จ่ายเงิน หรือให้คอร์สฟรีมีน้ำหนักต่ำมาก
2. **นับเป็นจำนวนคอร์สจะดันให้เลือกคอร์สง่าย** → ถ่วงน้ำหนักตามระดับ และให้เมื่อ
   พิสูจน์ครบเท่านั้น
3. **เครดิตคือภาระผูกพันทางบัญชี** → ต้องมีอายุและเพดานต่อคน
**ตั๋วสอบ cert มีต้นทุนจริง ต่างจากคอร์สที่ต้นทุนส่วนเพิ่มเกือบศูนย์** → แลกได้ทั้งคู่
แต่คนละราคาเครดิต ซึ่งสื่อสารตรงกับความจริงว่าใบรับรองมีค่ากว่า

### Launch gates (ยังมีผลระหว่าง build)

- Rename currency ก่อน public launch · Crucible capacity assessment ก่อน commit
  free-course catalog
- ห้ามเพิ่ม vendor/จ่ายเงิน service ใหม่โดยไม่มี founder decision (streaming/
  payment DD ตอน M5)
- Auth จริง (M3) ต้องมี ADR ecosystem single-account ให้ founder เคาะก่อน

---

## Phase 0 — DEFERRED (founder decision 2026-07-31; กลับมาตอนเคาะ course catalog)

> Lane A ✅ เสร็จ (CAS-005 disputes ปิด, commit `640c8613`) · Lane B ✅ inventory
> เสร็จ (`reports/reviews/channel-inventory-2026-07-31.md`) · เมื่อถึงรอบเคาะ
> course catalog: **founder pitch + poll ผ่าน channels เอง** โดยใช้ brief Lane B
> เป็น input; validation experiments ด้านล่างเก็บไว้เป็นบริบทของรอบนั้น

### Phase 0 — open items (deferred — ไม่ใช่ execution lane ตอนนี้)
- [x] ~~**Resolve the CAS-005 answer-key disputes**~~ — **✅ RESOLVED 2026-07-31**
  (audit → founder เคาะ → แก้ครบ; รายละเอียดใน `completed_log.md` 2026-07-31)
  - Audit: `reports/reviews/cas005-dispute-audit-2026-07-31.md` — 11 disputes
    verify แล้วเหลือเปิดจริง 3 ข้อ (PBQ-010, M4-082, M4-067); อีก 8+1 ปิดโดย
    review loop; ไม่มี key ใดเคยถูกแก้ก่อน founder decision
  - Founder decision (ลายลักษณ์อักษร 2026-07-31): "แก้ตามแนะนำทั้งหมด" —
    PBQ-010 eradication-ก่อน-recovery, M4-082 +D (Map fields), M4-067 +A
    (Sandbox process)
  - Fix ใน Crucible commit `640c8613`: propagate ครบทุก artifact (bank → v2-build
    → SV2/SV1 → suite → generator), verify 29/29 PASS + adversarial review
    CORRECT-AND-COMPLETE
  - ~~เงื่อนไขก่อน public distribution: codex confirm pass~~ — **superseded
    2026-07-31: founder ตัด gate นี้ออกจากแผนแล้ว** (ตัดสินใหม่เฉพาะถ้าจะเอา
    bank ออก public); Crucible push ยังรอ authorization ตามปกติ
- [ ] **Pick a distribution channel** (the real constraint) — **inventory เสร็จ
  2026-07-31 รอ founder เคาะ**: brief 8 ช่องที่
  `reports/reviews/channel-inventory-2026-07-31.md` (corporate probe 4+1 org /
  FB communities ~25–30k / company social page ต้องตั้งใหม่ / instructor pool /
  สกมช / dev communities / events); ข้อค้นพบสำคัญ: เว็บไม่มี analytics —
  traffic วัดไม่ได้จนกว่าจะติดตัว cookieless. Without a channel, expect ~0 signal.
- [ ] **Publish a free sample** (e.g. ~50 questions, spread across domains) on existing infra at ~$0 — static hosting or a page on the current website. Reskin to the cs- dark theme.
- [ ] **Lead capture at ~$0** — capture email (+ one qualifying field: target exam date) at the results screen, value-first (let them finish + see explanations first), instant unlock (no "check your email" delay), PDPA consent checkbox. Store on owned/free infra (self-hosted Supabase or a free form).
- [ ] **Auto-capture behavioral signals** (no extra friction): completion, score, weakest domain, referrer/UTM — these are the honest signals.
- [ ] **Follow-up email sequence** — (1) deliver result + 1-click feedback; (2) separate invite to Academy + STAR waitlist (let them pick interest). Add at least one willingness-to-pay probe (not just "was it useful?").
- [ ] **Direct corporate probe** — approach 2–3 known organizations re: in-house cert/security training (highest-ticket, fastest real signal).

### Phase 0 — gates / acceptance (set thresholds BEFORE running; review against them, do not rationalize)
- Lead volume in N weeks → measures distribution strength.
- Completion / return rate → measures content-experience quality.
- Willingness-to-pay / pre-sell conversion → the only real demand signal.
- Waitlist conversion (Academy / STAR) → demand for the bigger bets.
- **Go / No-go:** define the number for each that justifies moving to Phase 1.

---

## นิยาม Product + โมเดลราคา/สิทธิ์เข้าถึง (draft จาก founder discussion 2026-07-31)

> ส่วนนี้คือ **spec ของสิ่งที่กำลัง build** (execution ตาม
> `plans/platform-build-oneshot-2026-07-31.md`) — อัปเดต 2026-07-31:
> Phase-0-first ถูก supersede โดย founder decision build-first;
> course catalog ยังรอ founder pitch + poll
> ที่มา + market evidence: `completed_log.md` entry 2026-07-31

### แก่นของ product: personalized, interactive, lab-gated

- **Personalized learning path:** ระบบประเมินว่า user รู้หัวข้อไหนแล้ว (quiz +
  คำถาม interactive ระหว่างดูวิดีโอ) แล้วแนะนำ branch — ข้ามสิ่งที่รู้ โฟกัสสิ่งที่ไม่รู้ —
  และ map เส้นทางกับ career goal ของ user
- **หลักการแก่น (founder):** user ไม่ควรต้องเรียนของที่รู้อยู่แล้ว — *walk steadily on
  the path to their future career* ไม่ใช่พายเรืออยู่ในอ่าง fundamental ไม่รู้จบ
  (fundamental ดี แต่ปริมาณต้องเหมาะสมและเกี่ยวข้อง)
- **User override เสมอ:** จะเรียนของที่รู้แล้วก็ได้ / จะข้ามตามคำแนะนำก็ได้ — และทุกการข้าม
  ได้ **cheatsheet สรุป** เพื่อข้ามอย่างมั่นใจว่าไม่ตกหล่นอะไรสำคัญ (แก้ skip anxiety)
- **Lab เป็นส่วนของ learning experience:** ดูวิดีโอ → ตัดเข้า browser-based lab เป็น
  gate ก่อนผ่าน topic — default บังคับ แต่ต้องมีทางออก test-out/skip + cheatsheet เสมอ
  (lab ที่พัง/ช้าสำหรับคนทำงานคือ "อ่าง fundamental" ตัวใหม่ — reliability ของ gate
  คือทั้งหมดของความน่าเชื่อ)
- **Prove-it lab = กลไก trust ของ skip decision:** test-out ด้วยการทำจริงใน lab
  โกงไม่ได้ เดาไม่ได้ — user เชื่อผลโดยไม่ต้องเชื่อแบรนด์ (ปลดล็อก cold-start trust;
  เหนือกว่า quiz-based ของ CertMaster/Pluralsight)
- **ท่าตอบ content piracy:** ไม่ได้กัน screen capture — แต่ย้าย value จาก content
  (ขโมยได้) ไปที่ system (ขโมยไม่ได้): assessment, path เฉพาะคน, lab grading,
  ความสดของเนื้อหา, report — เหตุผลเดียวกับที่ TryHackMe อยู่ได้ทั้งที่ writeup เกลื่อนเน็ต

### โมเดลราคา + สิทธิ์เข้าถึง

| ชั้น | นโยบาย |
|---|---|
| **Free tier — ขยาย (founder 2026-07-31):** N+, Sec+, ISC2 CC, Basic Linux, Basic Programming | **ฟรีเต็มรูป — ให้หมดทุก feature** (video, practice, lab, cheatsheet, personalized path): เป็น **เครื่องจักรโฆษณา** — "ถ้าของฟรีดีครบเครื่องขนาดนี้ ของจ่ายตังจะขนาดไหน"; ทิ้งตลาด entry-cert commodity (Udemy/Messer) ให้เป็นสนามโฆษณา แล้วให้ paid เหลือแต่ขั้นสูงที่ trust ถูกแก้แล้ว; guardrail เดียว: **lab ผ่านแต้มฟรีรายเดือน** (precedent: Skills Boost 35 credits/เดือน — กัน abuse + เพดานต้นทุน + สอนผู้เรียนรู้จักแต้ม); ต้นทุน ~$0.3–0.5/free active/เดือน (~10–17฿) ถูกกว่า CPC โฆษณา แต่ได้คนเรียนจริง + email + skill data; **release ทีละตัว ไม่พร้อมกัน — founder ยืนยัน ("ค่อยๆเรียกแขก")**: แต่ละคอร์สฟรี = campaign เรียกแขกหนึ่งรอบ (ลำดับเสนอ Basic Linux → N+, รอ founder เคาะ); **refresh วนตาม cert cycle (N+/Sec+ edition ใหม่ ฯลฯ) = ค่าโฆษณา — founder ยอมรับเป็น recurring marketing cost โดยเจตนา** (ออกครบ 5 แล้ววนกลับมาอัปเดตตัวแรกต่อ; ทุก refresh = re-marketing event "อัปเดตล่าสุด" ที่เป็น trust signal ด้วย); Crucible capacity assessment ยังต้องทำเพื่อ size ภาระ (ไม่ใช่เพื่อ justify); หมายเหตุ ISC2 CC: ISC2 แจก training ฟรีเองอยู่ (1M Certified) — ของเราชนะด้วย lab + path |
| Path / Premium / Cert course (เช่น AI Secure Coding, CISSP) | ซื้อขาดต่อ **edition**, access **3 ปีเต็ม — เลขเดียวทั้ง catalog** (ล็อก final 2026-07-31), update ย่อยฟรีภายใน term, โชว์วันที่ "อัปเดตล่าสุด" ชัดเจน |
| หน่วยขายหลัก | **Path/Track** — fundamentals ที่เกี่ยวข้องรวมอยู่ข้างใน (access clock inherit จาก path ที่ซื้อ) |

- **บันไดราคา paid (placeholder รอ WTP probe — discussion 2026-07-31):** เมื่อ
  entry certs ย้ายไปฟรีหมด paid เหลือขั้นสูง: CySA+/Pentest+ ~3,990–4,990฿ ·
  SecurityX/CASP+ ~5,990–6,990฿ · CISSP ~6,990–7,990฿ · trend courses
  ~2,990–4,990฿ · B2B seat 2–3× + lab-verified skill report; anchor ตลาด
  verified 2026-07-31: CertMaster Learn+Labs ≈ $489/12 เดือน, Dion Udemy
  ~$15–30 sale, Dion direct $39–69/เดือน; unit cost ต่อผู้เรียน/คอร์ส ≈ 170–280฿
  → margin ~90% (ก้อนจริงคือ content freshness)
- **Edition clock:** course ผูก cert ใช้รอบของ cert vendor (~3 ปี); fundamentals/trend
  course ใช้ major-version ของเราเอง (ยกเครื่องใหญ่ = edition ใหม่; patch เล็ก = free update)
- **ตัวเลข access — ล็อก final 2026-07-31: 3 ปีเต็ม เลขเดียวทั้ง catalog**
  - เหตุผล (founder): **เอาให้ง่าย** — คำสัญญาเดียว ประโยคเดียว ไม่มีกติกาซ่อน;
    3 ปีครอบหนึ่ง cert cycle เต็ม (~3 ปีทั้ง CompTIA/ISC2) → ไม่มีเคส "ซื้อซ้ำ
    ของเดิมทั้งที่เนื้อหายัง current" โดยธรรมชาติ
  - เทียบ official (verified 2026-07-31): CompTIA CertMaster = 12 เดือนหลัง activate;
    ISC2 self-paced = 90–180 วัน → 3 ปีของเรา = 3 เท่า CompTIA, 6–12 เท่า ISC2
  - ทางเลือกที่พิจารณาแล้วไม่เอา (บันทึกไว้ใน `completed_log.md`): "การันตี 2 ปี +
    auto-extend จนจบ edition" — ปลอดภัยเชิง ratchet กว่า แต่ซับซ้อนกว่า; founder
    เลือกความง่ายและยอมรับว่าเลข 3 ที่ประกาศแล้วจะลดทีหลังไม่ได้
  - เคส edition อายุยาวกว่า 3 ปี (ถ้าเกิด): ต่ออายุให้ฟรีเป็น goodwill รายกรณี —
    ไม่ต้องเป็นนโยบายประกาศ

### เศรษฐศาสตร์ lab: ระบบแต้ม (academy currency)

- **ชื่อ currency: working name = "credit/เครดิต" (ชั่วคราว — ล็อก 2026-07-31):**
  founder ยังไม่ถูกใจชื่อนี้ ตั้งใจเปลี่ยนทีหลัง → **ต้อง rename ก่อน public launch
  เท่านั้น** (เปลี่ยนชื่อ currency หลังมี user จริง = แพงทั้ง UX/docs/ความเชื่อมั่น);
  ชื่อที่เสนอแล้วไม่ผ่าน: UP/Delta/Fuel/Creds/Zenith/ก้าว/Spark/Scala —
  บทเรียน filter: ทุกชื่อต้องรอดประโยคไทย "เติมเงิน 100 ___" โดยไม่ขำ/ไม่กำกวม
- ซื้อ course ได้แต้มติดมา (~100 เป็นเลขแนวคิด) — **calibrate ให้พอ "ทำ lab จบคอร์ส +
  ทำซ้ำทั้งคอร์สได้ 1–2 รอบ"** จากต้นทุนวัดจริงตอน pilot ไม่ใช่จากความรู้สึก
- แต้มหมดซื้อเพิ่มได้ที่ **ราคา ~ต้นทุน infra** — ไม่ใช่ profit line ("คนต้องการเวลาเพิ่ม
  ช่วยแบกค่า infra") — สื่อสารนุ่มๆ ไม่ประกาศ "at cost" เป็นคำมั่นแข็ง (เผื่อ payment fee + buffer)
- **กัน struggle tax / credit anxiety** (คนเรียนอ่อนต้องไม่จ่ายแพงกว่า):
  คิดแต้มต่อ "ครั้ง" ไม่ใช่ต่อชั่วโมง (มีเพดานเวลา + idle auto-stop), **ทำจบได้แต้มคืน
  บางส่วน** (แบบ HTB cubes — Tier 0 คืน 100%, tier สูงคืน ~20%), UI โชว์ "แต้มพอสำหรับ
  lab ที่เหลืออีก ~X รอบ" ไม่โชว์เลขดิบเป็นหลัก
- **แต้ม = abuse defense ในตัว** — idle VM / crypto mining เผาแต้มตัวเอง ไม่ต้องมีระบบตรวจจับซับซ้อน
- **นาฬิกาแต้ม = นาฬิกา access เดียวกัน** (จบปัญหา liability แต้มค้างท่อทางบัญชี);
  upgrade แล้วแต้มค้างยกยอดตาม + ได้แต้มก้อนใหม่ของ edition ใหม่
- **Fixed cost ที่เดินตลอดไม่ว่ามีลูกค้าไหม:** platform floor (เล็ก), video
  storage/streaming (มี floor ไม่แพง), **content freshness = ก้อนใหญ่จริง เป็นเวลา
  มนุษย์/Crucible ไม่ใช่ค่า server** → fund ด้วยยอดขายต่อเนื่อง + B2B ไม่ใช่ค่า access

### นโยบาย upgrade ข้าม edition (pro-rata + floor + free window)

- **ส่วนลด = floor ศิษย์เก่า (~25–30%) + ส่วนเพิ่มตามสัดส่วนเวลา access ที่เหลือ** —
  ซื้อปลาย edition เหลือเวลาเยอะ = ลดเยอะ (founder: กันความรู้สึก "หลังหัก");
  access หมดแล้วก็ยังได้ floor (ศิษย์เก่าที่จ่ายเต็มมาแล้วต้องไม่ได้ 0%)
- **Free-upgrade window:** ซื้อภายใน ~6 เดือนก่อน edition ใหม่ออก → ได้ edition ใหม่
  **ฟรี** — ไม่ใช่แค่ fairness แต่กัน **Osborne effect** (cert vendor ประกาศ retire exam
  ล่วงหน้าเป็น public → ตลาดรอ → ยอดขายแข็งตาย; "ซื้อวันนี้ได้ edition ใหม่ฟรี" ทำให้ช่วง
  transition ขายต่อได้ปกติ)
- Upgrade = เริ่มนาฬิกา access ใหม่บน edition ใหม่; edition เก่ายังเข้าได้จนครบ term เดิม
- **กัน sale-stacking:** ช่วง transition window ไม่จัด sale — ราคาเต็ม + แถม edition
  ใหม่ฟรี คือดีลของช่วงนั้น (ทางเลือกซับซ้อนกว่า: คิดส่วนลดจากราคาที่จ่ายจริง)
- **ประกาศสูตรเป็น public บนหน้า pricing** — เป็นจุดขาย + ตัด negotiate รายเคส +
  เข้าชุด brand โปร่งใสทั้งเส้น (แต้มราคาต้นทุน / วันที่อัปเดต visible / สูตร upgrade เปิดเผย
  = เรื่องเดียวกัน: *platform ที่ไม่หลังหักผู้เรียน*)
- ตัวเลขทั้งหมด (floor %, window, สูตร linear) = **placeholder ตัวอย่าง** รอ calibrate

### Implementation direction — ล็อก 2026-07-31: DIY "build the core, buy the plumbing"

- **ไม่ซื้อ hosted LMS** — product ที่ล็อกไว้ (path engine, prove-it lab gate, ระบบแต้ม,
  edition/pro-rata pricing) **ไม่มีขายใน platform ไหน**; hosted LMS ครอบแค่ส่วน
  commodity (วิดีโอ+quiz) แล้วยังต้อง build ส่วนที่เป็น product ล้อมมันอยู่ดี =
  จ่ายสองต่อ + vendor lock
- **Build:** path engine, credit ledger, edition/pricing logic, course player UX, admin
- **Reuse (มีแล้ว):** lab plane จาก Crux (shared capability), self-hosted Supabase
  (auth+DB), cs- design system, Crucible content pipeline
- **Buy เป็น service (จ่ายตามใช้):** video streaming (signed URL พอ ไม่ต้อง DRM หนัก —
  ยุทธศาสตร์ย้าย value ออกจากวิดีโอแล้ว; candidates เช่น Bunny/Cloudflare Stream —
  **ยังไม่เลือก** ต้อง due-diligence ตอนใช้จริง), payment gateway ไทย (candidates เช่น
  Stripe/Opn/2C2P — **ยังไม่เลือก**)

### Infra direction — founder เคาะ 2026-07-31

- **Phase 0 web = Vercel (ล็อก):** `academy.cyberskills.co.th` CNAME (Cloudflare) →
  Vercel region `sin1` (ใกล้ Supabase self-host; pattern เดียวกับ product อื่น);
  admin/preview ครอบ Cloudflare Zero Trust Access จนกว่าจะพร้อม public
- **DB = Supabase self-host เดิม** (leads + consent PDPA + signals; ต่อไปคือ auth/
  credit ledger/progress ตาม ADR) — video/ไฟล์หนักไม่เข้า DB เด็ดขาด (object
  storage + CDN เท่านั้น; DB เก็บ metadata + token)
- **Video (post-gate) = managed stream, Cloudflare Stream เป็น front-runner**
  (founder อนุมัติแบบมีเงื่อนไข): **เงื่อนไข interactive video ต้องไม่เสีย** —
  verified 2026-07-31: Stream เสิร์ฟ HLS/DASH manifest มาตรฐาน + signed token
  ให้ custom player ได้ (hls.js/Video.js/Shaka/AVPlayer/ExoPlayer) → ชั้น
  interactive (pop-up คำถาม, pause ที่ cue point, กัน seek ข้ามคำถาม) เป็น player
  logic ฝั่งเรา ไม่ผูก vendor; **design guard: ห้าม build lesson player บน iframe
  embed ของ Stream** — ต้องเป็น custom player เสพ manifest; ตัวเลข pricing
  (verified 2026-07-31: $5/1,000 นาทีเก็บ + $1/1,000 นาทีส่ง, encode ฟรี)
  re-verify อีกครั้งตอน commit จริง; Bunny ยังเป็น fallback ได้เพราะ HLS มาตรฐาน
  เหมือนกัน
- **Lab = GCP — ล็อก (founder 2026-07-31):** ใช้ shared lab plane จาก Crux ต่อ
  ("ไม่อยาก rebuild ทุกอย่างใหม่หมด") — แยก GCP project + budget alarm ของ
  Academy; credit ledger เป็นตัว meter ต้นทุน
- **Course assets ที่ไม่ใช่ video** (lab images, ไฟล์แจก) = R2 (egress ฟรี);
  DB backup → R2 ตาม pattern ปัจจุบัน; RDC คงบทบาทเดิม (host self-host stack)
- **Cloudflare cost model (verified จาก official docs 2026-07-31):** Stream
  storage = **prepaid capacity** ซื้อเป็นบล็อก $5/1,000 นาที content (นับความยาว
  video ไม่เกี่ยว resolution; encode+ingress ฟรี), delivery = $1/1,000 นาทีที่ถูกดู
  (นับ HLS/DASH/player ทุกแบบ); **ไม่มี free allowance** (ข้อมูล blog ภายนอกที่ว่า
  Pro/Business แถมนาที — ไม่อยู่ใน official docs, อย่าใช้วางแผน)
  - สูตร: ค่า Stream/เดือน ≈ ⌈นาที catalog/1,000⌉×$5 (ช่วงที่ catalog โต) +
    (ผู้เรียน active × นาทีดูเฉลี่ย)/1,000 × $1
  - ตัวอย่าง: pilot (catalog 10 ชม., 50 คน×200 นาที) ≈ **$15/เดือน**; growth
    (30 ชม., 200 คน×300 นาที) ≈ **$70/เดือน**; scale (60 ชม., 500 คน×400 นาที)
    ≈ **$220/เดือน** — ต้นทุน video ต่อผู้เรียน ~$0.2–0.4/คน/เดือน จิ๋วเทียบราคา
    คอร์สซื้อขาด; personalized path ยิ่ง skip มาก delivered minutes ยิ่งลด = ถูกลง
  - R2 (assets/backup): ~$0.015/GB/เดือน, egress ฟรี; Zero Trust Access ใช้
    free tier ได้ถึง ~50 seats (ตรวจ plan จริงตอน setup); Phase 0 ไม่มี video
    → ค่า Cloudflare ส่วนเพิ่ม ≈ $0
- **หมายเหตุประวัติ (เขียนก่อน build-first):** เดิมเฟรมว่า "ไม่ขัด
  validate-before-invest" เพราะ recurring ~ศูนย์ — ตอนนี้ founder เคาะ
  build-first แล้ว (2026-07-31) ประเด็นนี้จบ; ลำดับ build เดิมที่บันทึกไว้:
  1. Slice แรกของ stack จริง = ตัว Phase 0 เอง (placement test + free sample +
     lead capture บน foundation จริง ไม่ใช่ของ throwaway)
  2. ผ่าน gate → build ต่อบน foundation เดิม: course player → lab gate (เสียบ Crux
     capability) → credit + payment — ไม่มีจังหวะย้ายบ้าน

### Auth — ทิศทาง: single account ทุก product (founder 2026-07-31)

- **Requirement:** user มี 1 account เข้าได้ทั้ง Crux, STAR, Academy, **Forge**
  (และ product อนาคต) — ยกระดับจากหลัก "single email-based identity" เดิมใน
  `AGENTS.md` เป็น cross-product identity จริง
- **นี่คือ decision ระดับ ecosystem ไม่ใช่ของ Academy คนเดียว** — แตะ STAR (มี login
  เดิม) และ Crux (มี auth-transport threat model + zero-friction ILT flow ที่ห้ามพัง)
  → ต้องยกเป็น **ADR ระดับ director/ecosystem ก่อนเริ่ม build auth จริง** (open item)
- แนวทางที่ ADR ต้องประเมิน (ทั้งหมดเป็น candidates — **ยังไม่เลือก**): shared issuer
  บน self-hosted Supabase Auth ที่มีอยู่ / dedicated self-hosted OIDC IdP /
  ทางเลือกอื่นตาม due diligence ณ วันทำจริง
- **สิ่งที่ทำได้เลยราคาถูก (ไม่ต้องรอ ADR):** Phase 0 lead capture ใช้ **email เป็น
  identity key** ตั้งแต่วันแรก; ออกแบบ Academy auth ให้ **consume external issuer ได้**
  (ไม่ hardcode auth ผูกกับตัวเอง)
- **ข้อควรระวังใน ADR:** PDPA — identity ข้าม product = PII ใช้ร่วม, consent ต้องครอบ;
  migration path ของ account เดิมใน STAR; ห้ามเพิ่ม friction ให้ Crux ILT onsite flow

### ขอบเขต ecosystem (ห้ามเบลอ)

- **Crux = ILT-only ใช้ภายใน ไม่ขาย** (ล็อกใน crux `context/product-direction.md`) —
  Academy ใช้ **หลักการ + lab-plane capability** (zero-install browser lab, per-learner
  VM/container, money-safety teardown discipline) ผ่าน decision ใหม่ ไม่ยืด Crux เป็น
  Academy backend
- **เส้นแบ่งกับ STAR (ต้อง record เป็นลายลักษณ์อักษรตอน planning):** Academy =
  "checkpoint lab" (สั้น, guided, ผูก topic, หลักนาที) vs STAR = "scenario lab"
  (cinematic, story-driven, immersive) — คนละ granularity เติมกัน
- ภาพระยะยาว: lab plane เป็น **shared capability ตัวเดียว** เสิร์ฟ 3 ทาง — Crux ILT,
  Academy checkpoint labs, train-the-trainer lab seats (ลงทุนก้อนเดียวใช้สามทาง)
- **ผลต่อ Phase 1 platform decision:** hosted-LMS ล้วนไม่พอ (ทำ lab-gated แบบนี้ไม่ได้
  native) → lab plane ควรเป็น **service แยกที่ embed ได้** (iframe/LTI) —
  content / delivery / lab แยกชั้น ไม่แต่งงานกับ platform ไหน
- **B2C↔B2B ใช้ primitive เดียวกัน:** credit ledger = ระบบคิดเงิน lab seat ฝั่ง
  corporate/train-the-trainer; pitch "lab-verified skill report ของทีม" แรงกว่า quiz-based

### Guards เชิงกลยุทธ์ (อย่าหล่น)

- **Distribution + trust ยังเป็น binding constraint** — build-first (founder
  2026-07-31) แก้ฝั่ง product ไม่ใช่ฝั่ง distribution; การลงทุน content ต่อ
  course ยังต้องรอผล pitch + poll ของ founder — ห้าม commit catalog เอง
- **Phase 0 synergy (ทดสอบ concept ได้เกือบฟรี):** reframe free CAS-005 sample เป็น
  **"placement test — รู้จุดอ่อนใน 30 นาที ไม่เสียเวลาเรียนของที่รู้แล้ว"** แล้ววัดว่า
  messaging ไหนดึง lead กว่า = validation ของ desirability จากพฤติกรรมจริง;
  corporate probe pitch "ทำ skill-gap diagnostic ให้ทีมฟรี ได้ report"
- **บทเรียน Knewton:** ห้ามขาย "AI-personalized" เป็น headline — ขาย outcome
  ("ถึงเป้าเร็วขึ้น ไม่เรียนซ้ำของที่รู้"); user override เสมอ
- **ภาระ content factory:** granular content + tag + branch + cheatsheet ต่อหน่วย
  ทำให้โจทย์ฝั่ง Crucible โตขึ้นหลายเท่า — ยังไม่ได้ประเมิน; **ต้องประเมินก่อน
  commit "course catalog/เนื้อหา"** (ไม่ block การ build platform ซึ่ง
  content-agnostic — founder เคาะ build-first 2026-07-31)
- CAS-005: disputes ปิดครบแล้ว (Crucible `640c8613`); gate ก่อน public ถูกตัด
  จากแผนโดย founder 2026-07-31 — ตัดสินใจใหม่เฉพาะเมื่อจะเอา bank ออก public จริง

### Open items ของโมเดลนี้ (รอ founder / รอ pilot)

- [x] ~~ล็อกเลข access term สุดท้าย~~ — **ล็อก final 2026-07-31: 3 ปีเต็ม
  เลขเดียวทั้ง catalog** (เหตุผล: ความง่าย — คำสัญญาเดียวไม่มีกติกาซ่อน;
  ดูรายละเอียดในส่วนโมเดลราคา)
- [ ] Rename academy currency ก่อน public launch (working name ชั่วคราว = "credit"
  — founder ไม่ชอบ; ดูรายชื่อที่ตกรอบ + filter ในส่วนระบบแต้ม)
- [ ] Calibrate ตัวเลขจริงจาก pilot ที่มีต้นทุนวัดจริง: แต้มต่อ lab, แต้มแถมต่อ course,
  ราคา top-up, floor %, free-upgrade window
- [ ] นิยามเส้นแบ่ง Academy checkpoint lab vs STAR scenario lab เป็นลายลักษณ์อักษร
- [ ] ตรวจข้อกฎหมาย/consumer protection ไทยเรื่อง prepaid credit + วันหมดอายุ
  ก่อนประกาศนโยบายจริง
- [ ] ยก **ADR ระดับ director/ecosystem: single account ทุก product** (Crux + STAR +
  Academy + Forge) ก่อนเริ่ม build auth จริงของ Academy — ประเมิน shared issuer vs
  dedicated IdP, PDPA consent scope, migration ของ account เดิมในแต่ละ product,
  ห้ามพัง Crux zero-friction ILT

---

## Phase 1 — Platform decision (**superseded 2026-07-31** — ตัดสินครบแล้ว: DIY + build-first; เก็บไว้เป็นประวัติ)
- [x] ~~Decide delivery platform: hosted LMS vs DIY~~ — **ล็อก 2026-07-31: DIY
  "build the core, buy the plumbing"** (ดู Implementation direction ด้านบน +
  `completed_log.md` entry 2026-07-31); ~~build เรียงหลัง Phase 0~~ →
  **build-first ตาม founder decision 2026-07-31** (ดู Build roadmap ด้านบน)
- ~~If hosted LMS: free-trial test against hard requirements~~ — superseded
  (ไม่ใช้ hosted LMS แล้ว); hard requirements เดิม (multi-answer grading,
  per-question explanation rendering, question pools/timed/retake, PBQ UX)
  ย้ายไปเป็น requirement ของ course player ที่ build เอง
- [ ] Stand up `academy.cyberskills.co.th` (CNAME) — ปลดล็อกแล้ว (platform =
  DIY ล็อก 2026-07-31); เป็น external checkpoint ใน
  `plans/platform-build-oneshot-2026-07-31.md` §5

## Phase 2 — Catalog build (gated by **course-catalog decision** — founder pitch + poll; platform decision ปิดแล้ว)
- [ ] Import the CAS-005 bank (portable content → chosen platform; no re-authoring).
- [ ] Freemium gate ladder: free sample → paid full bank + study guides → live cohort → corporate in-house quote → waitlists.
- [ ] First trend course pilot (pick one with demand signal: Agentic AI security / Risk / ISO / basic pentest / cryptography).

## Parallel strategic track — Train-the-Trainer / Instructor Business-in-a-Box

This is **not a replacement for the learner-facing Academy**. Keep the original B2C / B2B learner path alive. This track is a parallel B2B/B2B2C wedge: sell commercial teaching capability to instructors, training centers, universities, bootcamps, and consultants who want to launch cert-prep classes quickly.

Deep market research, competitor analysis, pricing model, and validation gates: `reports/train-the-trainer-market-research-2026-06-10.md`.

### Concept

Package CYBERSKILLS Academy content as a **commercially licensed trainer starter kit**:
- Instructor kit: teaching notes, lesson plan, timing plan, slide deck, instructor script, lab setup guide, facilitation tips, common student questions.
- Student kit: workbook, handouts, lab guide, practice questions, mock exam, explained answers.
- Online subscription labs: cohort-ready lab seats, updated as tools/exam objectives change.
- Trainer prep: on-demand videos that teach the instructor how to teach the course quickly.
- Update subscription: continuously refreshed slide, lab, mock exam, and transition guide when exam versions/objectives change.
- Launch assets: course outline, landing-page copy, sales brochure, pricing guidance, certificate template.
- Commercial license: explicit right to use the content in paid classes, subject to license limits.

### Value proposition

- Help instructors start a new training business faster.
- Let instructors bring themselves + capital; CYBERSKILLS supplies the courseware, labs, mocks, and teaching system.
- Shorten time-to-revenue: buy the kit, get teaching-ready assets immediately.
- Give small training providers a credible course catalog without building content from zero.

### Business model

- Subscription for updated courseware, labs, mock exams, and trainer-prep videos.
- Commercial teaching license by instructor, cohort, institution, or student-seat tier.
- Optional lab-seat usage pricing for cohorts.
- Possible higher-touch tier: CYBERSKILLS reviews/approves instructors and provides delivery QA.

### Phase 0 validation path

- [ ] Identify 10-20 real prospects: independent instructors, corporate trainers, universities, bootcamps, and small training centers.
- [ ] Create a 1-module sample kit + product one-pager + draft commercial license; do **not** build a full platform first.
- [ ] Test willingness to pay with paid pilot, LOI, or deposit. Interest without money is not a go signal.
- [ ] Validate legal/IP/trademark constraints for each target certification before public positioning; do not imply official authorization unless formally authorized.
- [ ] Compare this track against learner-facing Academy signals after the first validation cycle; both can proceed if the channel and maintenance load are justified.

### 5-Direction Design Check

**Forward:** Add a parallel instructor-enablement offering that packages Academy assets into a commercial courseware + labs + trainer-prep subscription. Success is not a built platform; success is validated instructor/training-center willingness to pay.

**Reverse:** Runtime buyer flow: instructor sees offer → reviews sample module/license → pays pilot/deposit → receives courseware/lab access → teaches cohort → reports usage/feedback. Outputs needed: license terms, content package, lab-seat rules, update cadence, QA expectations.

**Top:** This complements learner-facing Academy and STAR. Academy content remains the source package; STAR-style labs can become optional cohort lab seats. It must not blur into official certification-provider training unless CYBERSKILLS has authorization.

**Bottom:** Maintenance cost is real because exam objectives, slides, labs, and mock explanations must stay current. Start with one cert/module sample before any recurring platform or full catalog commitment.

**Left-Right:** Alternative considered: keep only direct-to-learner Academy. Not chosen as the only path because instructor licensing can create higher willingness-to-pay and distribution leverage. Tradeoff: higher legal/QA burden, but potentially stronger B2B revenue and faster channel access.

---

## Known risks / weaknesses (evidence-backed)
- **Distribution is the binding constraint**, not product quality — unvalidated.
- Open-market standalone sale probability is **low** (commodity market, strong incumbents, cold-start trust).
- ~~CAS-005 answer-key disputes~~ — **ปิดครบ 2026-07-31** (founder เคาะ + fix
  ใน Crucible `640c8613`); confirm-pass gate ถูกตัดจากแผน (founder 2026-07-31)
  — พิจารณาใหม่เฉพาะถ้าจะเอา bank ออก public; push Crucible ตาม authorization ปกติ.
- Recurring-cost trap: committing to a paid platform before demand = capital burn + sunk-cost pressure.
- Content source (Crucible) and delivery (Academy) must stay decoupled or migration cost balloons.

---

## Backlog ที่ founder สั่งจดไว้ (ยังไม่ทำ — 2026-08-01)

- [ ] **Progressive mode ของ realistic practice test (แบบ CISSP CAT):** เดินหน้า
  อย่างเดียว ย้อนกลับไปแก้ข้อที่ตอบไปแล้วไม่ได้ — เป็นโหมดเพิ่มเติมจากโหมดปกติ
  ที่มีอยู่ (ปัจจุบัน nav ข้ามไปมาได้อิสระ) ต้องคิดเรื่อง: กติกาการ flag/review
  ที่ยังเหลือ, การบันทึก attempt ที่ย้อนไม่ได้, และการสื่อสารให้ผู้เรียนรู้ตัว
  ก่อนกดยืนยันแต่ละข้อ
- [ ] **UI ของหน้า practice test ต้องรื้อ** — founder ระบุ 2026-08-01 ว่า
  "ค่อนไปทางไม่ชอบ" แต่ให้ทำตัวหลัก (course experience) ก่อน; ตอนรื้อให้ยึด
  visual language ชุดใหม่ของ Academy ที่ทำไว้แล้ว

## Strategic backlog (speculative — NOT execution lane)
- On-demand video course library (Coursera-style) — the larger build; validate via waitlist first.
- Additional cert tracks beyond CAS-005.
- Subscription/membership model across the catalog.
- Cross-sell into other CYBERSKILLS services (SAT, TTX/PhalanX, pentest, SOC) via nurture.
- Corporate B2B training packages (likely the largest revenue line).
- Single learner identity / account unifying bank + courses + waitlists.

## 2026-08-11 - Shared-account local browser journey

- [x] Implement Academy sign-in -> Account Center email/code -> callback -> opaque
  Academy session -> My learning as one local-only browser journey.
- [x] Preserve zero-entitlement behavior and deny suspended Academy activation.
- [x] Pass desktop/mobile Chromium execution, console/network failure gates, and visual
  inspection for sign-in, email, code, and dashboard states.
- [x] Rebuild the journey from Academy `HEAD` without concurrent course/route work and
  pass focused 25/25, full unit 904/904, lint/typechecks, and the production Next build.
- [x] Close the isolated independent checkpoint review at `C0/H0/M0/L0` with focused
  25/25, full unit 904/904, lint/typechecks, staged secret/diff checks, and route review.
- [x] Commit and push only the exact Identity journey paths without staging unrelated
  Academy work: Academy `9b096307cac6400cc6e7b6a8b7e54a5a770c4d1e` is verified on remote `main`.
- [ ] Production remains disabled pending real endpoint/credential/key/email/runtime,
  deployment, operator, and separate release authorization.

## 2026-08-14 - Identity client-assertion signer contract rebind

- [x] เปลี่ยน contract ให้ signer เป็นเจ้าของ key เอง: รับ `privateJwk` เป็นข้อความ
  แล้ว import ภายใน boundary ด้วย `extractable: false`, `usages: ['sign']` ปิดไว้ใน
  closure ไม่มี API ที่รับ `CryptoKey` จากผู้เรียกอีกต่อไป
- [x] ถอดการตรวจ metadata ผ่าน prototype getter และ `structuredClone` ออกทั้งหมด —
  ปฏิเสธ key ที่ถูกต้องบน workerd และตรวจของปลอมบน Node 25 ไม่ได้อยู่ดี
- [x] บังคับให้ JWK text เป็นการสะกดแบบ canonical แบบเดียว ปิด parser-differential
  จากสมาชิกซ้ำ, `\uXXXX` escape, ลำดับสมาชิก, ช่องว่าง และบิตว่างท้าย base64url
- [x] สร้างเลนทดสอบบน workerd จริง (`npm run test:workerd-signer`) ที่กิน source
  ตัวจริงด้วย compatibility ชุดเดียวกับแอป และบังคับให้ harness ตรงกับ
  `wrangler.jsonc` ของแอปเสมอ
- [x] ทำให้เลนนั้นโกหกไม่ได้: ผูก check เข้ากับ argument ที่ signer ใช้ import จริง,
  บังคับ HTTP 200 / nonce / ชื่อ check ครบตามรายการ / child ยังมีชีวิต
- [x] ตั้งด่านบังคับว่าโมดูล key distribution ยังไม่ถูกต่อเข้า production
  (`tests/unit/identity-key-distribution-not-wired.test.ts`) พร้อมกันตัวเองไม่ให้
  ผ่านด้วยเหตุผลผิดเมื่อไฟล์ถูกเปลี่ยนชื่อหรือรากสแกนพัง
- [ ] รีวิวอิสระรอบใหม่บน contract ล่าสุด (รอบล่าสุดคือ `C0/H0/M5/L1 — REJECT`
  ซึ่ง commit ชุดนี้แก้ตาม)
- [ ] regenerate หลักฐาน conformance — ตอนนี้ค้างคนละ revision ทั้งสอง repo และ
  หยุดที่ `Identity Control contract digest mismatch:
  docs/integration/consumer-conformance-kit.md` การเลื่อน digest ชุดนั้นเท่ากับ
  อ้างว่ามีรีวิวข้าม repo ชุดใหม่แล้ว จึงต้องมีรอบรีวิวจริงก่อน
- [ ] Production ยังปิด: `enabled=false`, `releaseApproval=false`,
  `runtimeWired=false` และ NO-GO คงเดิม

## 2026-08-14 - Three-product pilot: ตารางลำดับความสำคัญและเกณฑ์ journey/state

รวมเข้ามาตาม `three-product-pilot-execution-brief-20260814.md` §First Pass ข้อ 5
ตารางเต็มและแผนที่การพึ่งพาข้ามผลิตภัณฑ์อยู่ที่ director:
`reports/director-briefs/three-product-pilot-integrated-priority-20260814.md`
ส่วนด้านล่างคือส่วนที่เป็นของผลิตภัณฑ์นี้ เขียนไว้ให้อ่านจบได้ในไฟล์เดียว
ไม่แทนที่ประวัติที่พิสูจน์แล้วด้านบน

### เกณฑ์พื้นของทุก public web journey (ตั้งก่อนลงมือ ห้ามผ่อนหลังสอบตก)

- ทำงานจบได้ด้วยคีย์บอร์ดล้วน
- ทุก control มี label ที่เครื่องอ่านหน้าจอออกเสียงได้
- ไม่มี automated accessibility finding ระดับ critical หรือ serious
- วัดบน mobile profile ตัวแทนที่ตกลงกันแล้ว: LCP <= 2.5 s, INP <= 200 ms, CLS <= 0.1
- ต้องเห็นสถานะครบ: loading / empty / error / permission / recovery
- ตรวจทั้ง desktop และ mobile viewport

ถ้าไม่ผ่าน ให้แก้ของ ไม่ใช่แก้เกณฑ์ การผ่อนเกณฑ์ต้องมีหลักฐานผู้ใช้ชุดใหม่เท่านั้น

### Persona ที่ผลิตภัณฑ์นี้เป็นเจ้าของ

| Persona | Journey | เริ่มที่ | จบที่ | Viewport | สถานะที่ต้องเห็น | เกณฑ์เพิ่มเติม |
|---|---|---|---|---|---|---|
| ผู้เรียนใหม่ | สมัคร → ยืนยันตัวตนผ่าน Identity → เข้าคอร์สแรก | ยังไม่มีบัญชี | เห็นคอร์สที่มีสิทธิ์จริง | desktop + mobile | รอโหลด, ยังไม่มีคอร์ส, ยืนยันล้มเหลว, ไม่มีสิทธิ์, กู้คืนหลัง session หมดอายุ | เกณฑ์พื้น |
| ผู้สอน / ผู้ดูแลคอร์ส | เข้าระบบ → จัดการผู้เรียน | มีบัญชีแล้ว | เห็นรายชื่อจริง | desktop + mobile | ว่าง, ผิดพลาด, ไม่มีสิทธิ์ | เกณฑ์พื้น |

### ลำดับที่ผูกกับผลิตภัณฑ์นี้

- P1-ACA-1 (production-disabled key-set importer + runtime capability)
  **ปิดแล้ว** — importer, cache และ signer อยู่ครบ และ "ยังไม่ต่อเข้า production"
  ถูกบังคับด้วยด่าน `tests/unit/identity-key-distribution-not-wired.test.ts`
  ไม่ใช่จริงเพราะบังเอิญไม่มีใครต่อ
- migration `0021-0027` ยังใช้ไม่ได้จนกว่าหลักฐาน Pool A backup + restore
  จะผ่าน (P0A-4) — ข้อนี้เป็น prerequisite ที่ Academy ไม่ได้เป็นเจ้าของเอง
- ลำดับหลังจากนั้น: wire disabled production runtime → พิสูจน์ 6 scenario
  ที่ไม่ใช่ owner ด้วย real route/browser evidence → founder bootstrap เป็น
  operation ที่ authorize แยก แล้วจึงเคลม 23/23 ได้
- conformance ยัง `16/23` และหลักฐานชุดปัจจุบันยังชี้ revision เก่า ดูรายละเอียด
  ในหัวข้อ "2026-08-14 - Identity client-assertion signer contract rebind"

## 2026-08-16 - Adversarial harness debt closure: freeze-pin + ยืนยันเต็มรูปแบบ

ปิด Done-Definition ที่ค้างของ c22a823 + cd83b20 (problems เป็นรายพาธ + run-all
จับ exclusive lock) ให้ครบสองข้อที่ค้าง: หลักฐานถูกตรึงใน freeze manifest และ
รันยืนยันเต็มชุดอีกรอบบนไบต์ปัจจุบัน

- [x] รีเฟรช manifest `reports/reviews/academy-identity-client-assertion-webcrypto-signer-contract-rebind-freeze-20260814.json`
  ให้ตรงไบต์ปัจจุบันของ `sandbox.mjs` และ `adversarial-sandbox.test.ts`
  และ pin ไฟล์ใหม่สองไฟล์: `run-all.mjs` และ `adversarial-run-all.test.ts`
  (อัปเดต digest ด้วย sha256 + ขนาดไบต์ของไบต์จริง ตามแบบ commit 17536d0
  รวมถึง digest ของ `plans/active_plan.md` ที่รายการนี้เพิ่งเขียน —
  ผลตรงกับ canonical renderer ของ director `scripts/checkpoint-freeze-manifest.mjs`
  แบบ byte-for-byte ยืนยันโดยรีวิวอิสระรอบนี้) — ตรวจซ้ำแล้ว zero drift ทุกไฟล์ใน manifest
- [x] ยืนยันเต็มชุดจาก `academy-web/`: unit `1351/1351` ผ่าน (118 ไฟล์),
  `tsc --noEmit` exit 0, `eslint .` exit 0 (0 error, 1 warning เดิมใน
  `registry.generated.ts` ซึ่งเป็นไฟล์ generated), และ
  `node scripts/adversarial/run-all.mjs` รันเดี่ยวล็อกเอกซ์คลูซีฟ —
  สามด่านผ่านครบ (not-wired-gate-evasions / workerd-runner-attacks /
  sandbox-exit-path-poc) exit 0
- สถานะเดิมคงอยู่: production ยังปิด และข้อ conformance/regenerate
  ในหัวข้อ 2026-08-14 ไม่แตะในรอบนี้ ขอบเขตไฟล์ของ checkpoint นี้คือสองไฟล์ข้างบน
  เท่านั้น (`reports/security/` เป็น audit ของอีกเซสชัน ไม่อยู่ในขอบเขต
  และไม่ถูกอ่าน แตะ หรือ stage)

### หนี้ที่บันทึกไว้ (ไม่เกิดจาก checkpoint นี้) — Mimosa pre-commit scan 2026-08-16

สแกน pre-commit ของ harness พบ findings เดิมในโค้ดที่ checkpoint นี้ไม่ได้แตะ
(delta เป็น docs/manifest เท่านั้น) บันทึกครั้งเดียวตามกฎ debt:

- เจ้าของ: security-hardening checkpoint ถัดไปของ Academy (ประสาน security lane)
- ทริกเกอร์เอาหนี้ออก: แก้ใน checkpoint ที่แตะไฟล์เหล่านี้จริง หรือ dedicated
  hardening checkpoint ที่วางแผนแยก
- รายการ (ตามที่สแกนรายงาน): path traversal ใน `scripts/make-dummy-assets.py`
  (2 จุด), hardcoded-credential heuristic ใน `playwright.config.ts` และ
  test 2 ไฟล์, SSRF heuristic ใน integration test 2 ไฟล์, taint/path-traversal
  heuristic ใน `src/lib/content/source.ts` (3 จุด), และ
  `src/components/WaitlistForm.tsx` (1 จุด)
- ข้อสังเกต: สแกนระบุเองว่า coverage ไม่สมบูรณ์ — การไม่พบเพิ่มไม่ใช่การรับรองความปลอดภัย

### ผล adjudication หนี้ security นั้น (checkpoint เดียวกัน 2026-08-16)

ปิดจบใน `reports/reviews/academy-security-scan-remediation-20260816.md`:
- จริง 1 จุด: integration runtime-api test fetch ตรงเข้า `ACADEMY_DATA_API_URL`
  ใดๆ โดยข้าม origin rule ของ production client — แก้ด้วย
  `isSafeAcademyDataApiUrl()` (export ใหม่จาก `src/lib/db/server.ts`, ไม่เปลี่ยน
  พฤติกรรม production) + เทสเจาะจง 8 เคส (แดง→เขียว) ชุด unit 16/16,
  เต็มชุด 1359/1359
- ปรับแข็ง 1 จุด: `playwright.config.ts` ค่าเดิม (playwright-only) ย้ายเป็น
  env-default pattern แบบ byte-identical — offline/CI ไม่เปลี่ยน
- false positive 10 จุด พร้อมหลักฐานตามไฟล์ (script ไร้ input surface,
  leak-canary literals, isSafeLocalTestTarget, zod fail-closed, ไม่มี mongo,
  ตรวจที่ trust boundary แล้ว)
- tsc exit 0 · eslint 0 error (1 warning เดิม) · แฟล็ก production ยัง false ทั้งหมด

### ปิด M2 ของ codex review รอบรวม (2026-08-16)

- M2-1 skip ที่อ่อนกว่าเดิม: เพิ่ม guard test ที่รันเสมอใน
  `tests/integration/academy-runtime-api.test.ts` — ถ้าตั้ง
  `ACADEMY_DATA_API_URL` แล้วชี้ origin ที่ app client ปฏิเสธ ต้อง fail
  ทันที (skip เหลือเฉพาะกรณีไม่ได้ตั้งค่าเลย)
- M2-2 freeze manifest Part 2 แยก:
  `reports/reviews/academy-security-scan-remediation-freeze-20260816.json`
  (VERIFIED 5 files — code/test 4 ไฟล์ + รายงาน remediation)
- หมายเหตุถือไว้: `academy-retention-api.test.ts` ใช้รูป skip เดิมของ repo
  กับ `isSafeLocalTestTarget` (เก่าก่อน checkpoint นี้) — จุดเดียวกันแต่อยู่นอก
  delta จึงไม่แตะ บันทึกเป็น debt ตามรูปแบบ guard เดียวกันเมื่อแตะไฟล์นั้นจริง

## 2026-08-16 - Identity conformance rebind รอบ revision-only (เลื่อน revision ไม่เลื่อนข้ออ้าง)

ตาม procedure ของ `reports/reviews/academy-identity-contract-digest-rebind-analysis-20260816.md` §4b:
ชุด digest rebind จริงเกิดไปแล้วที่ `b715a09` (2026-08-15 หลังรีวิวข้าม repo)
สิ่งที่ค้างมีเพียง pin `ACADEMY_SOURCE_REVISION=f6b043c6` ต่ำกว่า HEAD ทำให้
generator verify fail-closed ที่ "Academy source revision mismatch" รอบนี้จึงเลื่อน
เฉพาะ revision ฝั่ง Academy ตามคำแนะนำข้อ 5.1 ของเอกสารนั้น (วัด digest ก่อนแตะเสมอ):

- **วัด digest ซ้ำก่อนแตะ (read-only):** `identityContractDigests` ทั้งหกไฟล์ +
  `expectedIdentityEvidenceDigests` อีก 4 ไฟล์ วัดจาก worktree identity-control
  จริง (HEAD `fdcaf30` ตรง pin, worktree สะอาด) — **ตรงค่า pin ทุกตัว ไม่มีตัวใดขยับ**
  จึงไม่ต้องขยับ digest ชุดไหน และไม่เปิด rule รีวิวข้าม repo รอบใหม่
  (rule ที่หัวข้อ rebind 2026-08-14 บังคับเฉพาะการเลื่อน digest)
- **แก้สองจุด:** `academy-web/scripts/generate-identity-control-conformance.mjs`
  `ACADEMY_SOURCE_REVISION` `f6b043c6 → 6de80c2` + literal เดียวใน self-test
  ที่ hard-pin ค่าเดียวกัน ไม่แตะอย่างอื่นใน generator
- **ledger ไม่ขยับ:** diff JSON สาม artifact ก่อน/หลัง — scenario
  id/result/supportsClaim/command byte-identical, summary identical,
  **23 scenarios 16 pass / 7 not_proven เท่าเดิม** ฟิลด์ที่ต่างมีเฉพาะ:
  `sourceRevision` (ทั้งสาม artifact รวม per-scenario `evidence.sourceRevision` 23 จุด),
  `localWorkingTreeReceipt` (head + สถานะ git ปัจจุบัน — receipt เห็น untracked
  `.mimosa/` `reports/security/` ซึ่ง lane นี้ไม่ได้อ่านหรือแตะ), และ
  `artifactSha256` ของ evidence/unproven artifact ที่ derive จาก sourceRevision ใหม่
- **ตรวจ:** generator verify `current` ที่ HEAD `6de80c2` · self-test 7/7 ·
  unit 1359/1359 (118 files) · `tsc --noEmit` exit 0 · eslint 0 error
  (1 warning เดิมจาก `registry.generated.ts`, รันจาก `academy-web/` ที่เป็นที่อยู่
  ของ flat config)
- **แฟล็ก production คงเดิมทั้งหมด:** `enabled=false`, `releaseApproval=false`,
  `runtimeWired=false`, `productionEvidence=false` — NO-GO ไม่เปลี่ยน
  `exchange.result-key-rotation` ยัง `not_proven` ตามเหตุผลเดิม (ยังไม่มี
  distribution endpoint/runtime wiring จริง)

### 2026-08-16 - ตัดสินของผู้ก่อตั้ง: mobile profile ทางการ = Pixel 7

เกณฑ์พื้นของทุก public web journey อ้าง "mobile profile ตัวแทนที่ตกลงกันแล้ว"
— ผู้ก่อตั้งตัดสินเป็น **Pixel 7** (ตรงกับที่ identity-local config และ
Crux ใช้อยู่แล้ว) การวัด LCP/INP/CLS และการตรวจ viewport ของ Academy
ตั้งแต่บัดนี้ต้องอ้าง Pixel 7; `playwright.public.config.ts` ที่ยังเป็น
Pixel 5 ต้องสลับเป็น Pixel 7 ใน checkpoint ถัดไปที่แตะไฟล์นั้น
(ไม่ผ่อนเกณฑ์ ไม่เปลี่ยนตัวเลขขีด — เปลี่ยนเฉพาะอุปกรณ์ตัวแทน)
