# Academy — production state 2026-09-17

- Worker `cyberskills-academy` version `3ae76859-3056-405e-bbb9-b4d5b16709ee` from main (`68083b8` tree): brand accent `#38BDF8`, favicon (white tile, blue mark), `INTERNAL_SURFACES=on` (`/admin/courses` behind sign-in; founder account holds staff role `owner`).
- Database (shared Supabase `supabase-db`, schema `academy`): migration `0040_free_course_self_enrolment.sql` applied 2026-09-17 (backup `/var/backups/academy/pre-0040-20260917.dump` on ssh-db). `academy.course_offer` seeds 8 free courses (assembly, basic-os-linux, c-low-level, computer-architecture, computer-networking, git-essentials, operating-systems, setup-and-environment); `academy.enrol_free_course` executable only by `academy_runtime`.
- Enrolment: free courses self-enrol via `/courses/<slug>/start` → `POST /api/courses/<slug>/enrol`; non-free courses only via the owner-audited operator path. Payment gateway deferred by founder.
- Founder `songpon@cyberskills.co.th` holds `grant` entitlements for all 8 published courses (reference `founder-grant-20260917 published catalog`).
- Identity: consumes v1 receipts (no auth_time freshness); session TTL 24h in `academy.identity_session`.
