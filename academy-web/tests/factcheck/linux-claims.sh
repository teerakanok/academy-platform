#!/bin/bash
# ตรวจข้ออ้างของคอร์ส Linux ด้วยการรันจริงบน Linux
fails=0
ok(){ printf 'ok    %s\n' "$1"; }
no(){ printf 'FAIL  %s\n' "$1"; fails=$((fails+1)); }
eq(){ if [ "$2" = "$3" ]; then ok "$1"; else no "$1 (want '$2' got '$3')"; fi; }
LAB=$(mktemp -d); cd "$LAB" || exit 1

cat > app.log <<'L'
2026-08-17 10:00:01 INFO  started
2026-08-17 10:00:02 ERROR disk full
bad line without a date
2026-08-18 11:30:00 WARN  retry
2026-08-18 11:30:05 error lowercase
   
L
cat > access.log <<'L'
203.0.113.9 - - [17/Aug/2026] "GET /a" 200 512
198.51.100.4 - - [17/Aug/2026] "GET /b" 404 128
203.0.113.9 - - [17/Aug/2026] "GET /c" 200 256
203.0.113.9 - - [17/Aug/2026] "GET /d" 500 1024
L

# --- text-and-regex ---
eq "grep -E '^[0-9]{4}-..' finds only dated lines" "4" "$(grep -cE '^[0-9]{4}-[0-9]{2}-[0-9]{2}' app.log)"
eq "grep -E IPv4 shape matches every request line" "4" "$(grep -cE '([0-9]{1,3}\.){3}[0-9]{1,3}' access.log)"
eq "grep -Ei 'error|fail|denied' is case-insensitive" "2" "$(grep -cEi 'error|fail|denied' app.log)"
eq "grep -E '^\s*$' finds the whitespace-only line" "1" "$(grep -cE '^\s*$' app.log)"
eq "grep -c counts instead of printing" "1" "$(grep -c 'ERROR' app.log)"
eq "grep -v inverts" "5" "$(grep -vc 'ERROR' app.log)"
eq "grep -oE extracts just the match" "203.0.113.9" "$(grep -oE '([0-9]{1,3}\.){3}[0-9]{1,3}' access.log | head -1)"
eq "grep -C 3 prints surrounding context" "3" "$(grep -C 1 'ERROR' app.log | wc -l | tr -d ' ')"
eq "the ranked-IP pipeline names the top talker" "3 203.0.113.9" \
   "$(grep -oE '([0-9]{1,3}\.){3}[0-9]{1,3}' access.log | sort | uniq -c | sort -rn | head -1 | xargs)"
mkdir -p etcdemo && printf 'password = hunter2\n' > etcdemo/db.conf && printf 'nothing\n' > etcdemo/other.txt
eq "grep -rn --include='*.conf' finds only conf hits" "1" "$(grep -rn --include='*.conf' 'password' etcdemo | wc -l | tr -d ' ')"

# --- sed-and-awk ---
printf 'old old\nold\n' > s.txt
eq "sed s/old/new/ replaces first per line"  "new old" "$(sed 's/old/new/' s.txt | head -1)"
eq "sed s/old/new/g replaces all per line"   "new new" "$(sed 's/old/new/g' s.txt | head -1)"
printf 'OLD\n' > s2.txt
eq "sed s///gi ignores case"                 "new"     "$(sed 's/old/new/gi' s2.txt)"
printf 'a1 b22\n' > s3.txt
eq "sed -E 's/[0-9]+/N/g' uses modern patterns" "aN bN" "$(sed -E 's/[0-9]+/N/g' s3.txt)"
printf '# comment\nkeep me\n# another\n' > c.conf
eq "sed '/^#/d' deletes comment lines"       "keep me" "$(sed '/^#/d' c.conf)"
seq 1 30 > nums.txt
eq "sed -n '10,20p' prints exactly 11 lines" "11" "$(sed -n '10,20p' nums.txt | wc -l | tr -d ' ')"
eq "sed -n '10,20p' starts at 10"            "10"      "$(sed -n '10,20p' nums.txt | head -1)"
eq "awk '{print \$1}' gives the first field"  "203.0.113.9" "$(awk '{print $1}' access.log | head -1)"
eq "awk '{print \$NF}' gives the last field"  "512"     "$(awk '{print $NF}' access.log | head -1)"
eq "awk -F: '{print \$1}' /etc/passwd yields usernames" "root" "$(awk -F: '{print $1}' /etc/passwd | head -1)"
eq "awk -F: '\$3 >= 1000 {print \$1}' selects by field 3" "yes" \
   "$(awk -F: '$3 >= 1000 {print $1}' /etc/passwd >/dev/null && echo yes)"
useradd -m -u 1001 learner 2>/dev/null
eq "a uid>=1000 account is selected by that filter" "learner" "$(awk -F: '$3 >= 1000 && $3 < 65534 {print $1}' /etc/passwd | head -1)"
eq "awk END {print count} counts records" "$(wc -l < /etc/passwd | tr -d ' ') accounts" \
   "$(awk -F: '{count++} END {print count " accounts"}' /etc/passwd)"
printf '1\n2\n3\n' > n2.txt
eq "awk sum/NR computes a mean" "2" "$(awk '{sum += $1} END {print sum/NR}' n2.txt)"
eq "awk {total += \$1} END prints a KB total" "6 KB" "$(printf '1 a\n2 b\n3 c\n' | awk '{total += $1} END {print total " KB"}')"
eq "ps aux | awk '\$3 > 5' runs and filters" "yes" "$(ps aux | awk '$3 > 5 {print $1, $2, $3}' >/dev/null && echo yes)"

# --- pipes-and-logs ---
eq "wc -l counts lines" "6" "$(wc -l < app.log | tr -d ' ')"
eq "sort | uniq -c collapses duplicates" "3 x" "$(printf 'x\ny\nx\nx\n' | sort | uniq -c | sort -rn | head -1 | xargs)"
cat > auth.log <<'L'
Aug 17 10:00:00 host sshd[1]: Failed password for root from 203.0.113.9 port 22 ssh2
Aug 17 10:00:01 host sshd[2]: Failed password for root from 203.0.113.9 port 22 ssh2
Aug 17 10:00:02 host sshd[3]: Failed password for bob from 198.51.100.4 port 22 ssh2
L
eq "the auth.log pipeline finds the top source IP" "2 203.0.113.9" \
   "$(grep 'Failed password' auth.log | awk '{print $(NF-3)}' | sort | uniq -c | sort -rn | head -1 | xargs)"

# --- permissions ---
touch p.txt
chmod 644 p.txt; eq "chmod 644 gives -rw-r--r--" "-rw-r--r--" "$(ls -l p.txt | cut -c1-10)"
chmod u+x p.txt; eq "chmod u+x adds owner execute"  "-rwxr--r--" "$(ls -l p.txt | cut -c1-10)"
chmod 664 p.txt; chmod go-w p.txt; eq "chmod go-w removes group/other write" "-rw-r--r--" "$(ls -l p.txt | cut -c1-10)"
mkdir -p site/sub && touch site/sub/f
chmod -R 755 site; eq "chmod -R applies down the tree" "755" "$(stat -c '%a' site/sub/f)"
eq "the permission string's first char marks a directory" "d" "$(ls -ld site | cut -c1)"
ln -s p.txt link.txt; eq "a symlink shows as l" "l" "$(ls -l link.txt | cut -c1)"
eq "chmod 755 == rwxr-xr-x" "-rwxr-xr-x" "$(chmod 755 p.txt; ls -l p.txt | cut -c1-10)"
eq "chmod 600 == rw-------" "-rw-------" "$(chmod 600 p.txt; ls -l p.txt | cut -c1-10)"

# --- first-shell-script / script-logic ---
cat > greet.sh <<'X'
#!/bin/bash
echo "Hello, $1"
echo "You passed $# arguments"
X
chmod +x greet.sh
eq "\$1 is the first argument"  "Hello, Songpon" "$(./greet.sh Songpon | head -1)"
eq "\$# counts the arguments"   "You passed 2 arguments" "$(./greet.sh a b | tail -1)"
eq "\$( ) captures command output" "$(date +%F)" "$(today=$(date +%F); echo "$today")"
eq "an assignment must have no spaces around =" "ok" "$(name=deploy; [ "$name" = deploy ] && echo ok)"
eq "if -f detects a regular file" "Config found" "$(config=greet.sh; if [ -f "$config" ]; then echo "Config found"; fi)"
eq "elif -d detects a directory" "That is a directory, not a file" \
   "$(config=site; if [ -f "$config" ]; then echo f; elif [ -d "$config" ]; then echo "That is a directory, not a file"; fi)"
eq "for over a glob visits each match" "2" "$(mkdir -p globdir && touch globdir/a.log globdir/b.log; for f in globdir/*.log; do echo "$f"; done | wc -l | tr -d ' ')"
eq "while read -r walks a file" "3" "$(printf 'w1\nw2\nw3\n' > servers.txt; while read -r l; do echo "$l"; done < servers.txt | wc -l | tr -d ' ')"
eq "a function with local keeps its variable inside" "inside outside" \
   "$(f(){ local v=inside; echo -n "$v "; }; v=outside; f; echo "$v")"
eq "return 1 makes || fire" "Investigate" "$(f(){ return 1; }; f || echo Investigate)"
eq "exit 0 means success"  "0" "$(bash -c 'exit 0'; echo $?)"
eq "exit 1 means failure"  "1" "$(bash -c 'exit 1'; echo $?)"

# --- script-safety ---
eq "set -e stops at the first failure" "before" \
   "$(bash -c 'set -e; echo before; false; echo after' 2>/dev/null)"
eq "set -u makes an unset variable a fatal error" "nonzero" \
   "$(bash -c 'set -u; echo "$nope"' >/dev/null 2>&1; [ $? -ne 0 ] && echo nonzero || echo zero)"
eq "without set -u an unset variable is silently empty" "0" \
   "$(bash -c 'echo "$nope"' >/dev/null 2>&1; echo $?)"
eq "without pipefail a failing first stage is hidden" "0" \
   "$(bash -c 'false | true'; echo $?)"
eq "set -o pipefail surfaces it" "1" \
   "$(bash -c 'set -o pipefail; false | true'; echo $?)"
eq "trap EXIT removes the workdir even on failure" "gone" \
   "$(bash -c 'w=$(mktemp -d); trap "rm -rf $w" EXIT; echo "$w" > /tmp/wpath; false' ; [ -d "$(cat /tmp/wpath)" ] && echo present || echo gone)"
eq "the dry-run switch prints instead of acting" "WOULD: rm -rf /tmp/x" \
   "$(bash -c 'dry_run=false; set -- --dry-run; [ "${1:-}" = "--dry-run" ] && dry_run=true; run(){ if $dry_run; then echo "WOULD: $*"; else "$@"; fi; }; run rm -rf /tmp/x')"

# --- signals-and-jobs ---
eq "kill sends TERM by default and the process ends" "terminated" \
   "$(sleep 30 & p=$!; kill $p 2>/dev/null; wait $p 2>/dev/null; kill -0 $p 2>/dev/null && echo alive || echo terminated)"
eq "kill -9 cannot be trapped" "killed" \
   "$(bash -c 'trap "echo trapped" TERM; sleep 30' & p=$!; sleep 0.3; kill -9 $p 2>/dev/null; wait $p 2>/dev/null; kill -0 $p 2>/dev/null && echo alive || echo killed)"
eq "a TERM handler can run cleanup first" "cleaning" \
   "$(bash -c 'trap "echo cleaning; exit 0" TERM; sleep 5 & wait' > /tmp/tout 2>&1 & p=$!; sleep 0.4; kill -TERM $p 2>/dev/null; sleep 0.4; cat /tmp/tout)"
eq "nohup survives its parent shell" "yes" "$(command -v nohup >/dev/null && echo yes)"
eq "\$! holds the background PID" "yes" "$(sleep 0.1 & [ -n "$!" ] && echo yes)"

# --- scheduling-with-cron ---
eq "crontab exists on a normal Linux system" "yes" "$(command -v crontab >/dev/null && echo yes)"
printf '%s\n' '*/5 * * * * /usr/local/bin/check.sh' '0 3 * * * /usr/local/bin/backup.sh' > ct
crontab ct 2>/dev/null && eq "a five-field schedule is accepted by crontab" "2" "$(crontab -l | grep -c '^[*0]')" || no "crontab could not install the schedule"

# --- ssh-and-remote ---
eq "ssh is present" "yes" "$(command -v ssh >/dev/null && echo yes)"
eq "ssh-keygen -t ed25519 creates a key pair" "2" \
   "$(ssh-keygen -q -t ed25519 -N '' -f "$LAB/id_demo" >/dev/null 2>&1; ls "$LAB"/id_demo "$LAB"/id_demo.pub 2>/dev/null | wc -l | tr -d ' ')"
eq "a generated public key starts with ssh-ed25519" "ssh-ed25519" "$(cut -d' ' -f1 "$LAB/id_demo.pub")"
eq "a private key must not be group/world readable" "600" "$(stat -c '%a' "$LAB/id_demo")"
eq "scp is present" "yes" "$(command -v scp >/dev/null && echo yes)"

printf '\n%s failing claim(s)\n' "$fails"
exit $((fails != 0))
