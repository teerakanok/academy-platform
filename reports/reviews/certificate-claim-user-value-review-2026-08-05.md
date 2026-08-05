# Certificate claim user-value review

Date: 2026-08-05
Scope: canonical claim for the future Academy certificate and public verification page

## Options reviewed

- **A — assessed course completion:** Certificate of Course Completion; the learner
  completed all course requirements and passed every required assessed checkpoint;
  explicitly not a professional certification.
- **B — skills/mastery:** claim that the learner mastered or is certified in named skills.
- **C — completion only:** claim only that the learner completed the course.

## Independent persona verdicts

| Persona | Would use | Value | Verdict |
|---|---:|---:|---|
| Time-poor learner/job seeker | Yes after W4 | A 4/5 | A is shareable without creating an awkward overclaim; B is risky and C looks like attendance |
| Skeptical hiring manager | Yes, secondary signal | A 4/5 | A survives a 90-second screen if criteria, version, date, and verification are visible |
| Enterprise learning buyer | Yes for internal development reporting | A 4/5 | A preserves the assessed differentiator without pretending to prove occupational competence |
| Digital-credential program lead | Yes after W4 | A 5/5 | A is a defined achievement; B would require a competency framework and assessment-validity evidence |

All four ranked **A first**, C second, and B last. Consolidated desirability verdict:
**SHIP A after W4 evidence snapshot and public verification exist.** The highest-leverage
change is to make the exact achievement claim, criteria summary, and non-certification
qualifier identical on the issued artifact and verification page.

## Evidence boundary observed

- `CourseOverview` already separates lessons finished from required assessed checkpoints
  and truthfully says issuance/verification are not available yet.
- `courseRecordSummary` currently uses durable progress status and explicitly does not yet
  validate/snapshot the underlying simulation evidence. W4 must close this before issuance.
- Attempt and progress records preserve passing attempt, challenge version, checkpoint
  results, and simulation evidence for a future immutable issuance snapshot.
- Current simulation evidence proves that the learner submitted the required final state
  for a randomized attempt. It does not prove observed hands-on execution in a real lab.

## External grounding

- 1EdTech Open Badges 3.0 distinguishes a defined achievement claim from a skill claim and
  supports criteria, results, and evidence. A fits the former; Academy does not yet have the
  evidence needed for the latter:
  https://www.1edtech.org/standards/open-badges
- Credential Engine defines a Certificate of Completion as acknowledging completion of an
  assignment, training, or activity and distinguishes it from broader skill/certification
  claims:
  https://guidance.credentialengine.org/credential-data-types/

Academy must not call the artifact an Open Badge unless it later produces a conformant,
signed OpenBadgeCredential. A public verification page alone does not establish that claim.

## Recommended canonical wording

**Certificate of Course Completion: [Course]**

> Completed all course requirements and passed every required assessed checkpoint.
> This is not a professional certification.

The verification page should also show the issuer, issue date, credential status, course
and evidence version, `X/X` required checkpoints, and a privacy-safe evidence summary.
