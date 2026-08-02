#!/usr/bin/env bash
#
# mutation-check — พังโค้ดชั่วคราวเพื่อพิสูจน์ว่าเทสจับได้จริง แล้วคืนสภาพให้ครบ
#
# ทำไมต้องมีสคริปต์ ไม่ใช่ทำมือ: วิธีคืนสภาพที่นึกออกเร็วที่สุดคือ `git checkout <file>`
# ซึ่ง**ลบงานที่ยังไม่ commit ในไฟล์นั้นทิ้งทั้งหมด** ไม่ใช่แค่รอยพังที่เพิ่งใส่ไป
# (เกิดขึ้นจริงตอนปิด W1 — กู้คืนได้จาก transcript แต่เสียเวลาไปมาก)
# สคริปต์นี้คืนจาก **สำเนาของไฟล์ก่อนพัง** จึงปลอดภัยกับงานที่ยังไม่ commit เสมอ
#
# ใช้:
#   scripts/mutation-check.sh <ไฟล์> <ไฟล์ patch python> [คำสั่งตรวจ...]
#
#   ไฟล์ patch คือสคริปต์ python ที่แก้ไฟล์เป้าหมาย (str.replace ตรงๆ ก็พอ)
#   คำสั่งตรวจ default = `npm run build && npx playwright test`
#
# ผลที่ต้องได้: คำสั่งตรวจต้อง **แดง** · ถ้าเขียวแปลว่าเทสไม่ได้ตรวจสิ่งที่คิดว่าตรวจ
set -uo pipefail

target=${1:?ต้องระบุไฟล์ที่จะพัง}
patch=${2:?ต้องระบุไฟล์ patch python}
shift 2
verify=("$@")
[[ ${#verify[@]} -eq 0 ]] && verify=(bash -c 'npm run build >/dev/null && npx playwright test')

snapshot=$(mktemp "${TMPDIR:-/tmp}/mutation-check.XXXXXX")
cp "$target" "$snapshot"
restore() {
  cp "$snapshot" "$target"
  rm -f "$snapshot"
  echo "คืนสภาพ $target แล้ว (จากสำเนา ไม่ใช่จาก git)"
}
trap restore EXIT INT TERM

python3 "$patch"
if cmp -s "$snapshot" "$target"; then
  echo "❌ patch ไม่ได้เปลี่ยนอะไรเลย — ข้อความที่จะแทนคงไม่ตรงกับไฟล์จริง" >&2
  exit 2
fi

echo "── รันคำสั่งตรวจกับโค้ดที่พังแล้ว ──"
if "${verify[@]}"; then
  echo "❌ เทสยังเขียวทั้งที่โค้ดพัง — เทสชุดนี้ไม่ได้ตรวจพฤติกรรมนี้จริง" >&2
  exit 1
fi
echo "✅ เทสแดงตามที่ควรเป็น — เทสจับพฤติกรรมนี้ได้จริง"
