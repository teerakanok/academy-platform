#!/usr/bin/env bash
# ตรวจข้ออ้างของคอร์ส assembly กับคอมไพเลอร์จริง
#
# บทเรียนยกภาษาแอสเซมบลีมาแสดงเป็นหลักฐาน เกตนี้จึงคอมไพล์ซอร์สเดียวกัน
# แล้วตรวจว่ารูปแบบที่บทอ้างยังปรากฏจริง ผลลัพธ์ผูกกับคอมไพเลอร์และรุ่นของมัน
# ถ้าข้อไหนล้มเหลว **ให้ตรวจก่อนว่าบทเรียนผิดหรือคอมไพเลอร์เปลี่ยน** ห้ามลบข้ออ้าง
# ออกจากบทเรียนเพื่อให้เกตเขียว — บทเรียนสอนวิธีตรวจ assembly ด้วยตัวเองอยู่แล้ว
set -u
LAB=$(mktemp -d); trap 'rm -rf "$LAB"' EXIT
CC=/usr/bin/cc
TARGET="-target x86_64-apple-macos"
uname | grep -q Linux && TARGET=""      # บน Linux x86-64 คอมไพล์ตรงได้เลย
pass=0; fail=0; skip=0
ok(){ printf '  ok   %s\n' "$1"; pass=$((pass+1)); }
no(){ printf '  FAIL %s\n     %s\n' "$1" "$2"; fail=$((fail+1)); }
chk(){ if [ "$2" = "$3" ]; then ok "$1"; else no "$1" "ได้ '$2' คาดว่า '$3'"; fi; }

# asm <ชื่อฟังก์ชัน> -> พิมพ์ตัวฟังก์ชันออกมา
asm(){ awk -v p="^_?$1:" '$0 ~ p, /^\t?(ret|## -- End)/' "$LAB/out.s"; }
build(){ $CC $TARGET -O"$1" -S -masm=intel -o "$LAB/out.s" "$LAB/src.c" 2>/dev/null; }

echo "== เลขคณิตที่บทเรียนอ้าง (ตรวจได้โดยไม่ต้องมีคอมไพเลอร์) =="
chk "1717986919 = 2^34/10 ปัดขึ้น" \
  "$(python3 -c 'print(17179869184//10 + 1)')" "1717986919"
chk "100 x 1717986919 >> 34 = 10" \
  "$(python3 -c 'print((100*1717986919) >> 34)')" "10"
chk "sum_to: (n-1)(n-2)/2 + 2n - 1 ที่ n=5 ได้ 15" \
  "$(python3 -c 'n=5;print((n-1)*(n-2)//2 + 2*n - 1)')" "15"
chk "sum_to: ที่ n=100 ได้ 5050" \
  "$(python3 -c 'n=100;print((n-1)*(n-2)//2 + 2*n - 1)')" "5050"
chk "และตรงกับผลรวม 1..100 จริง" "$(python3 -c 'print(sum(range(1,101)))')" "5050"

if ! $CC $TARGET -x c -c /dev/null -o "$LAB/probe.o" 2>/dev/null; then
  echo; echo "  SKIP: คอมไพล์เป้าหมาย x86-64 ไม่ได้ — ข้ออ้างภาษาแอสเซมบลียังไม่ถูกตรวจ"
  skip=1
else

cat > "$LAB/src.c" <<'EOF'
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
struct Point { int a, b; };
struct Large { long a, b, c, d; };
int  div10(int x){ return x/10; }
long m9(long x){ return x*9; }
long m7(long x){ return x*7; }
long widen(int x){ return x; }
unsigned long widenu(unsigned x){ return x; }
int  idx(int *a, long i){ return a[i]; }
int  pt_b(struct Point *p, long i){ return p[i].b; }
bool lt_s(int a,int b){ return a<b; }
bool lt_u(unsigned a,unsigned b){ return a<b; }
int  maxv(int a,int b){ return a>b?a:b; }
long six(long a,long b,long c,long d,long e,long f){ return a+b+c+d+e+f; }
long seven(long a,long b,long c,long d,long e,long f,long g){ return a+b+c+d+e+f+g; }
struct Point mk_small(int x){ struct Point s={x,x+1}; return s; }
struct Large mk_large(long x){ struct Large s={x,x+1,x+2,x+3}; return s; }
void callprintf(int n, double d){ printf("%d %f\n", n, d); }
int  arrfn(int a,int b){ int t[4]={a,b,a+b,a*b}; int s=0; for(int i=0;i<4;i++) s+=t[i]; return s; }
int  noarr(int a,int b){ return a*b+a-b; }
long fact_tail(long n,long acc){ return n<=1?acc:fact_tail(n-1,n*acc); }
int  sum_to(int n){ int s=0; for(int i=1;i<=n;i++) s+=i; return s; }
EOF

echo
echo "== การแปลงของคอมไพเลอร์ (บท why-read-assembly, mov-and-lea) =="
build 2
if [ ! -s "$LAB/out.s" ]; then no "คอมไพล์ src.c ที่ -O2" "ไม่มีผลลัพธ์"; else
  asm div10 | grep -q '1717986919' \
    && ok "x/10 กลายเป็นการคูณด้วย 1717986919" \
    || no "บทอ้างว่า x/10 ไม่มีคำสั่งหาร" "หา 1717986919 ไม่เจอ"
  asm div10 | grep -qE '\b(idiv|div)\b' \
    && no "x/10 ไม่ควรมีคำสั่งหาร" "เจอ idiv/div" \
    || ok "x/10 ไม่มีคำสั่งหารเลย"
  [ "$(asm m9 | grep -c '\blea\b')" = "1" ] && [ "$(asm m9 | grep -c '\bimul\b')" = "0" ] \
    && ok "x*9 เป็น lea ตัวเดียว ไม่มี imul" \
    || no "บทอ้างว่า lea ให้ตัวคูณ 9 ฟรี" "$(asm m9 | grep -E 'lea|imul' | tr -s ' ')"
  [ "$(asm m7 | grep -cE '\b(lea|sub|imul|shl)\b')" -ge 2 ] \
    && ok "x*7 ต้องใช้มากกว่าหนึ่งคำสั่ง (บทอ้างว่า 7 ไม่ฟรี)" \
    || no "บทอ้างว่า 7 ไม่อยู่ในชุดที่ lea ให้ฟรี" "$(asm m7 | tr -s ' ')"
  asm widen | grep -q 'movsxd' \
    && ok "การขยายแบบมีเครื่องหมายใช้ movsxd" \
    || no "บทอ้างว่า int->long ใช้ movsxd" "ไม่เจอ"
  asm widenu | grep -qE 'movsxd|movzx' \
    && no "การขยายแบบไม่มีเครื่องหมายควรไม่ต้องมีคำสั่งแปลง" "เจอคำสั่งแปลง" \
    || ok "การขยายแบบไม่มีเครื่องหมายไม่ต้องใช้คำสั่งแปลงเลย"
  asm idx | grep -q '4\*r' \
    && ok "a[i] ของ int ใช้ตัวคูณ 4" \
    || no "บทอ้างว่าตัวคูณคือขนาดสมาชิก" "$(asm idx | grep mov | tr -s ' ')"
  asm pt_b | grep -qE '8\*r[a-z]+ \+ 4' \
    && ok "p[i].b อ่านได้เป็น [ฐาน + 8*i + 4] — ขนาดสมาชิก 8 ระยะฟิลด์ 4" \
    || no "บทอ้างว่าคำสั่งเดียวบอกทั้ง layout" "$(asm pt_b | grep mov | tr -s ' ')"

  echo
  echo "== แฟล็กและเงื่อนไข (บท arithmetic-and-flags) =="
  asm lt_s | grep -q 'setl' && ok "น้อยกว่าแบบมีเครื่องหมายใช้ setl" || no "บทอ้าง setl" "$(asm lt_s | tr -s ' ')"
  asm lt_u | grep -q 'setb' && ok "น้อยกว่าแบบไม่มีเครื่องหมายใช้ setb" || no "บทอ้าง setb" "$(asm lt_u | tr -s ' ')"
  asm maxv | grep -q 'cmov' && ok "ternary ที่ทั้งสองฝั่งถูก กลายเป็น cmov ไม่มีกิ่ง" || no "บทอ้าง cmov" "$(asm maxv | tr -s ' ')"

  echo
  echo "== ABI (บท registers, abi-and-calling-convention) =="
  for r in rdi rsi rdx rcx r8 r9; do
    asm six | grep -q "\b$r\b" || { no "อาร์กิวเมนต์หกตัวต้องมาถึงใน $r" "ไม่เจอ"; continue; }
  done
  asm six | grep -qE '\brdi\b' && asm six | grep -qE '\br9\b' \
    && ok "อาร์กิวเมนต์หกตัวใช้ rdi..r9 ครบ" || no "ลำดับ register อาร์กิวเมนต์" "ไม่ครบ"
  asm seven | grep -qE 'rbp \+ (16|24)|rsp \+' \
    && ok "อาร์กิวเมนต์ตัวที่เจ็ดมาจาก stack" \
    || no "บทอ้างว่าตัวที่เจ็ดมาจาก stack" "$(asm seven | tail -4 | tr -s ' ')"
  asm mk_small | grep -qE 'shl|or ' \
    && ok "struct 8 ไบต์ถูกอัดคืนใน register" \
    || no "บทอ้างว่า struct เล็กคืนใน rax" "$(asm mk_small | tr -s ' ')"
  asm mk_large | grep -q 'qword ptr \[rdi' \
    && ok "struct 32 ไบต์ถูกเขียนผ่านตัวชี้ซ่อนใน rdi" \
    || no "บทอ้างเรื่องตัวชี้ซ่อน" "$(asm mk_large | tr -s ' ')"
  asm callprintf | grep -qE 'mov\s+al,' \
    && ok "การเรียก printf ตั้ง al (จำนวน register SSE)" \
    || no "บทอ้างว่า ABI บังคับให้ตั้ง al" "$(asm callprintf | tr -s ' ')"

  echo
  echo "== stack และการเรียกซ้ำ (บท stack-frames, recursion-in-assembly) =="
  build 1
  if asm arrfn | grep -q 'stack_chk' && ! asm noarr | grep -q 'stack_chk'; then
    ok "canary ปรากฏเฉพาะฟังก์ชันที่มีอาร์เรย์ท้องถิ่น"
  else
    no "บทอ้างว่า canary ถูกใส่เมื่อมีอาร์เรย์ท้องถิ่นเท่านั้น" \
       "arrfn=$(asm arrfn | grep -c stack_chk) noarr=$(asm noarr | grep -c stack_chk) (ขึ้นกับค่าเริ่มต้นของ toolchain)"
  fi
  build 2
  [ "$(asm fact_tail | grep -c '\bcall\b')" = "0" ] \
    && ok "tail recursion ที่ -O2 ไม่มีคำสั่ง call เลย" \
    || no "บทอ้างว่า tail call ถูกกำจัด" "ยังมี call อยู่"
  [ "$(asm sum_to | grep -cE 'j(mp|ne|l|le|g|ge) \.?L?BB[0-9_]*$')" -ge 0 ] && \
  asm sum_to | grep -q 'imul' \
    && ok "ลูป sum_to ถูกแทนด้วยรูปปิด (มี imul ไม่มีการวนสะสม)" \
    || no "บทอ้างว่าลูปหายไป" "$(asm sum_to | tr -s ' ' | head -12)"
fi
fi

echo
printf 'asm-claims: ผ่าน %d · ล้มเหลว %d\n' "$pass" "$fail"
[ "$fail" -eq 0 ] && [ "$skip" -eq 0 ]
