#!/usr/bin/env node
// เกตขอบเขตประโยคของคำอธิบายเฉลย checkpoint
//
// ลานตรวจเนื้อหาจับได้ว่าคำอธิบายเฉลย (checkpoint[].explanation) ที่ AI แต่งมา
// เอาสองประโยคมาต่อกันโดยไม่มีขอบเขต — ขาดจุด (period) หรือมีจุดเกินที่ผ่ากลาง
// ประโยคเดียว ทำให้ผู้เรียนอ่านเฉลยแล้วเจอข้อความที่ดูพัง ตรงจังหวะที่กำลัง
// ตรวจความเข้าใจตัวเอง เกตนี้เป็น heuristic (ไม่ใช่ข้อพิสูจน์): flag เคสที่
// "น่าจะพัง" ให้คนรีวิว — ตั้งใจให้เงียบบนเนื้อหาสะอาด และดังบนรูปแบบที่รู้จัก
//
// EN: lowercase word ตามด้วย Capitalized word ที่ขึ้นประโยคใหม่ โดยไม่มีจุดคั่น
//     (ข้าม proper noun / message name / camelCase identifier)
// TH: จุด ASCII เดี่ยว ๆ ติดกับอักษรไทย (ไทยคั่นประโยคด้วยช่องว่าง ไม่ใช่จุด;
//     ข้าม ellipsis "...")
//
// ใช้: node tests/factcheck/checkpoint-explanation-boundaries.mjs [--json]
// exit 1 เมื่อพบ candidate (ให้ CI กันไว้), 0 เมื่อสะอาด
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function lessonFiles() {
  const out = [];
  const coursesDir = join(root, 'content/courses');
  for (const slug of readdirSync(coursesDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)) {
    if (slug === 'content-formats-demo') continue;
    for (const loc of ['en', 'th']) {
      const dir = join(coursesDir, slug, 'locales', loc, 'lessons');
      let entries = [];
      try { entries = readdirSync(dir); } catch { continue; }
      for (const f of entries) if (f.endsWith('.json')) out.push(relative(root, join(dir, f)));
    }
  }
  return out;
}
const files = lessonFiles();

// Capitalized tokens that legitimately appear mid-sentence: proper nouns, message
// names, product names, filenames. "lowercase Cap" around these is not a boundary defect.
const MIDSENTENCE_OK = new Set([
  'I', 'C', 'Linux', 'Windows', 'Unix', 'Git', 'GitHub', 'Docker', 'Apple', 'Intel',
  'ARM', 'RISC', 'Thai', 'English', 'ASCII', 'Unicode', 'UTF', 'TCP', 'UDP', 'IP',
  'HTTP', 'HTTPS', 'DNS', 'TLS', 'SSH', 'URL', 'CPU', 'GPU', 'RAM', 'ROM', 'OS',
  'API', 'NULL', 'PATH', 'ELF', 'PID', 'UID', 'GID', 'TLB', 'MMU', 'NUMA', 'HBM',
  'NAT', 'ARP', 'ICMP', 'SPN', 'JSON', 'SQL', 'US', 'UK', 'AM', 'PM',
  'Makefile', 'Permission', 'Time', 'Both', 'No',
]);

function flagEnglish(text) {
  const hits = [];
  for (const m of text.matchAll(/([a-z,)]) ([A-Z][a-z]{2,})([A-Za-z]?)/g)) {
    if (MIDSENTENCE_OK.has(m[2])) continue;
    if (m[3] && m[3] === m[3].toUpperCase() && m[3] !== '') continue; // camelCase identifier (e.g. CapEff)
    hits.push(`missing-period? "…${m[1]} ${m[2]}…"`);
  }
  return hits;
}

function flagThai(text) {
  const hits = [];
  if (/[฀-๿](?<!\.)\.(?!\.)/.test(text) || /(?<!\.)\.(?!\.)[฀-๿]/.test(text)) {
    hits.push('ascii-period-in-thai');
  }
  return hits;
}

let candidates = 0;
const report = [];
for (const rel of files.sort()) {
  const locale = rel.includes('/locales/th/') ? 'th' : 'en';
  let doc;
  try { doc = JSON.parse(readFileSync(join(root, rel), 'utf8')); }
  catch (e) { console.error(`INVALID JSON: ${rel} — ${e.message}`); process.exitCode = 2; continue; }
  const cps = Array.isArray(doc.checkpoint) ? doc.checkpoint : doc.checkpoint ? [doc.checkpoint] : [];
  for (const cp of cps) {
    const e = cp && cp.explanation;
    if (typeof e !== 'string') continue;
    const hits = locale === 'th' ? flagThai(e) : flagEnglish(e);
    if (hits.length) { candidates += 1; report.push({ file: rel, id: cp.id, locale, hits, text: e }); }
  }
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ candidates, report }, null, 2));
} else {
  for (const r of report) console.log(`[${r.locale}] ${relative('content/courses', r.file)} ${r.id}: ${r.hits.join('; ')}\n    ${r.text.slice(0, 200)}`);
  console.log(`checkpoint-explanation boundaries: ${candidates} candidate(s) across ${files.length} lessons`);
}
process.exitCode = candidates > 0 ? 1 : (process.exitCode || 0);
