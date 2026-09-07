# Public course routes — production verification

App source:5572e8318b67ebf7858c4c1fccf1831ae01d335f. Worker version:0eed364a-1714-4e03-bf62-0af2230cfb55. Root inspected both final real Chrome1440x900/390x844 screenshots, showing genuine Assembly syllabus and no horizontal overflow.

Existing release flow, each command exit0 from academy-web:
1. node node_modules/wrangler/bin/wrangler.js versions upload --name cyberskills-academy --keep-vars --tag release-5572e8318b67 --message s=5572e8318b67ebf7858c4c1fccf1831ae01d335f;public-course-cache (message passed as one argument).
2. versions deploy56c2e7bd-26be-4d68-bda1-70df901e6187@100 +0eed364a-1714-4e03-bf62-0af2230cfb55@0 --name cyberskills-academy --yes; candidate override GET and realChrome pass.
3. versions deploy0eed364a-1714-4e03-bf62-0af2230cfb55@100 --name cyberskills-academy --yes; exact deployment message release;s=5572e8318b67ebf7858c4c1fccf1831ae01d335f;public-course-cache-verified.

Postactivation GET used only in-memory Cloudflare Access cookie, no Workers version override. Actual /,/sign-in,/robots.txt and all16 declared public localized course pages200; /courses/assembly/learn307 tosign-in; internalCompTIAcourse404. curl -sS -o /dev/null -w HTTP_code https://cyberskills-academy.songpon-te.workers.dev/ returned404. ProductionJSON timestamp08:50:30UTC. No OTP sent and no authenticated learner completion claimed. Course visibility remains syllabus-preview; Assembly content2banks is present in source/bundle but not public questions. Linux3bankbatch not included yet. No DB/secret mutation.

Rollback predecessor remains56c2e7bd at source90866d8990ac, using same reviewed versions deploy flow if required. This proof closes public-course404 only; operatorSEC019 installation, learner sessions/media/entitlement and complete release scope remain open.
