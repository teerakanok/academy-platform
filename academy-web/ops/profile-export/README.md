# Academy profile source context

This source-only candidate does not enable export or establish a Core connection.
The source policy and QA census must be reviewed before any later activation.

For a new production attempt, the owner-approved policy treats an active,
entitled account as a learner when it has no active Academy staff role and is not
on the test-account list. The policy must be enabled and the QA census marked
complete. A test account and an active staff account do not produce learner
evidence. Missing policy, inactive access, unavailable role checks, and lock
contention leave the context unknown without blocking grading.

This is an operating assumption, not a way to detect intent. A QA account absent
from the census can be counted as a learner. The census owner must maintain test
accounts and prohibit QA from using ordinary learner accounts. Academy staff who
take a course as genuine learners are excluded under this policy. Academy has no
course-specific TA role in this path. Crux owns its own cohort roles and evidence.

The database stamps context when it inserts an attempt. Existing attempts and
reused attempts keep their original context. An unclassified old attempt is not
promoted later. Policy and classification revisions are checked again before
export. A test classification queues withdrawal for results already marked for
export or delivered. Disabling the source policy blocks later admission but does
not itself withdraw results previously marked or delivered.
Changing either policy or account-classification revision also excludes earlier
undelivered results, including legitimate ones, from later admission.

Server assessment integrity does not prove that a learner worked without help.
The existing integrity guard must be enabled for an assessment to be eligible;
the event nevertheless sends `assistance: "unknown"`. Core's current interpretation
caps guided or unknown-assistance claims at level 2, and a mapping is still needed
before a skill can be awarded. A runtime able to change attempt outcomes remains
inside the grading trust boundary; this candidate does not prove otherwise.
