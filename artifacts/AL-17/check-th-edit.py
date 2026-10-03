#!/usr/bin/env python3
"""AL-17 guard: compare edited TH content JSON with the base commit.

Hard failures (exit 1): any change outside the editable prose fields, any change in
JSON shape, or a changed checkpoint / video cue question / code line / try step.
Warnings: ASCII tokens (commands, flags, paths, terms) present in the old string but
missing from the new one — review each by hand.

usage: check-th-edit.py BASE_REF FILE...
"""
import json, re, subprocess, sys

FROZEN_TOP = {"nodeId", "locale", "checkpoint", "videoCueQuestions"}
FROZEN_BLOCK = {"kind", "tone", "ordered", "src", "lines", "steps"}
TOKEN = re.compile(r"[A-Za-z0-9_./~$*|<>=:@#%+\-\[\]{}'\"`\\]+")

def tokens(s):
    return [t for t in TOKEN.findall(s) if re.search(r"[A-Za-z0-9]", t)]

def walk(old, new, path, fails, warns, frozen):
    if type(old) is not type(new):
        fails.append(f"{path}: type changed"); return
    if isinstance(old, dict):
        if set(old) != set(new):
            fails.append(f"{path}: keys changed {sorted(set(old) ^ set(new))}"); return
        for k in old:
            fz = frozen or (path == "" and k in FROZEN_TOP) or (".blocks[" in path and path.endswith("]") and k in FROZEN_BLOCK)
            walk(old[k], new[k], f"{path}.{k}", fails, warns, fz)
    elif isinstance(old, list):
        if len(old) != len(new):
            fails.append(f"{path}: length {len(old)} -> {len(new)}"); return
        for i, (a, b) in enumerate(zip(old, new)):
            walk(a, b, f"{path}[{i}]", fails, warns, frozen)
    elif old != new:
        if frozen:
            fails.append(f"{path}: frozen value changed")
        elif isinstance(old, str):
            nt = tokens(new)
            missing = [t for t in tokens(old) if t not in nt]
            if missing:
                warns.append(f"{path}: ASCII tokens dropped {missing}")
        else:
            fails.append(f"{path}: non-string value changed")

def main():
    base, files = sys.argv[1], sys.argv[2:]
    bad = 0
    for f in files:
        rel = subprocess.run(["git", "ls-files", "--full-name", f], capture_output=True, text=True).stdout.strip()
        old = json.loads(subprocess.run(["git", "show", f"{base}:{rel}"], capture_output=True, text=True, check=True).stdout)
        new = json.load(open(f, encoding="utf-8"))
        fails, warns = [], []
        walk(old, new, "", fails, warns, False)
        for m in fails: print(f"FAIL {f} {m}")
        for m in warns: print(f"WARN {f} {m}")
        bad += bool(fails)
    print(f"checked {len(files)} files, {bad} with failures")
    sys.exit(1 if bad else 0)

main()
