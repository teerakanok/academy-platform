#!/usr/bin/env node
// Verification: founder decision 2026-07-31 (M4-082 +D, M4-067 +A, PBQ-010 reorder)
// ยืนยัน key ใหม่ + prose consistency ครบทุก artifact ที่ฝัง key
import fs from "node:fs";

const PT =
  "/Users/teerakanok/Dev/cyberskills-director/products/personal/crucible-studio/courses/comptia-securityx/exam-versions/cas-005/archive/legacy-output/v4.1/practice-tests";
const rj = (p) => JSON.parse(fs.readFileSync(`${PT}/${p}`, "utf8"));
const rt = (p) => fs.readFileSync(`${PT}/${p}`, "utf8");
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const NEW_ORDER_V1 = ["Preserve volatile evidence where feasible", "Contain affected access paths", "Fix root cause and update detections", "Validate clean restore"];
const NEW_ORDER_V2 = ["Preserve volatile evidence where feasible", "Contain the affected access paths", "Fix the root cause and update detections", "Validate a clean restore"];

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  if (ok) { pass += 1; console.log("PASS", name); }
  else { fail += 1; console.log("FAIL", name, detail); }
};

const mcq = (q, correct, movedLetter) => {
  const c = q.correct ?? q._context?.correct;
  return eq(c, correct) && q.whyCorrect && movedLetter in q.whyCorrect && !(movedLetter in (q.whyWrong || {}));
};
const findQ = (list, id) => list.find((x) => x.id === id);
const ro = (p) => p.fields.find((f) => f.id === "recoveryOrder");
const irc = (p) => p.fields.find((f) => f.id === "irCoordination");

// 1) module bank ต้นฉบับ
const bank = rj("module-banks/module-4-security-operations.json");
check("bank M4-082 = A,C,D,E + whyCorrect.D", mcq(findQ(bank.questions, "M4-082"), ["A", "C", "D", "E"], "D"));
check("bank M4-067 = A,B,C,E + whyCorrect.A", mcq(findQ(bank.questions, "M4-067"), ["A", "B", "C", "E"], "A"));

// 2) rewritten
const rw82 = findQ(rj("v2-build/rewritten/module-4-security-operations/part-05.json").questions, "M4-082");
const rw67 = findQ(rj("v2-build/rewritten/module-4-security-operations/part-13.json").questions, "M4-067");
check("rewritten M4-082 _context + prose", mcq(rw82, ["A", "C", "D", "E"], "D") && rw82.explanation.includes("maps fields to a shared schema (D)"));
check("rewritten M4-067 _context + prose", mcq(rw67, ["A", "B", "C", "E"], "A") && rw67.explanation.includes("sandboxes the install/build process"));

// 3) v2-source (หลัง merge)
const vs = rj("v2-build/v2-source/module-banks/module-4-security-operations.json");
check("v2-source M4-082", mcq(findQ(vs.questions, "M4-082"), ["A", "C", "D", "E"], "D"));
check("v2-source M4-067", mcq(findQ(vs.questions, "M4-067"), ["A", "B", "C", "E"], "A"));
const vsPbq = rj("v2-build/v2-source/pbqs/PBQ-010.json");
check("v2-source PBQ-010 order", eq(ro(vsPbq).correct, NEW_ORDER_V2));

// 4) SV2 (deliverable)
const sv2p05 = findQ(rj("student-version-2/module-banks/module-4-security-operations/part-05.json").questions, "M4-082");
const sv2p13 = findQ(rj("student-version-2/module-banks/module-4-security-operations/part-13.json").questions, "M4-067");
check("SV2 M4-082", mcq(sv2p05, ["A", "C", "D", "E"], "D"));
check("SV2 M4-067", mcq(sv2p13, ["A", "B", "C", "E"], "A"));
const sv2fl = rj("student-version-2/full-length/cas005-full-practice-02.json");
const sv2pbq = sv2fl.pbqs.find((p) => p.id === "PBQ-010");
check("SV2 PBQ-010 order", eq(ro(sv2pbq).correct, NEW_ORDER_V2));
check("SV2 PBQ-010 irCoordination คงเดิม", irc(sv2pbq).correct.includes("Fix the root cause before resuming normal operation"));
check("SV2 PBQ-010 explanation ไม่มี NIST SP (นโยบาย student-facing)", !JSON.stringify(sv2pbq).includes("NIST SP"));

// 5) SV1 (v1 deliverable)
const sv1p05 = findQ(rj("student-version/module-banks/module-4-security-operations/part-05.json").questions, "M4-082");
const sv1p13 = findQ(rj("student-version/module-banks/module-4-security-operations/part-13.json").questions, "M4-067");
check("SV1 M4-082", mcq(sv1p05, ["A", "C", "D", "E"], "D"));
check("SV1 M4-067", mcq(sv1p13, ["A", "B", "C", "E"], "A"));
const sv1pbq = rj("student-version/full-length/cas005-full-practice-02.json").pbqs.find((p) => p.id === "PBQ-010");
check("SV1 PBQ-010 order", eq(ro(sv1pbq).correct, NEW_ORDER_V1));

// 6) full-length ต้นฉบับ + suite
const fl02 = rj("full-length/cas005-full-practice-02.json");
check("FL02 PBQ-010 order", eq(ro(fl02.pbqs.find((p) => p.id === "PBQ-010")).correct, NEW_ORDER_V1));
const suite = rj("data/cas005-practice-suite.json");
check("suite bank M4-082", mcq(findQ(suite.moduleBanks.find((b) => b.id === "m4").questions, "M4-082"), ["A", "C", "D", "E"], "D"));
check("suite bank M4-067", mcq(findQ(suite.moduleBanks.find((b) => b.id === "m4").questions, "M4-067"), ["A", "B", "C", "E"], "A"));
check("suite pbqs PBQ-010", eq(ro(suite.pbqs.find((p) => p.id === "PBQ-010")).correct, NEW_ORDER_V1));
const suiteFtPbq = suite.fullTests.flatMap((t) => t.pbqs).find((p) => p.id === "PBQ-010");
check("suite fullTests PBQ-010", eq(ro(suiteFtPbq).correct, NEW_ORDER_V1));

// 7) md renders
const bankMd = rt("module-banks/module-4-security-operations.md");
check("bank md correct line A,C,D,E", bankMd.split("**Correct Answers:** A, C, D, E").length === 2);
check("bank md correct line A,B,C,E", bankMd.split("**Correct Answers:** A, B, C, E").length === 2);
check("bank md Map fields = Correct bullet", bankMd.includes("- D. Correct - <span style=\"color:#005f86\"><strong>Map fields</strong></span> belongs"));
check("bank md Sandbox process = Correct bullet", bankMd.includes("- A. Correct - <span style=\"color:#005f86\"><strong>Sandbox process</strong></span> belongs"));
const flMd = rt("full-length/cas005-full-practice-02.md");
check("FL02 md table row order ใหม่", flMd.includes("Fix root cause and update detections, Validate clean restore |"));
check("FL02 md ไม่เหลือ order เก่า", !flMd.includes("Contain affected access paths, Validate clean restore, Fix root cause"));

// 8) SV2/SV1 md renders ของ 3 ข้อ
const sv2md05 = rt("student-version-2/module-banks/module-4-security-operations/part-05.md");
const sv2md13 = rt("student-version-2/module-banks/module-4-security-operations/part-13.md");
check("SV2 md part-05 มี A, C, D, E", /Correct Answers?:\*{0,2} A, C, D, E/.test(sv2md05) || sv2md05.includes("A, C, D, E"));
check("SV2 md part-13 มี A, B, C, E", sv2md13.includes("A, B, C, E"));
const sv2flmd = rt("student-version-2/full-length/cas005-full-practice-02.md");
const orderLines = sv2flmd.split("\n").filter((l) => l.includes("Fix the root cause and update detections") && l.includes("Validate a clean restore"));
check(
  "SV2 FL02 md ลำดับใหม่ (Fix ก่อน Validate ในทุกบรรทัด order)",
  orderLines.length > 0 && orderLines.every((l) => l.indexOf("Fix the root cause and update detections") < l.indexOf("Validate a clean restore"))
);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
