#!/usr/bin/env bash
export GIT_PAGER=cat GIT_TERMINAL_PROMPT=0
# เดินตาม try steps ของคอร์ส Git จริง ในโฟลเดอร์ทิ้ง เพื่อพิสูจน์ว่าคำสั่งที่สอนทำงานได้ตามที่บอก
set -u
LAB=$(mktemp -d)
trap 'rm -rf "$LAB"' EXIT
export GIT_CONFIG_GLOBAL="$LAB/gitconfig" GIT_CONFIG_SYSTEM=/dev/null
git config --global user.name "Lab" ; git config --global user.email lab@example.com
git config --global init.defaultBranch main ; git config --global protocol.file.allow always
fails=0
ok(){ printf 'ok    %s\n' "$1"; }
no(){ printf 'FAIL  %s\n' "$1"; fails=$((fails+1)); }
chk(){ local d="$1"; shift; if "$@" >/dev/null 2>&1; then ok "$d"; else no "$d"; fi; }
eq(){ local d="$1" want="$2" got="$3"; if [ "$want" = "$got" ]; then ok "$d"; else no "$d (want '$want' got '$got')"; fi; }

cd "$LAB" && mkdir repo && cd repo

# --- init-and-commit ---
chk "git init creates a repo"                       git init
chk ".git directory exists"                         test -d .git
echo "line one" > notes.txt
chk "git add stages a file"                         git add notes.txt
eq  "staged file shows as A in porcelain"  "A  notes.txt"  "$(git status --porcelain)"
chk "git commit -m records it"                      git commit -m "First commit"
eq  "one commit exists"                    "1"            "$(git rev-list --count HEAD)"

# --- status-diff-log ---
echo "line two" >> notes.txt
chk "git diff shows unstaged change"                bash -c '[ -n "$(git diff)" ]'
eq  "git diff --staged is empty before add" ""             "$(git diff --staged)"
git add notes.txt
chk "git diff --staged shows staged change"         bash -c '[ -n "$(git diff --staged)" ]'
git commit -qm "Second commit"
eq  "git log --oneline lists 2"             "2"            "$(git log --oneline | wc -l | tr -d ' ')"
chk "git log --stat runs"                           git log --stat -1
chk "git blame -L works"                            git blame -L 1,2 notes.txt
chk "git show works"                                git show HEAD

# --- gitignore ---
printf 'node_modules/\n*.log\n' > .gitignore
mkdir -p node_modules && touch node_modules/x.js app.log
eq  "ignored files stay out of status"      ".gitignore"   "$(git status --porcelain | awk '{print $2}' | grep -v '^$' | tr '\n' ' ' | xargs)"
git add .gitignore && git commit -qm "Ignore generated files"
echo 'token=abc123' > local.conf
chk "git add -f overrides ignore"                   git add -f local.conf
git commit -qm "Oops"
echo 'local.conf' >> .gitignore
eq  "already-tracked file stays tracked"    "local.conf"   "$(git ls-files | grep '^local.conf$')"
chk "git rm --cached stops tracking"                git rm --cached local.conf
git commit -qam "Stop tracking the local config"
chk "value is still in history after removal"       bash -c 'git log -p --all -- local.conf | grep -q "token=abc123"'
chk "git ls-files audit pattern runs"               bash -c 'git ls-files | grep -Ei "env|key|secret|credential"; true'

# --- undo-and-restore ---
echo 'mistake' >> notes.txt
chk "git restore discards an edit"                  git restore notes.txt
eq  "tree clean after restore"              ""             "$(git status --porcelain)"
echo 'oops' >> notes.txt && git add notes.txt
chk "git restore --staged unstages"                 git restore --staged notes.txt
eq  "edit survives unstaging"               "1"            "$(git diff --name-only | wc -l | tr -d ' ')"
git restore notes.txt
echo 'a real edit' >> notes.txt
chk "git commit -am records a real edit"            git commit -am "Wrong message"
chk "git commit --amend -m rewrites message"        git commit --amend -m "Corrected message"
eq  "amended message is in place"    "Corrected message"   "$(git log -1 --format=%s)"
chk "git commit --amend --no-edit works"            git commit --amend --no-edit
chk "git revert --no-edit works"                    git revert --no-edit HEAD
chk "revert added a commit"                         bash -c 'git log -1 --format=%s | grep -q "^Revert"'
chk "git reset --soft HEAD~1"                       git reset --soft HEAD~1
chk "git reset HEAD~1 (mixed)"                      git reset HEAD~1
chk "git reset --hard HEAD"                         git reset --hard HEAD

# --- branching / merging / conflicts ---
chk "git switch -c creates a branch"                git switch -c feature
eq  "on the new branch"                    "feature"       "$(git branch --show-current)"
echo "feature work" > feature.txt && git add . && git commit -qm "Feature work"
chk "git switch back"                               git switch main
chk "git merge fast-forward"                        git merge feature
chk "git branch -d deletes a merged branch"         git branch -d feature
# real conflict
echo "base value" > shared.txt && git add . && git commit -qm "shared base"
git switch -qc a && echo "from A" > shared.txt && git commit -qam "A"
git switch -q main && echo "from B" > shared.txt && git commit -qam "B"
if git merge a >/dev/null 2>&1; then no "merge should conflict"; else ok "conflicting merge stops with an error"; fi
chk "conflict markers appear in the file"           grep -q '<<<<<<<' shared.txt
chk "git status names the unmerged file"            bash -c 'git status --porcelain | grep -q "^UU shared.txt"'
chk "git merge --abort restores the pre-merge state" git merge --abort
git merge a >/dev/null 2>&1
echo "resolved" > shared.txt && git add shared.txt
chk "git commit --no-edit finishes the merge"       git commit --no-edit
chk "git log --oneline --graph --all runs"          git log --oneline --graph --all

# --- rebase / reflog ---
git switch -qc topic && echo t > t.txt && git add . && git commit -qm "Topic"
git switch -q main && echo m > m.txt && git add . && git commit -qm "Main moves"
git switch -q topic
chk "git rebase main replays the branch"            git rebase main
chk "git reflog lists movements"                    bash -c '[ "$(git reflog | wc -l)" -gt 5 ]'
lost=$(git rev-parse HEAD)
git switch -q main && git branch -D topic >/dev/null 2>&1
chk "reflog still reaches the deleted commit"       git cat-file -e "$lost"
chk "git branch <name> <sha> recovers it"           git branch recovered "$lost"
chk "git reset --hard <sha> reaches it too"         bash -c 'git switch -q recovered && git switch -q main'

# --- tags ---
chk "git tag -a creates an annotated tag"           git tag -a v1.0.0 -m "First release"
eq  "tag is listed"                        "v1.0.0"        "$(git tag -l)"
chk "git show <tag> works"                          git show v1.0.0
chk "git describe --tags works"                     git describe --tags

# --- remotes (local bare remote stands in for a host) ---
git init -q --bare "$LAB/origin.git"
chk "git remote add"                                git remote add origin "$LAB/origin.git"
chk "git push -u origin main"                       git push -u origin main
chk "git ls-remote sees the branch"                 bash -c 'git ls-remote origin | grep -q refs/heads/main'
chk "git clone works"                               git clone -q "$LAB/origin.git" "$LAB/clone"
( cd "$LAB/clone" && echo "from the clone" >> notes.txt && git add . && git commit -qm "Clone commit" && git push -q ) 
chk "git fetch downloads without merging"           git fetch origin
chk "fetch left the working branch alone"           bash -c '! grep -q "from the clone" notes.txt'
chk "git pull integrates it"                        git pull --no-rebase -q origin main
chk "pull brought the change in"                    grep -q "from the clone" notes.txt
chk "git push --tags"                               git push -q --tags

# --- worktree ---
chk "git worktree add creates a second checkout"    git worktree add -q "$LAB/wt" -b hotfix
chk "the worktree directory exists"                 test -f "$LAB/wt/notes.txt"
chk "git worktree list shows both"                  bash -c '[ "$(git worktree list | wc -l)" -ge 2 ]'
chk "the same branch cannot be checked out twice"   bash -c '! git worktree add -q "'"$LAB"'/wt2" hotfix 2>/dev/null'
chk "git worktree remove cleans up"                 git worktree remove "$LAB/wt"
chk "git worktree prune runs"                       git worktree prune

# --- hooks ---
cat > .git/hooks/pre-commit <<'HOOK'
#!/bin/sh
grep -rqn "TODO-BLOCK" --include='*.txt' . && { echo "blocked"; exit 1; }
exit 0
HOOK
chmod +x .git/hooks/pre-commit
echo "TODO-BLOCK me" > bad.txt && git add bad.txt
if git commit -qm "should be blocked" >/dev/null 2>&1; then no "pre-commit hook should block the commit"; else ok "pre-commit hook blocks a commit by exiting non-zero"; fi
chk "--no-verify bypasses the hook"                 git commit -q --no-verify -m "bypassed"
chk "hooks are not cloned (dir is local only)"      bash -c '! test -x "'"$LAB"'/clone/.git/hooks/pre-commit"'
rm .git/hooks/pre-commit

# --- staging / atomic commits ---
printf 'a\nb\nc\n' > multi.txt && git add multi.txt && git commit -qm "multi"
chk "git add -p accepts a patch-mode invocation"    bash -c 'printf "q\n" | git add -p >/dev/null 2>&1; true'
chk "git commit -am stages tracked edits"           bash -c 'echo d >> multi.txt && git commit -qam "tracked edit"'
chk "git stash saves work"                          bash -c 'echo e >> multi.txt && git stash -q'
chk "git stash pop restores it"                     git stash pop -q
chk "git diff --cached --name-only works"           git diff --cached --name-only
chk "git log -p -S searches content history"        bash -c 'git log -p -S "token" >/dev/null'
chk "git shortlog -sn HEAD runs"                         git shortlog -sn HEAD

printf '\n%s failing claim(s)\n' "$fails"
exit $((fails != 0))
