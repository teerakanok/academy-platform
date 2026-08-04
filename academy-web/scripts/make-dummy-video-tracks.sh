#!/usr/bin/env bash
# สร้างไฟล์ตัวอย่างสำหรับทดสอบวิดีโอสองภาษาเสียง + คำบรรยายสองภาษา
#
# ของจริงจะมาจาก Cloudflare Stream ใน M5 — ชุดนี้มีไว้พิสูจน์ว่า "ตัวเล่นรองรับ"
# ไม่ใช่เนื้อหาจริง เสียงเป็นโทนคนละความถี่เพื่อให้แยกออกด้วยหูว่าสลับแทร็กสำเร็จ
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=private-media/basic-os-linux/os-what-it-does
mkdir -p "$OUT"

make_video() {
  local name="$1" hz="$2" label="$3"
  [ -f "$OUT/$name" ] && { echo "ข้าม $name (มีแล้ว)"; return; }
  ffmpeg -y -hide_banner -loglevel error \
    -f lavfi -i "testsrc=size=1280x720:rate=25:duration=150" \
    -f lavfi -i "sine=frequency=${hz}:duration=150" \
    -c:v libx264 -pix_fmt yuv420p -preset veryfast -crf 30 \
    -c:a aac -b:a 64k -shortest "$OUT/$name"
  echo "สร้าง $name ($label, โทน ${hz}Hz)"
}

# เสียงอังกฤษ = ไฟล์เดิมที่มีอยู่แล้ว · เพิ่มเสียงไทยเป็นอีกไฟล์
make_video "lesson-demo-th.mp4" 330 "เสียงไทย"

# คำบรรยาย WebVTT — เวลาตรงกับ cue ของบทเรียนเพื่อให้เห็นว่าจับคู่กันจริง
cat > "$OUT/os-what-it-does.en.vtt" <<'VTT'
WEBVTT

00:00:02.000 --> 00:00:12.000
An operating system decides which programs may use the hardware, and on what terms.

00:00:14.000 --> 00:00:24.000
The kernel is the only code that touches the hardware directly.

00:00:54.000 --> 00:01:04.000
Every running program is a process, with an owner and memory of its own.

00:01:34.000 --> 00:01:44.000
Permission checks are the fourth job: deciding who may do what.
VTT

cat > "$OUT/os-what-it-does.th.vtt" <<'VTT'
WEBVTT

00:00:02.000 --> 00:00:12.000
ระบบปฏิบัติการเป็นผู้ตัดสินว่าโปรแกรมไหนใช้ฮาร์ดแวร์ได้ และใช้ได้แค่ไหน

00:00:14.000 --> 00:00:24.000
เคอร์เนลคือโค้ดชุดเดียวที่แตะฮาร์ดแวร์ได้โดยตรง

00:00:54.000 --> 00:01:04.000
โปรแกรมที่กำลังรันคือโพรเซส มีเจ้าของและหน่วยความจำของตัวเอง

00:01:34.000 --> 00:01:44.000
หน้าที่ที่สี่คือการตัดสินว่าใครทำอะไรได้บ้าง
VTT

echo "สร้างคำบรรยาย en + th แล้ว"
