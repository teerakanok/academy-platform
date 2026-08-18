#!/usr/bin/env bash
# ตรวจข้ออ้างของคอร์ส computer-architecture กับเครื่องจริงและคอมไพเลอร์จริง
#
# ข้ออ้างเชิงตัวเลขที่วัดจากเครื่อง (6.94x, 4.00x, 1.94x) ขึ้นกับฮาร์ดแวร์
# เกตนี้จึงตรวจ "ทิศทาง" ที่บทเรียนสอน ไม่ใช่ตัวเลขเป๊ะ ๆ ของเครื่องผู้เขียน
# เพราะการ pin ตัวเลขเครื่องหนึ่งไว้ในเกตคือการทำให้เกตโกหกบนเครื่องอื่น
set -u
LAB=$(mktemp -d); trap 'rm -rf "$LAB"' EXIT
CC=/usr/bin/cc
pass=0; fail=0
ok(){ printf '  ok   %s\n' "$1"; pass=$((pass+1)); }
no(){ printf '  FAIL %s\n     %s\n' "$1" "$2"; fail=$((fail+1)); }
chk(){ # chk <label> <actual> <expected>
  if [ "$2" = "$3" ]; then ok "$1"; else no "$1" "ได้ '$2' คาดว่า '$3'"; fi; }

echo "== เลขคณิตของสายพาน (บท pipeline-stages, multi-cycle-and-cpi) =="
# 1000 คำสั่ง x 5 รอบ = 5000 · สายพาน = 4 + 1000 = 1004 · 5000/1004 = 4.98
chk "1000 คำสั่ง 5 ขั้น -> 4.98 เท่า" \
  "$(python3 -c 'print(f"{5000/1004:.2f}")')" "4.98"
chk "10 คำสั่ง 5 ขั้น -> 3.6 เท่า" \
  "$(python3 -c 'print(f"{50/14:.1f}")')" "3.6"
# multi-cycle: 500 arith x4 + 300 load x5 + 200 branch x3 = 2000+1500+600 = 4100
chk "ตัวอย่าง CPI: 4100 รอบ" \
  "$(python3 -c 'print(500*4+300*5+200*3)')" "4100"
chk "ตัวอย่าง CPI: ดีขึ้น 18%" \
  "$(python3 -c 'print(f"{(5000-4100)/5000*100:.0f}")')" "18"
chk "ตัวอย่าง CPI: 4.1 รอบต่อคำสั่ง" \
  "$(python3 -c 'print(f"{4100/1000:.1f}")')" "4.1"

echo
echo "== การเข้ารหัส RISC-V (บท instruction-encoding) =="
# add/sub ต่างกันที่บิต 30 เพียงบิตเดียว — ข้ออ้างหลักของบท
add=$(python3 -c 'print(hex((0<<25)|(7<<20)|(6<<15)|(0<<12)|(5<<7)|0x33))')
sub=$(python3 -c 'print(hex((0x20<<25)|(7<<20)|(6<<15)|(0<<12)|(5<<7)|0x33))')
chk "add x5,x6,x7 = 0x007302b3" "$add" "0x7302b3"
chk "sub x5,x6,x7 = 0x407302b3" "$sub" "0x407302b3"
chk "add กับ sub ต่างกัน 1 บิต" \
  "$(python3 -c "print(bin(0x007302b3 ^ 0x407302b3).count('1'))")" "1"
chk "บิตที่ต่างคือบิต 30" \
  "$(python3 -c "print((0x007302b3 ^ 0x407302b3).bit_length()-1)")" "30"

echo
echo "== การทำนายกิ่ง (บทรวบยอด control-hazards-and-prediction) =="
cat > "$LAB/branch.c" <<'EOF'
#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
static double now(void){struct timespec t;clock_gettime(CLOCK_MONOTONIC,&t);return t.tv_sec+t.tv_nsec/1e9;}
static int cmp(const void*a,const void*b){return (*(int*)a)-(*(int*)b);}
enum { N = 1<<20, REP = 16 };
static int data[N], uns[N], srt[N];
long sum_branch(void){long s=0;for(int r=0;r<REP;r++)for(int i=0;i<N;i++) if(data[i]>=128) s+=data[i]; return s;}
static double run(int*src){memcpy(data,src,sizeof data);double t=now();volatile long s=sum_branch();(void)s;return now()-t;}
int main(void){
  unsigned seed=1;
  for(int i=0;i<N;i++){seed=seed*1103515245u+12345u;uns[i]=(seed>>16)&255;}
  memcpy(srt,uns,sizeof srt); qsort(srt,N,sizeof(int),cmp);
  double bu=1e9,bs=1e9;
  for(int k=0;k<3;k++){double u=run(uns),s=run(srt);if(u<bu)bu=u;if(s<bs)bs=s;}
  printf("%.3f\n", bu/bs);
  return 0;
}
EOF
if $CC -O0 -o "$LAB/br0" "$LAB/branch.c" 2>/dev/null; then
  r=$("$LAB/br0")
  # บทอ้างว่าข้อมูลที่ทำนายไม่ได้แพงกว่า "มาก" ที่ -O0 (เครื่องผู้เขียน 6.94x)
  if python3 -c "import sys;sys.exit(0 if $r > 2.0 else 1)"; then
    ok "-O0: ไม่เรียงแพงกว่าเรียงอย่างมีนัย (${r}x, บทอ้าง 6.94x บนเครื่องผู้เขียน)"
  else
    no "-O0: ควรเห็นค่าปรับการทำนายผิด" "ได้แค่ ${r}x — ตรวจว่าคอมไพเลอร์ยังเก็บกิ่งไว้จริงไหม"
  fi
else
  no "คอมไพล์ branch.c" "cc ล้มเหลว"
fi

# ข้ออ้างสำคัญของบท: ที่ -O2 คอมไพเลอร์ "กำจัดกิ่งทิ้ง" ไม่ใช่ทำนายเก่งขึ้น
asm=$($CC -O2 -S -o - "$LAB/branch.c" 2>/dev/null)
if printf '%s' "$asm" | grep -qE 'cmgt|cmge|pcmpgt|vpcmpgt|cmpps'; then
  ok "-O2: ลูปกลายเป็นการเทียบแบบเวกเตอร์ (ไม่มีกิ่งให้ทำนาย)"
else
  no "-O2: บทอ้างว่ากิ่งถูกกำจัด" "หาคำสั่งเทียบแบบเวกเตอร์ไม่เจอ — ข้ออ้างนี้ผูกกับคอมไพเลอร์/สถาปัตยกรรม โปรดตรวจก่อนแก้บทเรียน"
fi

echo
echo "== ความพึ่งพาของข้อมูล (บท data-hazards-and-forwarding) =="
cat > "$LAB/dep.c" <<'EOF'
#define _GNU_SOURCE
#include <stdio.h>
#include <time.h>
static double now(void){struct timespec t;clock_gettime(CLOCK_MONOTONIC,&t);return t.tv_sec+t.tv_nsec/1e9;}
#define KEEP(x) __asm__ volatile("" : "+r"(x))
enum { ITER = 100000000 };
int main(void){
  double t0,t1; long a=0,b0=0,b1=0,b2=0,b3=0;
  t0=now(); for(long i=0;i<ITER;i++){a=a+1;KEEP(a);} t1=now(); double c1=t1-t0;
  t0=now(); for(long i=0;i<ITER/4;i++){b0++;KEEP(b0);b1++;KEEP(b1);b2++;KEEP(b2);b3++;KEEP(b3);} t1=now();
  printf("%.3f\n", c1/(t1-t0));
  return 0;
}
EOF
if $CC -O2 -o "$LAB/dep" "$LAB/dep.c" 2>/dev/null; then
  r=$("$LAB/dep")
  if python3 -c "import sys;sys.exit(0 if $r > 1.5 else 1)"; then
    ok "โซ่อิสระเร็วกว่าโซ่เดียวอย่างมีนัย (${r}x, บทอ้าง 4.00x บนเครื่องผู้เขียน)"
  else
    no "ควรเห็นผลของ instruction-level parallelism" "ได้แค่ ${r}x"
  fi
else
  no "คอมไพล์ dep.c" "cc ล้มเหลว (ต้องรองรับ asm barrier)"
fi

echo
echo "== load-use (บท load-use-stall) =="
cat > "$LAB/lu.c" <<'EOF'
#define _GNU_SOURCE
#include <stdio.h>
#include <time.h>
static double now(void){struct timespec t;clock_gettime(CLOCK_MONOTONIC,&t);return t.tv_sec+t.tv_nsec/1e9;}
enum { NSLOT = 4096, ITER = 50000000 };
static long buf[NSLOT];
int main(void){
  for(int i=0;i<NSLOT;i++) buf[i]=(i+1)%NSLOT;
  double t0,t1; long p=0,s=0,idx=0;
  t0=now(); for(long i=0;i<ITER;i++) p=buf[p]; t1=now(); double chase=t1-t0;
  t0=now(); for(long i=0;i<ITER;i++){s+=buf[idx];idx=(idx+1)&(NSLOT-1);} t1=now();
  printf("%.3f %ld %ld\n", chase/(t1-t0), p, s);
  return 0;
}
EOF
if $CC -O2 -o "$LAB/lu" "$LAB/lu.c" 2>/dev/null; then
  set -- $("$LAB/lu")
  if python3 -c "import sys;sys.exit(0 if $1 > 1.2 else 1)"; then
    ok "load ที่พึ่งพากันแพงกว่า load อิสระ ทั้งที่อยู่ใน L1 ทั้งคู่ (${1}x, บทอ้าง 1.94x)"
  else
    no "ควรเห็นราคาของ load-use" "ได้แค่ ${1}x"
  fi
  # 4096 x 8 ไบต์ = 32 KB — ข้ออ้างว่า buffer เล็กพอที่จะอยู่ใน L1
  chk "buffer ในการทดลอง = 32 KB" "$(python3 -c 'print(4096*8//1024)')" "32"
else
  no "คอมไพล์ lu.c" "cc ล้มเหลว"
fi

echo
printf 'arch-claims: ผ่าน %d · ล้มเหลว %d\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
