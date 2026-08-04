#!/usr/bin/env bash
# สร้างวิดีโอบทเรียน dummy สำหรับ dev/demo/e2e — ไม่ใช่เนื้อหาจริง
#
# ทำไมต้องเห็นเวลาบนภาพ: cue point ของ pop quiz อ้างวินาที ถ้าไม่เห็นเวลาบนเฟรม
# จะพิสูจน์ไม่ได้ว่า "หยุดตรงวินาทีที่ตั้งไว้จริง" — ใช้ filter `testsrc` ซึ่งมี
# ตัวนับเวลาในตัว (ffmpeg เครื่องนี้ไม่ได้ build มากับ freetype จึงใช้ drawtext ไม่ได้)
# และลาย test pattern ยังสื่อชัดว่าเป็นของ placeholder ไม่ใช่เนื้อหาจริง
#
# ใช้: bash scripts/make-dummy-lesson-video.sh
set -euo pipefail

OUT="private-media/basic-os-linux/os-what-it-does/lesson-demo.mp4"
DURATION=150

mkdir -p "$(dirname "$OUT")"

ffmpeg -y -hide_banner -loglevel error \
  -f lavfi -i "testsrc=size=640x360:rate=10:duration=${DURATION}" \
  -c:v libx264 -preset slow -crf 30 -pix_fmt yuv420p -movflags +faststart \
  "$OUT"

echo "สร้างแล้ว: $OUT ($(du -h "$OUT" | cut -f1), ${DURATION}s)"
