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
echo "== เลขคณิตของหน่วยความจำ (บท ddr-generations, bandwidth-numa-hbm) =="
# ความหน่วงเป็น ns = CL / clock(MHz) * 1000 — DDR5-6400 CL46
chk "DDR5-6400 CL46 = 14.4 ns" \
  "$(python3 -c 'print(f"{46/3200*1000:.1f}")')" "14.4"
# ถ้าตรึงความหน่วง 14 ns ไว้ แต่ละรุ่นต้องใช้ CL กี่รอบ (ตารางในบทเรียน)
chk "ตรึง 14 ns: DDR-400 ต้อง CL 2.8" \
  "$(python3 -c 'print(f"{14e-9*200e6:.1f}")')" "2.8"
chk "ตรึง 14 ns: DDR4-3200 ต้อง CL 22.4" \
  "$(python3 -c 'print(f"{14e-9*1600e6:.1f}")')" "22.4"
chk "ตรึง 14 ns: DDR5-8800 ต้อง CL 61.6" \
  "$(python3 -c 'print(f"{14e-9*4400e6:.1f}")')" "61.6"
chk "อัตราส่งเพิ่มราว 22 เท่า จาก DDR-400 ถึง DDR5-8800" \
  "$(python3 -c 'print(round(8800/400))')" "22"
chk "DDR5-6400 ช่อง 64 บิต = 51.2 GB/s" \
  "$(python3 -c 'print(f"{6400*8/1000:.1f}")')" "51.2"
# HBM4: 2048 บิต x 8 Gb/s ต่อขา = 2 TB/s ต่อกอง (JEDEC JESD270-4, เม.ย. 2025)
chk "HBM4 2048 บิต x 8 Gb/s = 2 TB/s ต่อกอง" \
  "$(python3 -c 'print(f"{2048*8/8/1000:.0f}")')" "2"

echo
echo "== ขั้นบันไดแคช (บท locality) =="
# บทเรียนอ้างว่าช่วงราบจบตรงกับ L1 ที่เครื่องรายงาน และการกระโดดของระยะก้าว
# ตรงกับขนาดบรรทัดที่เครื่องรายงาน — ตรวจว่า "การวัดตรงกับที่ระบบรายงาน"
if [ "$(uname)" = "Darwin" ]; then
  line=$(sysctl -n hw.cachelinesize 2>/dev/null)
  l1=$(sysctl -n hw.perflevel0.l1dcachesize 2>/dev/null || sysctl -n hw.l1dcachesize)
elif [ -r /sys/devices/system/cpu/cpu0/cache/index0/coherency_line_size ]; then
  line=$(cat /sys/devices/system/cpu/cpu0/cache/index0/coherency_line_size)
  l1=$(( $(cat /sys/devices/system/cpu/cpu0/cache/index0/size | tr -dc 0-9) * 1024 ))
else
  line=""; l1=""
fi
if [ -n "$line" ] && [ -n "$l1" ]; then
  ok "ระบบรายงานขนาดบรรทัด ${line} ไบต์ · L1d ${l1} ไบต์ (บทอ้าง 128 และ 131072 บน Apple M4)"
else
  no "อ่านค่าแคชที่ระบบรายงาน" "ไม่พบ sysctl/sysfs — บทเรียนสอนให้เทียบการวัดกับค่านี้"
fi

cat > "$LAB/stride.c" <<'EOF'
#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <time.h>
static double now(void){struct timespec t;clock_gettime(CLOCK_MONOTONIC,&t);return t.tv_sec+t.tv_nsec/1e9;}
int main(int argc,char**argv){
  size_t bytes=(size_t)64*1024*1024, line=(size_t)atol(argv[1]);
  char*b=malloc(bytes); for(size_t i=0;i<bytes;i+=4096) b[i]=1;
  volatile long s=0; double r[2]; size_t st[2]={line/4,line};
  for(int k=0;k<2;k++){
    size_t iter=1000000,off=0; double t0=now();
    for(size_t i=0;i<iter;i++){ s+=b[off]; off+=st[k]; if(off>=bytes) off-=bytes; }
    r[k]=(now()-t0)*1e9/iter;
  }
  printf("%.3f\n", r[1]/r[0]);
  free(b); return 0;
}
EOF
if [ -n "$line" ] && $CC -O2 -o "$LAB/stride" "$LAB/stride.c" 2>/dev/null; then
  r=$("$LAB/stride" "$line")
  if python3 -c "import sys;sys.exit(0 if $r > 1.5 else 1)"; then
    ok "ระยะก้าวเท่าขนาดบรรทัดแพงกว่าระยะก้าวหนึ่งในสี่ (${r}x — การพนันทางพื้นที่มีอยู่จริง)"
  else
    no "ควรเห็นการกระโดดที่ขนาดบรรทัด" "ได้แค่ ${r}x ที่ระยะก้าว ${line} ไบต์"
  fi
fi

echo
echo "== ชนกันในแคช ไม่ใช่ TLB (บท cache-mapping) =="
# ข้ออ้างชี้ขาดของบท: จำนวนหน้าเท่าเดิม เลื่อนตำแหน่งในหน้า 1 บรรทัด แล้วเร็วขึ้นมาก
cat > "$LAB/conflict.c" <<'EOF'
#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <time.h>
static double now(void){struct timespec t;clock_gettime(CLOCK_MONOTONIC,&t);return t.tv_sec+t.tv_nsec/1e9;}
static double bench(char*b,size_t gap,size_t skew){
  volatile long s=0; size_t iter=10000000;
  for(int w=0;w<64;w++) s+=b[w*gap+w*skew];
  double t0=now();
  for(size_t i=0;i<iter;i++){ size_t w=i&63; s+=b[w*gap+w*skew]; }
  return (now()-t0)*1e9/iter;
}
int main(int argc,char**argv){
  size_t line=(size_t)atol(argv[1]), bytes=(size_t)64*1024*1024;
  char*b=aligned_alloc(4096,bytes);
  for(size_t i=0;i<bytes;i+=4096) b[i]=1;
  printf("%.3f\n", bench(b,65536,0)/bench(b,65536,line));
  free(b); return 0;
}
EOF
if [ -n "$line" ] && $CC -O2 -o "$LAB/conflict" "$LAB/conflict.c" 2>/dev/null; then
  r=$("$LAB/conflict" "$line")
  if python3 -c "import sys;sys.exit(0 if $r > 2.0 else 1)"; then
    ok "หน้าเท่าเดิม เลื่อนในหน้าแล้วเร็วขึ้น ${r}x — ตัด TLB ออก เหลือบิตดัชนี (บทอ้าง 12 เท่า)"
  else
    no "การทดลองชี้ขาดของบท cache-mapping" "ได้แค่ ${r}x — ถ้าเครื่องนี้เชื่อมโยงหลายทางกว่า ให้ตรวจก่อนแก้บทเรียน"
  fi
fi

echo
echo "== false sharing (บท hit-miss-and-write-policy) =="
cat > "$LAB/fs.c" <<'EOF'
#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <pthread.h>
#include <time.h>
static double now(void){struct timespec t;clock_gettime(CLOCK_MONOTONIC,&t);return t.tv_sec+t.tv_nsec/1e9;}
enum { ITER = 20000000, NT = 4 };
static long *slots; static size_t gap;
static void*worker(void*a){ long id=(long)a; volatile long*p=&slots[id*gap];
  for(long i=0;i<ITER;i++) (*p)++; return NULL; }
static double run(size_t g,size_t align){
  gap=g; size_t need=(NT*g+16)*sizeof(long); need=(need+align-1)/align*align;
  slots=aligned_alloc(align,need); if(!slots) return -1;
  for(size_t i=0;i<need/sizeof(long);i++) slots[i]=0;
  pthread_t t[NT]; double t0=now();
  for(long i=0;i<NT;i++) pthread_create(&t[i],NULL,worker,(void*)i);
  for(int i=0;i<NT;i++) pthread_join(t[i],NULL);
  double dt=now()-t0; free(slots); return dt;
}
int main(int argc,char**argv){
  size_t line=(size_t)atol(argv[1]);
  double a=run(1,line), b=run(line/sizeof(long),line);
  if(a<0||b<0){ printf("0\n"); return 1; }
  printf("%.3f\n", a/b);
  return 0;
}
EOF
if [ -n "$line" ] && $CC -O2 -o "$LAB/fs" "$LAB/fs.c" -lpthread 2>/dev/null; then
  r=$("$LAB/fs" "$line")
  if python3 -c "import sys;sys.exit(0 if $r > 1.5 else 1)"; then
    ok "ตัวนับ 4 ตัวในบรรทัดเดียวช้ากว่าเติมช่องว่าง ${r}x (บทอ้าง 3.92 เท่า) — ผลลัพธ์ถูกต้องทั้งคู่"
  else
    no "ควรเห็น false sharing" "ได้แค่ ${r}x"
  fi
fi

echo
printf 'arch-claims: ผ่าน %d · ล้มเหลว %d\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
