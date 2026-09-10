# Content Verification Report — 2026-09-11

## Summary

- Courses audited: 11
- Lessons reviewed: 211 (207 public + 4 internal `content-formats-demo`)
- Checkpoint questions reviewed: 961 (958 multiple-choice + 3 interactive simulations)
- Issues found:
  - Critical (wrong answer key / factual error): **0**
  - High (technically wrong statement in body): **0**
  - Medium: **0**
  - Low (clarity / editorial quality): **9**

No wrong answer keys and no factual errors were found that I am confident are
wrong. Every marked `correct` answer checked out against OS, networking, C,
assembly, architecture, git, and security fundamentals; certification-course
exam facts were verified against the current vendor pages (see Sources). The
findings below are editorial-quality defects only: duplicated sentences left in
checkpoint explanations after an edit, and duplicate assessment items asking
the same question twice inside one lesson.

### Method

- Every `locales/en/lessons/*.json` checkpoint (prompt, all choices, marked
  answer, explanation) was read for all 11 courses — 961 items total.
- Lesson bodies were read in full for `basic-os-linux` and `git-essentials`;
  for the remaining courses the bodies were reviewed via targeted scans of
  numeric/protocol claims (sizes, latencies, signal numbers, ABI details,
  subnet arithmetic, exam-format facts) plus full reading of anything the
  checkpoints depended on.
- Numeric claims were recomputed where possible (subnetting, TLB coverage,
  recursion depth, pipeline speedup, DDR CAS latency, byte-order examples,
  exit-status truncation, nice-value weight ratios, multicast MAC derivation,
  Ethernet frame padding).
- Certification exam facts (Security+ SY0-701 format and domain weights; ISC2
  CC CAT format, languages, and 2026 outline domain weights) were verified
  against vendor sources (see Sources).
- Structural validation was scripted across all lessons: `correct` keys exist
  and reference real choices, every checkpoint has an explanation, every
  course DAG is acyclic with no orphan lesson files or unreachable nodes.
- Thai locale validation was scripted: file presence, `nodeId`/`locale`
  fields, checkpoint count and per-question id alignment, answer-key parity
  with English, choice-key parity, and a Thai-script check on translated text.

## Findings

### basic-os-linux — LOW: duplicated sentence in checkpoint explanation

- Lesson: `first-shell-script`
- Question: cp-2
- Issue: The explanation ends with the same sentence twice: "A file named
  holiday photos.txt becomes two arguments, and the command does something you
  did not intend." appears verbatim back-to-back.
- Source truth: The sentence is correct; only the duplication is wrong.
- Recommendation: Delete one copy.

### basic-os-linux — LOW: duplicated sentence in checkpoint explanation

- Lesson: `scheduling-with-cron`
- Question: cp-2
- Issue: "cron gives a minimal PATH, no shell profile, and a different working
  directory." appears verbatim twice in the explanation.
- Source truth: The sentence is correct; only the duplication is wrong.
- Recommendation: Delete one copy.

### basic-os-linux — LOW: redundant restated sentence in checkpoint explanation

- Lesson: `get-a-linux`
- Question: cp-2
- Issue: The final sentence ("Some commands differ too — it carries you
  through the early lessons, then diverges where the course gets specific.")
  restates the first sentence ("It will carry you through the early navigation
  lessons, then diverge exactly where the course gets specific — package
  management and some permission details."). Looks like an edit that left the
  old sentence behind.
- Source truth: Content is correct; the sentence is redundant.
- Recommendation: Remove the trailing restatement.

### basic-os-linux — LOW: redundant restated sentence in checkpoint explanation

- Lesson: `processes-and-packages`
- Question: cp-1
- Issue: The explanation ends with "What a process may do is determined by who
  it runs as — an unexpected root process is the thing to explain.", which
  restates the opening sentence of the same explanation.
- Source truth: Content is correct; the sentence is redundant.
- Recommendation: Remove the trailing restatement.

### basic-os-linux — LOW: redundant restated sentence in checkpoint explanation

- Lesson: `scheduling-with-cron`
- Question: cp-3
- Issue: The closing sentence "So a failure leaves a readable trace instead of
  vanishing." restates the explanation's opening sentence "A failure leaves a
  readable trace."
- Source truth: Content is correct; the sentence is redundant.
- Recommendation: Remove the trailing restatement.

### c-low-level — LOW: duplicate assessment item within one checkpoint

- Lesson: `arrays-and-strings`
- Question: cp-1 and cp-5
- Issue: cp-1 ("Why must a C function that receives an array also receive its
  length?") and cp-5 ("Why must a function receive an array length?") are the
  same question with the same correct answer ("the parameter is a pointer and
  carries no array length"). A learner who reads cp-1 gets cp-5 for free.
- Source truth: Both answer keys are correct; the item is redundant.
- Recommendation: Replace one with a different question on the same lesson
  material (e.g. `sizeof` inside the callee returning the pointer size).

### c-low-level — LOW: duplicate assessment item within one checkpoint

- Lesson: `reading-real-c`
- Question: cp-1 and cp-5
- Issue: cp-1 ("What is the first thing to do with an unfamiliar C project?")
  and cp-5 ("What should you do first with an unfamiliar C project?") both
  have "Build it" as the correct answer — the same item asked twice. (cp-3
  "grep for memcpy" and cp-8 "What does grep for memcpy provide?" similarly
  overlap, though cp-8 is phrased at a different angle.)
- Source truth: Both answer keys are correct; the items are redundant.
- Recommendation: Replace cp-5 (and consider refreshing cp-8) with a question
  covering an untested part of the lesson (e.g. reading git history for
  unusual code, or debugger backtraces).

### git-essentials — LOW: near-duplicate scenario asked twice in one checkpoint

- Lesson: `github-actions-ci`
- Question: cp-2 and cp-11
- Issue: cp-2 ("A test passes locally but fails in CI. What is the most likely
  cause?") and cp-11 ("A local test passes but CI fails. What should you
  compare first?") present the identical scenario; the correct answers point
  at the same diagnosis. Borderline flag: the second asks for the action
  rather than the cause, so it is not a verbatim duplicate.
- Source truth: Both answer keys are correct.
- Recommendation: Optional — vary the scenario in one of the two (e.g. a
  missing lockfile entry vs. a global dependency).

### content-formats-demo — INFO: no Thai locale (by design)

- Lesson: course-level
- Question: n/a
- Issue: `content-formats-demo` has 4 English lessons and no
  `locales/th/lessons/`. This matches its `course.json`
  (`availableLocales: ["en"]`, `publicAvailability: "internal"`), so it is not
  a defect — recorded so the Thai-locale coverage statement below is exact.
- Source truth: n/a
- Recommendation: None.

## Verified Clean

Courses with zero issues found:

- assembly (14 lessons, 78 checkpoints)
- computer-architecture (22 lessons, 121 checkpoints)
- computer-networking (24 lessons, 129 checkpoints)
- comptia-security-plus (28 lessons, 46 checkpoints)
- isc2-cc (30 lessons, 66 checkpoints)
- operating-systems (22 lessons, 132 checkpoints)
- setup-and-environment (5 lessons, 31 checkpoints)

Courses with findings (all LOW, editorial only):

- basic-os-linux (5 explanation-duplication findings)
- c-low-level (2 duplicate-item findings)
- git-essentials (1 near-duplicate item, borderline)
- content-formats-demo (INFO note only)

### Spot-checks that passed (evidence of coverage)

- Checkpoint keys recomputed and correct: `/26` → 62 usable hosts;
  `172.16.5.0/20` → network `172.16.0.0`; `192.0.2.130` in `/26` blocks →
  `.128/26`; IPv6 shortening `2001:db8::ff00:42:8329`; 5-byte TCP payload →
  ~64-byte padded Ethernet frame; `_exit(300)` → `WEXITSTATUS` 44;
  `htons` byte-swap lands on port 36895; `2 MB / 4 KB = 512` huge-page fault
  ratio; nice 0 vs 19 ≈ 1024/15 ≈ 68:1; 10 MB × 250 ns ≈ 2.5 s syscall
  overhead; DDR5-6400 CL46 → 14.4 ns; multicast MACs `224.0.0.251 →
  01:00:5e:00:00:fb` and `239.255.255.250 → 01:00:5e:7f:ff:fa`;
  `x/10 → imul 1717986919, sar 34`; recursion depth 8176 KB / 32 B ≈ 261,632;
  pipeline speedups (4+10)/50 → 3.6x and 5000/1004 → 4.98x; 0.9 × 1.3 = 1.17;
  `141 = 128 + 13` (SIGPIPE); ALE = 500,000 × 0.20 × 0.1 = 10,000.
- Concept checkpoints verified correct including: System V AMD64 vs Windows
  x64 register roles and the hidden struct-return pointer; red zone;
  RISC-V `funct7` distinction, 12-bit I-type immediates, B-type dropping bit 0;
  `int (*f)(int)` vs `int *f(int)`; `snprintf` vs `strncpy` termination;
  `-INT_MIN` undefined; unsigned wrap defined; `x & (x-1)` power-of-two test;
  CMV condition-correctness; AT&T ↔ Intel operand translation; `git bisect`
  binary search; reflog 90/30-day expiry; `--force-with-lease` semantics;
  futex fast path with zero syscalls uncontended; COW semantics; CLOSE_WAIT vs
  TIME_WAIT meaning; Linux listen backlog = accept queue; SIGKILL/SIGSTOP
  uncatchable; setuid-on-scripts ignored on Linux; `system()` shell dropping
  setuid euid; RAID/differential-incremental restore arithmetic; order of
  volatility; kill-chain C2 vs ATT&CK tactic/technique distinction; ISC2
  ethics canon precedence; NIST CSF 2.0 Govern function; shared-responsibility
  split across IaaS/PaaS/SaaS.
- Cross-course consistency: no contradictions found between courses. The
  architecture course's RISC-V (encoding/datapath) and AArch64 (calling
  convention) lessons are each self-labelled, and the assembly course
  explicitly explains the x86-64 vs RISC-V course split.
- Structural validation: all 961 checkpoint items have non-empty `correct`
  keys referencing existing choices and non-empty explanations; all 11 course
  DAGs are acyclic, with no orphan lesson files, no nodes lacking lesson
  files, and no unreachable nodes.
- Thai locale: all 207 lessons of the 10 courses declaring `th` have Thai
  files; `nodeId`, checkpoint count, per-question ids, answer keys, and choice
  keys match the English source exactly; Thai text is genuine Thai (not copied
  English); spot-checked translation quality is faithful, including
  technical-term transliteration.

## Sources

Exam-format facts were verified against:

- ISC2 CC exam outline — https://www.isc2.org/certifications/cc/cc-certification-exam-outline
  (2 hours, 100–125 items, CAT, 700/1000; weights D1 24%, D2 17.3% match the
  course's capstone table)
- ISC2 CAT format updates — https://www.isc2.org/Insights/2025/05/computerized-adaptive-testing-examination-format-updates
- CompTIA Security+ — https://www.comptia.org/en-us/certifications/security/
  (SY0-701: max 90 questions, 90 minutes, 750 on 100–900; domain weights
  12/22/18/28/20 match the course's capstone table)
