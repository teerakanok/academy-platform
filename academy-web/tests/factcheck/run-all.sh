#!/usr/bin/env bash
# เกตตรวจข้อเท็จจริงของเนื้อหาคอร์ส: รันข้ออ้างในบทเรียนจริง แทนการตรวจด้วยสายตา
# ใช้: bash tests/factcheck/run-all.sh   (ต้องมี cc; ส่วน Linux ต้องมี docker)
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
rc=0

echo "== ข้ออ้างเชิงตัวเลขของคอร์ส C =="
BIN=$(mktemp -d)/c-claims
if cc -std=c11 -O0 "$HERE/c-claims.c" -o "$BIN" -lm 2>/dev/null; then
  "$BIN" || rc=1
else
  echo "SKIP: ไม่มี C compiler"; rc=1
fi

echo
echo "== ข้ออ้างพฤติกรรมของคอร์ส Git =="
bash "$HERE/git-claims.sh" < /dev/null || rc=1

echo
echo "== ข้ออ้างพฤติกรรมของคอร์ส Linux (ในคอนเทนเนอร์ Linux จริง) =="
if command -v docker >/dev/null && docker info >/dev/null 2>&1; then
  docker run --rm -v "$HERE:/g" -w /tmp debian:12-slim bash -c \
    'apt-get -qq update >/dev/null 2>&1 && apt-get -qq install -y procps cron openssh-client >/dev/null 2>&1 && bash /g/linux-claims.sh' || rc=1
else
  echo "SKIP: ไม่มี docker — ข้ออ้าง Linux ยังไม่ถูกตรวจ"; rc=1
fi

echo
echo "== ข้ออ้างของคอร์ส Operating Systems (ในคอนเทนเนอร์ Linux จริง) =="
if command -v docker >/dev/null && docker info >/dev/null 2>&1; then
  docker run --rm -v "$HERE:/g" -w /tmp debian:12-slim bash -c \
    'apt-get -qq update >/dev/null 2>&1 && apt-get -qq install -y gcc libc6-dev procps strace >/dev/null 2>&1 && bash /g/os-claims.sh' || rc=1
else
  echo "SKIP: ไม่มี docker — ข้ออ้าง OS ยังไม่ถูกตรวจ"; rc=1
fi

echo
echo "== ข้ออ้างของคอร์ส Computer Architecture (บนเครื่องจริง) =="
bash "$HERE/arch-claims.sh" < /dev/null || rc=1

echo
echo "== ข้ออ้างของคอร์ส Assembly (คอมไพล์ x86-64 จริง) =="
bash "$HERE/asm-claims.sh" < /dev/null || rc=1

echo
echo "== ความสอดคล้องเชิงเลขคณิตของทุกคอร์ส =="
node "$HERE/arithmetic-consistency.mjs" || rc=1

echo
echo "== อคติของเฉลย checkpoint =="
node "$HERE/checkpoint-answer-bias.mjs" || rc=1

echo
echo "== ขอบเขตประโยคของคำอธิบายเฉลย checkpoint =="
node "$HERE/checkpoint-explanation-boundaries.mjs" || rc=1

echo
[ $rc -eq 0 ] && echo "ผ่านทั้งหมด" || echo "มีข้ออ้างที่ไม่ผ่าน หรือเกตบางส่วนถูกข้าม"
exit $rc
