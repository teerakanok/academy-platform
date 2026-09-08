# Authenticated learning mutation quotas

Source acceptance only; production remains open. Server-authenticated accounts
use durable account and course quotas before protected mutations. Progress budgets
are 120/60 per minute; grading 60/30 per minute; reset 6/3 per hour.

Root observed causal route failures before correction (tool session55326 exit1):
grading returned200 instead of429; skewed windows returned30 seconds instead of60.
Corrected route suite8/8 and full unit2474 passed/2 skipped (latest1824 exit0).
The latest test separates course31 denial and account61 denial with different users.

Root observed npm run build:cf exit0 (session6494):14workerd checks,65Next pages,
OpenNext bundle, asset guard and final real-workerd raw-host gate404 all passed.
No raw final-build log was retained; this is directly observed tool evidence.
Lint exit1 is the accepted existing3errors/17warnings; app/worker/ops typechecks0.
Production authenticated quota and learner journeys require post-deploy evidence.
