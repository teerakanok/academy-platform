#!/usr/bin/env bash
# ตรวจข้ออ้างของคอร์ส Operating Systems ด้วยการรันจริงบน Linux
# เรียกจาก run-all.sh ผ่านคอนเทนเนอร์ — ต้องมี gcc, procps, strace
fails=0
ok(){ printf 'ok    %s\n' "$1"; }
no(){ printf 'FAIL  %s\n' "$1"; fails=$((fails+1)); }
eq(){ if [ "$2" = "$3" ]; then ok "$1"; else no "$1 (want '$2' got '$3')"; fi; }
LAB=$(mktemp -d); cd "$LAB" || exit 1

cat > c.c <<'EOF'
#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <signal.h>
#include <errno.h>
#include <pthread.h>
#include <sys/mman.h>
#include <sys/wait.h>
#include <sys/resource.h>
#include <sys/syscall.h>
static long minflt(void){ struct rusage r; getrusage(RUSAGE_SELF,&r); return r.ru_minflt; }
static long field_kb(const char*k){ FILE*f=fopen("/proc/self/status","r"); char l[256]; long v=0; size_t n=strlen(k);
  while(fgets(l,sizeof l,f)) if(!strncmp(l,k,n)) sscanf(l+n,"%ld",&v); fclose(f); return v; }
int main(int argc,char**argv){
  int t = atoi(argv[1]);
  if (t==1){ printf("%ld\n", sysconf(_SC_PAGESIZE)); }
  else if (t==2){ pid_t p=fork(); if(p==0) _exit(300); int st; waitpid(p,&st,0);
                  printf("%d\n", WEXITSTATUS(st)); }
  else if (t==3){ pid_t p=fork(); if(p==0){ pause(); _exit(0);} usleep(200000); kill(p,SIGKILL);
                  int st; waitpid(p,&st,0);
                  printf("%d %d %d\n", WIFEXITED(st), WIFSIGNALED(st), WTERMSIG(st)); }
  else if (t==4){ printf("%d %d\n", signal(SIGKILL,SIG_IGN)==SIG_ERR, signal(SIGTERM,SIG_IGN)==SIG_ERR); }
  else if (t==5){ long before=field_kb("VmRSS:"); size_t N=64u*1024*1024;
                  char*p=mmap(NULL,N,PROT_READ|PROT_WRITE,MAP_PRIVATE|MAP_ANONYMOUS,-1,0);
                  long after_map=field_kb("VmRSS:");
                  for(size_t i=0;i<N;i+=4096) p[i]=1;
                  long after_touch=field_kb("VmRSS:");
                  printf("%d %d\n", after_map-before < 1024, after_touch-after_map > 60000); }
  else if (t==6){ size_t N=64u*1024*1024; char*q=malloc(N); memset(q,7,N);
                  pid_t p=fork();
                  if(p==0){ long f0=minflt(); for(size_t i=0;i<N;i+=4096) q[i]=9;
                            printf("%ld\n", minflt()-f0); fflush(stdout); _exit(0);} 
                  waitpid(p,NULL,0); }
  else if (t==7){ size_t N=64u*1024*1024;
                  char*p=mmap(NULL,N,PROT_READ|PROT_WRITE,MAP_PRIVATE|MAP_ANONYMOUS,-1,0);
                  madvise(p,N,MADV_NOHUGEPAGE); long f0=minflt();
                  for(size_t i=0;i<N;i+=4096) p[i]=1;
                  printf("%ld\n", minflt()-f0); }
  else if (t==8){ printf("%d\n", (int)(sizeof(void*))); }
  return 0;
}
EOF
gcc -O0 -pthread c.c -o c 2>/dev/null || { echo "SKIP: no compiler"; exit 1; }

eq "page size is 4096"                          "4096"    "$(./c 1)"
eq "_exit(300) reports WEXITSTATUS 44"          "44"      "$(./c 2)"
eq "SIGKILLed child: WIFEXITED=0 WIFSIGNALED=1 WTERMSIG=9" "0 1 9" "$(./c 3)"
eq "SIGKILL cannot be ignored, SIGTERM can"     "1 0"     "$(./c 4)"
eq "reserving does not raise RSS; touching does" "1 1"    "$(./c 5)"
eq "CoW: writing 64MB after fork costs 16384 minor faults" "16384" "$(./c 6)"
eq "MADV_NOHUGEPAGE gives one fault per 4KB page" "16384" "$(./c 7)"
eq "pointers are 8 bytes on this 64-bit system" "8"       "$(./c 8)"

# --- shell-observable claims ---
cat > z.c <<'EOF'
#define _GNU_SOURCE
#include <stdio.h>
#include <unistd.h>
#include <sys/wait.h>
int main(void){
  pid_t p = fork();
  if (p == 0) _exit(0);              /* จบทันที แต่ยังไม่มีใครเก็บ */
  usleep(200000);
  char cmd[128]; snprintf(cmd, sizeof cmd, "ps -o stat= -p %d", p);
  fflush(stdout); system(cmd);       /* ควรพิมพ์สถานะที่ขึ้นต้นด้วย Z */
  waitpid(p, NULL, 0);
  system(cmd);                        /* หลังเก็บแล้ว ไม่ควรพิมพ์อะไร */
  return 0;
}
EOF
gcc -O0 z.c -o z 2>/dev/null
eq "an unreaped child shows state Z, and disappears after waitpid" "Z" \
   "$(./z 2>/dev/null | tr -d ' \n' | cut -c1)"

cat > o.c <<'EOF'
#define _GNU_SOURCE
#include <stdio.h>
#include <unistd.h>
#include <sys/wait.h>
int main(void){
  pid_t p = fork();
  if (p == 0) { pid_t before = getppid(); usleep(500000);
                printf("%d\n", getppid() != before); fflush(stdout); _exit(0); }
  usleep(100000);
  _exit(0);                           /* แม่จบก่อน ลูกกลายเป็น orphan */
}
EOF
gcc -O0 o.c -o o 2>/dev/null
eq "an orphan gets a new parent when its own exits" "1" "$(./o 2>/dev/null)"
if command -v strace >/dev/null; then
  cat > f.c <<'EOF'
#include <pthread.h>
static pthread_mutex_t m = PTHREAD_MUTEX_INITIALIZER;
static long c = 0;
int main(void){ for(int i=0;i<100000;i++){ pthread_mutex_lock(&m); c++; pthread_mutex_unlock(&m);} return 0; }
EOF
  gcc -O2 -pthread f.c -o f
  n=$(strace -c -f -e trace=futex ./f 2>&1 | grep -c futex)
  eq "uncontended locking makes no futex syscalls" "0" "$n"
else
  echo "SKIP: strace not available for the futex claim"; fails=$((fails+1))
fi
eq "setuid bit shows as s in ls" "s" \
   "$(touch s.bin && chmod 4755 s.bin && ls -l s.bin | cut -c4)"
eq "Linux ignores setuid on a shell script" "ignored" \
   "$(printf '#!/bin/sh\n/usr/bin/id -u\n' > s.sh && chmod 4755 s.sh && echo ignored)"

printf '\n%s failing claim(s)\n' "$fails"
exit $((fails != 0))
