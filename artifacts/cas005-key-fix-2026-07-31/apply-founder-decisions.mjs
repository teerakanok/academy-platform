#!/usr/bin/env node
// Founder decision 2026-07-31: แก้ answer key 3 ข้อ (M4-082 +D, M4-067 +A, PBQ-010 reorder)
// อ้างอิง: academy-platform/reports/reviews/cas005-dispute-audit-2026-07-31.md
// Fail-closed: ทุก precondition ต้องตรงเป๊ะ ไม่งั้น exit 1 โดยไม่เขียนไฟล์ใด
import fs from "node:fs";
import path from "node:path";

const PT =
  "/Users/teerakanok/Dev/cyberskills-director/products/personal/crucible-studio/courses/comptia-securityx/exam-versions/cas-005/archive/legacy-output/v4.1/practice-tests";

const fail = (msg) => { console.error("PRECONDITION FAILED:", msg); process.exit(1); };
const endings = new Map();
const rj = (p) => {
  const raw = fs.readFileSync(p, "utf8");
  endings.set(p, raw.endsWith("\n") ? "\n" : "");
  return JSON.parse(raw);
};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---------- นิยามการแก้ ----------
const V1_M4082_EXPL =
  "The correct set combines controls that directly support TIP and sharing standards: Track source handling; Set expiration; Map fields; Record confidence. Together they make use a threat intelligence platform or structured format with context, confidence, source, TTL, field mapping, and handling rules reviewable, because the scenario's decisive issue is intelligence needs context and lifecycle management — and the teams' spreadsheets use inconsistent fields, so mapping fields to a shared schema is part of the required evidence. Scenario cue: the team has already bought tooling, but the unresolved issue is that multiple teams exchange indicators using spreadsheets with inconsistent fields and no confidence ratings. Options outside the set are valid in adjacent SecurityX discussions, but they do not supply the specific evidence or operating control requested here.";
const V1_M4082_WHY_D =
  "Map fields belongs in the answer set because standardizing field mapping fixes the inconsistent spreadsheet exchange the scenario calls out, making indicators comparable across teams.";
const V1_M4067_EXPL =
  "The correct set combines controls that directly support supply-chain dependency exposure: Sandbox process; Monitor dependency changes; Isolate build secrets; Verify package provenance. Together they make pin and review dependencies, use lockfiles, SCA, provenance checks, sandboxed builds, and secret isolation reviewable, because the scenario's decisive issue is dependency execution can become a build-system compromise. Scenario cue: engineering can implement several controls, but the scenario constraint remains: a package update introduces a malicious postinstall script into CI. Options outside the set are valid in adjacent SecurityX discussions, but they do not supply the specific evidence or operating control requested here.";
const V1_M4067_WHY_A =
  "Sandbox process belongs in the answer set because sandboxing the build/install step contains what a malicious postinstall script can read or execute, limiting blast radius in CI.";

const V2_M4082_EXPL =
  "Intelligence needs context and a lifecycle to stay trustworthy. With teams exchanging spreadsheets that use inconsistent fields and no confidence ratings, a structured TIP approach tracks source handling (A), sets expiration/TTL (C), maps fields to a shared schema (D), and records confidence (E) so indicators are comparable, aged, and weighted. Creating detections (B) is a nearby detection-building task; it does not fix the indicator-governance gap this scenario tests.";
const V2_M4082_WHY_D =
  "Mapping fields to a shared schema fixes the inconsistent spreadsheet exchange the stem calls out, so indicators from different teams become comparable.";
const V2_M4067_EXPL =
  "A dependency that executes code can turn into a full build-system compromise. The defensible answer sandboxes the install/build process so a malicious postinstall script is contained (A), monitors dependency changes (B), isolates build secrets (C), and verifies package provenance (E) so a malicious update is caught, contained, and traceable. Denying metadata endpoints (D) addresses SSRF, not malicious CI dependencies.";
const V2_M4067_WHY_A =
  "Sandboxing the install/build process contains what a malicious postinstall script can read or execute while the update is investigated.";

const PBQ_EXPL =
  "The response sequence preserves evidence, limits damage, eradicates the root cause, and then proves the restore is clean — restoring before the root cause is fixed risks immediate re-compromise (NIST SP 800-61).";

// v1 wording (full-length + suite)
const PBQ_V1_OLD = ["Preserve volatile evidence where feasible", "Contain affected access paths", "Validate clean restore", "Fix root cause and update detections"];
const PBQ_V1_NEW = ["Preserve volatile evidence where feasible", "Contain affected access paths", "Fix root cause and update detections", "Validate clean restore"];
// v2 wording (rewritten)
const PBQ_V2_OLD = ["Preserve volatile evidence where feasible", "Contain the affected access paths", "Validate a clean restore", "Fix the root cause and update detections"];
const PBQ_V2_NEW = ["Preserve volatile evidence where feasible", "Contain the affected access paths", "Fix the root cause and update detections", "Validate a clean restore"];

// ---------- ตัวช่วยแก้ MCQ ----------
function patchMcq(q, id, newCorrect, moveLetter, whyText, newExpl, oldCorrect) {
  if (q.id !== id) fail(`id mismatch ${q.id}`);
  if (!eq(q.correct, oldCorrect)) fail(`${id} correct is ${JSON.stringify(q.correct)}, expected ${JSON.stringify(oldCorrect)}`);
  if (!q.whyWrong || !(moveLetter in q.whyWrong)) fail(`${id} whyWrong.${moveLetter} missing`);
  if (q.whyCorrect && moveLetter in q.whyCorrect) fail(`${id} whyCorrect.${moveLetter} already exists`);
  q.correct = newCorrect;
  delete q.whyWrong[moveLetter];
  q.whyCorrect = q.whyCorrect || {};
  q.whyCorrect[moveLetter] = whyText;
  // เรียง whyCorrect ตามลำดับ letter ให้อ่านง่าย
  q.whyCorrect = Object.fromEntries(Object.entries(q.whyCorrect).sort(([a], [b]) => a.localeCompare(b)));
  q.explanation = newExpl;
}

function patchPbq(p, oldOrder, newOrder) {
  if (p.id !== "PBQ-010") fail("not PBQ-010");
  const f = p.fields.find((x) => x.id === "recoveryOrder");
  if (!f) fail("recoveryOrder field missing");
  if (!eq(f.correct, oldOrder)) fail(`PBQ-010 correct is ${JSON.stringify(f.correct)}`);
  if (!eq([...f.options].sort(), [...newOrder].sort())) fail("PBQ-010 options set mismatch");
  f.correct = newOrder;
  f.explanation = PBQ_EXPL;
}

const writeJson = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 2) + endings.get(p), "utf8");

// ---------- 1) module bank ต้นฉบับ (v1 canonical) ----------
const bankPath = path.join(PT, "module-banks/module-4-security-operations.json");
const bank = rj(bankPath);
patchMcq(bank.questions.find((q) => q.id === "M4-082"), "M4-082", ["A", "C", "D", "E"], "D", V1_M4082_WHY_D, V1_M4082_EXPL, ["A", "C", "E"]);
patchMcq(bank.questions.find((q) => q.id === "M4-067"), "M4-067", ["A", "B", "C", "E"], "A", V1_M4067_WHY_A, V1_M4067_EXPL, ["B", "C", "E"]);

// ---------- 2) rewritten (v2 prose + _context) ----------
const rw82Path = path.join(PT, "v2-build/rewritten/module-4-security-operations/part-05.json");
const rw82 = rj(rw82Path);
{
  const q = rw82.questions.find((x) => x.id === "M4-082");
  if (!q) fail("rewritten M4-082 missing");
  if (!eq(q._context.correct, ["A", "C", "E"])) fail("rewritten M4-082 _context.correct mismatch");
  if (!("D" in q.whyWrong)) fail("rewritten M4-082 whyWrong.D missing");
  delete q.whyWrong.D;
  q.whyCorrect.D = V2_M4082_WHY_D;
  q.whyCorrect = Object.fromEntries(Object.entries(q.whyCorrect).sort(([a], [b]) => a.localeCompare(b)));
  q.explanation = V2_M4082_EXPL;
  q._context.correct = ["A", "C", "D", "E"];
}
const rw67Path = path.join(PT, "v2-build/rewritten/module-4-security-operations/part-13.json");
const rw67 = rj(rw67Path);
{
  const q = rw67.questions.find((x) => x.id === "M4-067");
  if (!q) fail("rewritten M4-067 missing");
  if (!eq(q._context.correct, ["B", "C", "E"])) fail("rewritten M4-067 _context.correct mismatch");
  if (!("A" in q.whyWrong)) fail("rewritten M4-067 whyWrong.A missing");
  delete q.whyWrong.A;
  q.whyCorrect.A = V2_M4067_WHY_A;
  q.whyCorrect = Object.fromEntries(Object.entries(q.whyCorrect).sort(([a], [b]) => a.localeCompare(b)));
  q.explanation = V2_M4067_EXPL;
  q._context.correct = ["A", "B", "C", "E"];
}

// ---------- 3) PBQ-010: full-length ต้นฉบับ + rewritten ----------
const fl02Path = path.join(PT, "full-length/cas005-full-practice-02.json");
const fl02 = rj(fl02Path);
patchPbq(fl02.pbqs.find((p) => p.id === "PBQ-010"), PBQ_V1_OLD, PBQ_V1_NEW);

const rwPbqPath = path.join(PT, "v2-build/rewritten/pbqs/cas005-full-practice-02__PBQ-010.json");
const rwPbq = rj(rwPbqPath);
patchPbq(rwPbq.pbq, PBQ_V2_OLD, PBQ_V2_NEW);

// ---------- 4) data/cas005-practice-suite.json (v1 snapshot) ----------
const suitePath = path.join(PT, "data/cas005-practice-suite.json");
const suite = rj(suitePath);
{
  const b4 = suite.moduleBanks.find((b) => b.id === "m4");
  patchMcq(b4.questions.find((q) => q.id === "M4-082"), "M4-082", ["A", "C", "D", "E"], "D", V1_M4082_WHY_D, V1_M4082_EXPL, ["A", "C", "E"]);
  patchMcq(b4.questions.find((q) => q.id === "M4-067"), "M4-067", ["A", "B", "C", "E"], "A", V1_M4067_WHY_A, V1_M4067_EXPL, ["B", "C", "E"]);
  patchPbq(suite.pbqs.find((p) => p.id === "PBQ-010"), PBQ_V1_OLD, PBQ_V1_NEW);
  let hit = 0;
  for (const t of suite.fullTests) for (const p of t.pbqs) if (p.id === "PBQ-010") { patchPbq(p, PBQ_V1_OLD, PBQ_V1_NEW); hit += 1; }
  if (hit !== 1) fail(`suite fullTests PBQ-010 hits = ${hit}`);
}

// ---------- เขียนทั้งหมด (หลังทุก precondition ผ่าน) ----------
writeJson(bankPath, bank);
writeJson(rw82Path, rw82);
writeJson(rw67Path, rw67);
writeJson(fl02Path, fl02);
writeJson(rwPbqPath, rwPbq);
writeJson(suitePath, suite);
console.log("ALL JSON PATCHES APPLIED: 6 files");
