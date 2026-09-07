# Production deployment — session-bound media grants

Application source 90866d8990ac8707206db7938b0c53e5df44b2a4 was uploaded with the existing version-upload method, deployed beside predecessor 1af77a26-bba2-4300-9a71-0bc0262ca06d at 0%, smoke checked with the documented version override, and then activated at 100%. All three CLI mutations exited 0; no migration or secret mutation occurred.

Independent post-activation deployments list proves deployment c1f0f8ae-fa8b-43d4-bf76-f18b5e336f5c serves version 56c2e7bd-26be-4d68-bda1-70df901e6187 at 100%. GET / and /sign-in returned genuine app HTML200, /robots.txt text/plain200 with directives, raw workers.dev root404. Candidate static CSS was200. A fresh isolated real Chrome context displayed Academy sign-in200 at the canonical origin; root viewed its1440x900 capture. Access token stayed in process memory and was not recorded.

This proves deployment and public application/host behavior. Authenticated media playback, fresh owner OTP callback, entitlement, session persistence and global logout remain pending; this receipt does not claim those journeys or immediate media revocation. The signed grant TTL remains five minutes.
