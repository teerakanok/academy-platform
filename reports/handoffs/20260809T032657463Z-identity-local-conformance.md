# Session Handoff: academy-platform

<!-- session-handoff/v1
{
  "schema": "session-handoff/v1",
  "id": "20260809T032657463Z-identity-local-conformance",
  "created_at": "2026-08-09T03:26:57.463Z",
  "project": "academy-platform",
  "objective": "Complete Academy local-only cryptographic lifecycle-envelope conformance against the frozen Identity Control producer vector while preserving all existing Academy work and keeping runtime release blocked.",
  "state": "ready",
  "repo": {
    "remote": "github.com/teerakanok/academy-platform",
    "branch": "main",
    "base_head": "514ed4d3c2b9279ab5d3d8dd936dd0e2abc61bdb"
  },
  "delivery": "local",
  "worktree": {
    "mode": "allowlisted",
    "entries": [
      {
        "status": " M",
        "path": "academy-web/content/courses/basic-os-linux/course.json",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " M",
        "path": "academy-web/content/courses/content-formats-demo/course.json",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " M",
        "path": "academy-web/package.json",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " D",
        "path": "academy-web/src/app/access-required/page.tsx",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " D",
        "path": "academy-web/src/app/api/attempts/route.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " D",
        "path": "academy-web/src/app/api/auth/me/route.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " D",
        "path": "academy-web/src/app/api/auth/otp/route.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " D",
        "path": "academy-web/src/app/api/auth/sign-out/route.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " D",
        "path": "academy-web/src/app/api/auth/verify/route.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " D",
        "path": "academy-web/src/app/api/explanations/route.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " D",
        "path": "academy-web/src/app/api/leads/route.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " D",
        "path": "academy-web/src/app/api/leads/unsubscribe/route.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " D",
        "path": "academy-web/src/app/api/practice/simulation/route.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " D",
        "path": "academy-web/src/app/api/progress/reset/route.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " D",
        "path": "academy-web/src/app/api/progress/route.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " D",
        "path": "academy-web/src/app/auth/callback/route.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " D",
        "path": "academy-web/src/app/course-media/[assetId]/route.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " D",
        "path": "academy-web/src/app/courses/[slug]/lessons/[nodeId]/page.tsx",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " M",
        "path": "academy-web/src/app/courses/[slug]/opengraph-image.tsx",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " D",
        "path": "academy-web/src/app/courses/[slug]/page.tsx",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " D",
        "path": "academy-web/src/app/courses/page.tsx",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " D",
        "path": "academy-web/src/app/dashboard/page.tsx",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " D",
        "path": "academy-web/src/app/error.tsx",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " D",
        "path": "academy-web/src/app/layout.tsx",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " D",
        "path": "academy-web/src/app/page.tsx",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " D",
        "path": "academy-web/src/app/player/exam/[id]/page.tsx",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " D",
        "path": "academy-web/src/app/player/module/[slug]/page.tsx",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " D",
        "path": "academy-web/src/app/player/page.tsx",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " D",
        "path": "academy-web/src/app/privacy/PrivacyContent.tsx",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " D",
        "path": "academy-web/src/app/privacy/page.tsx",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " D",
        "path": "academy-web/src/app/sign-in/page.tsx",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " M",
        "path": "academy-web/src/app/sitemap.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " D",
        "path": "academy-web/src/app/unsubscribe/UnsubscribeForm.tsx",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " D",
        "path": "academy-web/src/app/unsubscribe/page.tsx",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " M",
        "path": "academy-web/src/components/ThemeToggle.tsx",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " M",
        "path": "academy-web/src/components/auth/AccountMenu.tsx",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " M",
        "path": "academy-web/src/components/course/CourseCover.tsx",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " M",
        "path": "academy-web/src/components/course/CourseDashboard.tsx",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " M",
        "path": "academy-web/src/components/course/CourseOverview.tsx",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " M",
        "path": "academy-web/src/components/course/CoverMotif.tsx",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " M",
        "path": "academy-web/src/components/course/LessonView.tsx",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " M",
        "path": "academy-web/src/components/course/RadarChart.tsx",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " M",
        "path": "academy-web/src/components/course/RoadmapGraph.tsx",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " M",
        "path": "academy-web/src/components/i18n/LanguageToggle.tsx",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " M",
        "path": "academy-web/src/components/i18n/LocaleProvider.tsx",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " M",
        "path": "academy-web/src/components/i18n/SiteChrome.tsx",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " M",
        "path": "academy-web/src/lib/content/course-loader.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " M",
        "path": "academy-web/src/lib/content/course-source.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " M",
        "path": "academy-web/src/lib/content/course-types.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " M",
        "path": "academy-web/src/lib/course/assessment-policy.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " M",
        "path": "academy-web/src/lib/course/progress-db.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " M",
        "path": "academy-web/src/lib/course/progress.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " M",
        "path": "academy-web/src/lib/course/roadmap.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " M",
        "path": "academy-web/src/lib/course/skills.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " M",
        "path": "academy-web/src/lib/i18n/ui.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " M",
        "path": "academy-web/src/lib/identity/consumer-policy.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " M",
        "path": "academy-web/src/lib/identity/registry.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " M",
        "path": "academy-web/src/lib/seo.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " M",
        "path": "academy-web/src/middleware.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " M",
        "path": "academy-web/tests/integration/leads-db-fail.test.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " M",
        "path": "academy-web/tests/unit/auth-callback-route.test.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " M",
        "path": "academy-web/tests/unit/auth-me-route.test.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " M",
        "path": "academy-web/tests/unit/content-registry.test.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " M",
        "path": "academy-web/tests/unit/course-roadmap.test.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " M",
        "path": "academy-web/tests/unit/explanations-route.test.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " M",
        "path": "academy-web/tests/unit/identity-consumer-policy.test.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " M",
        "path": "academy-web/tests/unit/identity-registry.test.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " M",
        "path": "academy-web/tests/unit/internal-surface.test.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " M",
        "path": "academy-web/tests/unit/legacy-direct-otp.test.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " M",
        "path": "academy-web/tests/unit/media-route.test.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " M",
        "path": "academy-web/tests/unit/security-wiring.test.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " M",
        "path": "academy-web/tests/unit/sign-in-page.test.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " M",
        "path": "academy-web/tests/unit/sign-out-route.test.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " M",
        "path": "plans/active_plan.md",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": " M",
        "path": "plans/completed_log.md",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/assets/fonts/noto-sans-thai/LICENSE",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/assets/fonts/noto-sans-thai/NotoSansThai-Bold.ttf",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/assets/fonts/noto-sans-thai/NotoSansThai-Regular.ttf",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/assets/fonts/noto-sans-thai/README.md",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/e2e/course-experience.spec.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/playwright.public.config.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/scripts/public-course-page-paths.mjs",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/scripts/public-share-image-paths.mjs",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/scripts/verify-cf-public-course-pages.mjs",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/scripts/verify-cf-public-share-images.mjs",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/scripts/verify-public-course-pages.mjs",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/scripts/verify-public-share-image-composition.mjs",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/scripts/verify-public-share-images.mjs",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/src/app/(localized)/courses/[slug]/[locale]/layout.tsx",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/src/app/(localized)/courses/[slug]/[locale]/page.tsx",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/src/app/(site)/access-required/page.tsx",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/src/app/(site)/api/attempts/route.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/src/app/(site)/api/auth/me/route.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/src/app/(site)/api/auth/otp/route.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/src/app/(site)/api/auth/sign-out/route.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/src/app/(site)/api/auth/verify/route.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/src/app/(site)/api/courses/[slug]/skill-map/route.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/src/app/(site)/api/explanations/route.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/src/app/(site)/api/leads/route.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/src/app/(site)/api/leads/unsubscribe/route.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/src/app/(site)/api/practice/simulation/route.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/src/app/(site)/api/progress/reset/route.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/src/app/(site)/api/progress/route.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/src/app/(site)/auth/callback/route.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/src/app/(site)/course-media/[assetId]/route.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/src/app/(site)/courses/[slug]/learn/page.tsx",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/src/app/(site)/courses/[slug]/lessons/[nodeId]/page.tsx",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/src/app/(site)/courses/[slug]/page.tsx",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/src/app/(site)/courses/[slug]/share/[locale]/route.tsx",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/src/app/(site)/courses/page.tsx",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/src/app/(site)/dashboard/page.tsx",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/src/app/(site)/error.tsx",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/src/app/(site)/layout.tsx",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/src/app/(site)/page.tsx",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/src/app/(site)/player/exam/[id]/page.tsx",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/src/app/(site)/player/module/[slug]/page.tsx",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/src/app/(site)/player/page.tsx",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/src/app/(site)/privacy/PrivacyContent.tsx",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/src/app/(site)/privacy/page.tsx",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/src/app/(site)/sign-in/page.tsx",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/src/app/(site)/unsubscribe/UnsubscribeForm.tsx",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/src/app/(site)/unsubscribe/page.tsx",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/src/components/AppShell.tsx",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/src/components/course/CourseExperience.tsx",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/src/components/course/CourseLocaleChromeSync.tsx",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/src/components/course/CourseSkillMap.tsx",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/src/components/course/PublicCourseCatalog.tsx",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/src/components/course/PublicCourseLocaleLink.tsx",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/src/components/course/PublicCourseSyllabus.tsx",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/src/lib/content/course-step-summary.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/src/lib/content/legacy-public-course-route.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/src/lib/content/public-course.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/src/lib/course-share-image.tsx",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/src/lib/course/skill-map-client.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/src/lib/course/skill-map-state.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/tests/unit/course-experience.test.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/tests/unit/course-locale-chrome-sync.test.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/tests/unit/course-skill-map-client.test.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/tests/unit/course-skill-map-route.test.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/tests/unit/course-skill-map.test.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/tests/unit/course-step-summary.test.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/tests/unit/dashboard-page.test.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/tests/unit/dashboard-response.test.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/tests/unit/learner-course-page.test.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/tests/unit/learner-dashboard-course.test.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/tests/unit/progress-dashboard-route.test.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/tests/unit/progress-db-allowlist.test.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/tests/unit/public-course-catalog.test.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/tests/unit/public-course-projection.test.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/tests/unit/public-course-route.test.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/tests/unit/public-course-share-route.test.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/tests/unit/public-course-syllabus.test.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "academy-web/tests/unit/skill-map-state.test.ts",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "artifacts/public-course-syllabus-flight-boundary-2026-08-09.md",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "memory/feedback_static_evidence_and_generated_manifest_hygiene.md",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "reports/conformance/identity-control/academy-identity-control-conformance.json",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "reports/conformance/identity-control/academy-identity-integration-conformance.txt",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "reports/conformance/identity-control/academy-identity-unit-conformance.txt",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "reports/conformance/identity-control/academy-identity-unproven-scenarios.json",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "reports/conformance/identity-control/academy-lint-typecheck.txt",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "reports/conformance/identity-control/academy-unit-regression.txt",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "reports/reviews/identity-control-conformance-ril-2026-08-08.md",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "reports/reviews/learner-course-skill-map-checkpoint-2026-08-09.md",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "reports/reviews/learner-dashboard-data-boundary-checkpoint-2026-08-09.md",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "reports/reviews/public-course-canonical-locale-checkpoint-2026-08-09.md",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "reports/reviews/public-course-catalog-locale-checkpoint-2026-08-09.md",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "reports/reviews/public-course-locale-continuity-checkpoint-2026-08-09.md",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "reports/reviews/public-course-share-image-checkpoint-2026-08-09.md",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      },
      {
        "status": "??",
        "path": "reports/reviews/public-course-syllabus-checkpoint-2026-08-09.md",
        "owner": "continuation",
        "reason": "Uncommitted Academy implementation, tests, evidence, or plan state; preserve for local continuation."
      }
    ]
  },
  "scope": {
    "allowed": [
      "Implement one bounded local cryptographic lifecycle-envelope consumer slice against the exact fixture bytes published by Identity Control revision b63a1fd5f2822cdcf4187df952a6f356d9bee324.",
      "Add or update only Academy identity consumer code, focused tests, product-local conformance receipts/review evidence, plans, and the closing handoff needed for this local slice.",
      "Preserve every pre-existing dirty continuation entry and keep Academy fail-closed."
    ],
    "forbidden": [
      "Do not edit Identity Control from this Academy handoff.",
      "No DB, credential, operational key, endpoint provisioning, DNS, Cloudflare, deployment, production sign-in, owner bootstrap, lifecycle traffic, or external mutation is authorized.",
      "Do not enable the Academy client, change Identity Control registry state, set releaseApproval=true, issue entitlement, or treat local conformance as release approval.",
      "Do not modify unrelated public-course, localization, dashboard, font, or media continuation work. Focused identity tests may import existing boundaries, but those imports do not authorize edits to the imported files."
    ]
  },
  "canonical_read_order": [
    "AGENTS.md",
    "plans/active_plan.md",
    "plans/completed_log.md",
    "reports/handoffs/20260809T013829227Z-academy-identity-runtime-blocked.md",
    "academy-web/src/lib/identity/consumer-policy.ts",
    "academy-web/src/lib/identity/registry.ts"
  ],
  "owner_decisions": [
    "The frozen producer vector authorizes local fixture-based conformance only; Academy runtime release remains blocked.",
    "Both registered consumers remain enabled=false and releaseApproval=false; local PASS evidence does not change that state.",
    "Academy remains fail-closed until separate Identity Control runtime inputs, release evidence, production authorization, and canonical owner bootstrap exist.",
    "No production, shared-infrastructure, credential, or external mutation is authorized by this handoff."
  ],
  "completed": [
    "Identity Control published a fixture-only ES256 lifecycle-envelope vector and production-verifier proof at revision b63a1fd5f2822cdcf4187df952a6f356d9bee324.",
    "Identity Control full verification passed and independent producer review closed at C0/H0/M0/L0.",
    "The six canonical producer artifacts were frozen with SHA-256 digests recorded below.",
    "Academy implementation state was not changed while this local continuation route was prepared."
  ],
  "changed_files": [
    {
      "path": "reports/handoffs/20260809T032657463Z-identity-local-conformance.md",
      "reason": "Ready route for the bounded local identity conformance slice."
    },
    {
      "path": "reports/handoffs/current.json",
      "reason": "Canonical pointer to this ready local continuation."
    }
  ],
  "remaining_work": [
    "Verify the exact producer positive vector through Academy consumer code and prove focused fail-closed negative cases.",
    "Record the producer revision and all six canonical artifact digests in Academy conformance evidence, then run an independent local checkpoint review.",
    "Keep the prior real-runtime blocker active: verification-key distribution, lifecycle endpoint/audiences, kill-switch operator, production authorization, and canonical owner bootstrap remain unavailable."
  ],
  "risks": [
    "Academy has a large pre-existing uncommitted continuation set; the local identity slice must not reset, stage, or claim unrelated paths.",
    "Using reconstructed or substitute fixture bytes would break source-bound provenance even if cryptographic tests passed.",
    "A local conformance PASS could be misread as release authorization unless enabled=false, releaseApproval=false, and the real-runtime blocker remain explicit."
  ],
  "next": {
    "cwd": "academy-web",
    "summary": "Implement one bounded local Academy consumer conformance slice against Identity Control revision b63a1fd5f2822cdcf4187df952a6f356d9bee324, prove positive and fail-closed cases, and update local evidence without enabling runtime integration.",
    "first_step": "Read the canonical context and prior blocked packet, verify the frozen Identity Control revision and six SHA-256 digests without editing that repository, then add the narrow failing Academy consumer test before implementation.",
    "commands": [
      "rtk git -C ../../identity-control rev-parse HEAD",
      "rtk shasum -a 256 ../../identity-control/config/consumer-registry-v1.approved.json ../../identity-control/docs/integration/consumer-registry-v1.md ../../identity-control/docs/integration/consumer-conformance-kit.md ../../identity-control/docs/integration/lifecycle-pull-consumer-contract.md ../../identity-control/packages/contracts/src/index.ts ../../identity-control/packages/testing/src/index.ts",
      "Run the focused Academy identity unit tests failing-first, implement the smallest local consumer boundary, then rerun the focused tests and the repository checks required by AGENTS.md.",
      "Update Academy conformance receipts, checkpoint review, plans, and closing handoff with observed commands and exact producer provenance."
    ],
    "acceptance": [
      "Academy verifies the exact producer-owned positive envelope at the supplied issuer, audience, kid, ES256 algorithm, verification time, clock skew, and lifetime policy.",
      "Focused tamper and policy-mismatch cases fail closed, with no invented operational key, endpoint, credential, or production payload.",
      "Academy evidence binds Identity Control revision b63a1fd5f2822cdcf4187df952a6f356d9bee324 and the six canonical SHA-256 digests recorded in this packet.",
      "Independent checkpoint review has no unresolved Critical, High, or Medium findings; all Low findings are fixed or explicitly routed.",
      "Identity Control still records enabled=false for both clients and releaseApproval=false; Academy real runtime, owner bootstrap, deployment, and traffic remain blocked."
    ],
    "execution_boundary": "local-reversible"
  },
  "blocker": null,
  "verification": [
    {
      "command": "Identity Control: rtk npm run verify",
      "result": "Passed after the producer-vector change: 348 tests passed and 58 skipped, PostgreSQL 15 and 16 matrices 64/64 each, Playwright 9/9, builds/typechecks/governance/boundaries/audits/SBOM/secret scans passed."
    },
    {
      "command": "Identity Control independent producer and reader-first closure reviews",
      "result": "PASS C0/H0/M0/L0; fixture-versus-production boundary, source binding, disabled clients, and releaseApproval=false confirmed."
    },
    {
      "command": "rtk git rev-parse HEAD",
      "result": "Academy baseline observed at 514ed4d3c2b9279ab5d3d8dd936dd0e2abc61bdb before the handoff-only commit."
    },
    {
      "command": "session-handoff resolve-project --project academy-platform --json",
      "result": "The prior real-runtime packet resolved blocked with the exact existing dirty allowlist; this new packet narrows only the local fixture-conformance continuation."
    }
  ],
  "cleanup": {
    "processes": "Pre-existing Next.js node process PID 59647 remains listening on TCP 3003; it predates this route and must not be treated as lane-owned.",
    "artifacts": "Only this handoff and its canonical pointer are generated for routing; every existing untracked Academy artifact remains continuation scope."
  }
}
-->

## Objective
Complete Academy local-only cryptographic lifecycle-envelope conformance against the frozen Identity Control producer vector while preserving all existing Academy work and keeping runtime release blocked.

## Owner Intent And Decisions
- The frozen producer vector authorizes local fixture-based conformance only; Academy runtime release remains blocked.
- Both registered consumers remain enabled=false and releaseApproval=false; local PASS evidence does not change that state.
- Academy remains fail-closed until separate Identity Control runtime inputs, release evidence, production authorization, and canonical owner bootstrap exist.
- No production, shared-infrastructure, credential, or external mutation is authorized by this handoff.
- Allowed scope: Implement one bounded local cryptographic lifecycle-envelope consumer slice against the exact fixture bytes published by Identity Control revision b63a1fd5f2822cdcf4187df952a6f356d9bee324.
- Allowed scope: Add or update only Academy identity consumer code, focused tests, product-local conformance receipts/review evidence, plans, and the closing handoff needed for this local slice.
- Allowed scope: Preserve every pre-existing dirty continuation entry and keep Academy fail-closed.
- Forbidden scope: Do not edit Identity Control from this Academy handoff.
- Forbidden scope: No DB, credential, operational key, endpoint provisioning, DNS, Cloudflare, deployment, production sign-in, owner bootstrap, lifecycle traffic, or external mutation is authorized.
- Forbidden scope: Do not enable the Academy client, change Identity Control registry state, set releaseApproval=true, issue entitlement, or treat local conformance as release approval.
- Forbidden scope: Do not modify unrelated public-course, localization, dashboard, font, or media continuation work. Focused identity tests may import existing boundaries, but those imports do not authorize edits to the imported files.

## Repository State
- State: ready.
- Branch: main.
- Baseline: 514ed4d3c2b9279ab5d3d8dd936dd0e2abc61bdb.
- Delivery: local.

## Completed This Session
- Identity Control published a fixture-only ES256 lifecycle-envelope vector and production-verifier proof at revision b63a1fd5f2822cdcf4187df952a6f356d9bee324.
- Identity Control full verification passed and independent producer review closed at C0/H0/M0/L0.
- The six canonical producer artifacts were frozen with SHA-256 digests recorded below.
  - `572d230a9f84c219e5b82eeb84dd1350bd8a319e180f2208f45db3abc03d1875` `config/consumer-registry-v1.approved.json`
  - `d880b0e2a8000f6898b76b91ee47ab18b886ac8e2f413f214448a8a2bed575a4` `docs/integration/consumer-registry-v1.md`
  - `d49d25592785c38dbebadd0ec7ed87088fd215478a0c57d3d7306f8af7c96ad0` `docs/integration/consumer-conformance-kit.md`
  - `7a507be4303b1bea40abb9331f02c7b331ae53e981e7dee6be45932abe6975f5` `docs/integration/lifecycle-pull-consumer-contract.md`
  - `74103c92a46b87831e173ff433600271ddac4238b6ad2518203ee10ca726e6d6` `packages/contracts/src/index.ts`
  - `f2b7fc3c417104a9c9d5bf2adfed4178fb67226167ed143927939c353f6942f9` `packages/testing/src/index.ts`
- Academy implementation state was not changed while this local continuation route was prepared.

## Changed Files
- reports/handoffs/20260809T032657463Z-identity-local-conformance.md: Ready route for the bounded local identity conformance slice.
- reports/handoffs/current.json: Canonical pointer to this ready local continuation.
- Other exact continuation files are listed in the machine-readable worktree allowlist and remain untouched by this routing change.

## Verification
- Identity Control: rtk npm run verify: Passed after the producer-vector change: 348 tests passed and 58 skipped, PostgreSQL 15 and 16 matrices 64/64 each, Playwright 9/9, builds/typechecks/governance/boundaries/audits/SBOM/secret scans passed.
- Identity Control independent producer and reader-first closure reviews: PASS C0/H0/M0/L0; fixture-versus-production boundary, source binding, disabled clients, and releaseApproval=false confirmed.
- rtk git rev-parse HEAD: Academy baseline observed at 514ed4d3c2b9279ab5d3d8dd936dd0e2abc61bdb before the handoff-only commit.
- session-handoff resolve-project --project academy-platform --json: The prior real-runtime packet resolved blocked with the exact existing dirty allowlist; this new packet narrows only the local fixture-conformance continuation.

## Dirty State
All exact current dirty entries are continuation scope. Do not discard, reset, or stage them as part of a handoff-only commit.

- `M` `academy-web/content/courses/basic-os-linux/course.json` — continuation
- `M` `academy-web/content/courses/content-formats-demo/course.json` — continuation
- `M` `academy-web/package.json` — continuation
- `D` `academy-web/src/app/access-required/page.tsx` — continuation
- `D` `academy-web/src/app/api/attempts/route.ts` — continuation
- `D` `academy-web/src/app/api/auth/me/route.ts` — continuation
- `D` `academy-web/src/app/api/auth/otp/route.ts` — continuation
- `D` `academy-web/src/app/api/auth/sign-out/route.ts` — continuation
- `D` `academy-web/src/app/api/auth/verify/route.ts` — continuation
- `D` `academy-web/src/app/api/explanations/route.ts` — continuation
- `D` `academy-web/src/app/api/leads/route.ts` — continuation
- `D` `academy-web/src/app/api/leads/unsubscribe/route.ts` — continuation
- `D` `academy-web/src/app/api/practice/simulation/route.ts` — continuation
- `D` `academy-web/src/app/api/progress/reset/route.ts` — continuation
- `D` `academy-web/src/app/api/progress/route.ts` — continuation
- `D` `academy-web/src/app/auth/callback/route.ts` — continuation
- `D` `academy-web/src/app/course-media/[assetId]/route.ts` — continuation
- `D` `academy-web/src/app/courses/[slug]/lessons/[nodeId]/page.tsx` — continuation
- `M` `academy-web/src/app/courses/[slug]/opengraph-image.tsx` — continuation
- `D` `academy-web/src/app/courses/[slug]/page.tsx` — continuation
- `D` `academy-web/src/app/courses/page.tsx` — continuation
- `D` `academy-web/src/app/dashboard/page.tsx` — continuation
- `D` `academy-web/src/app/error.tsx` — continuation
- `D` `academy-web/src/app/layout.tsx` — continuation
- `D` `academy-web/src/app/page.tsx` — continuation
- `D` `academy-web/src/app/player/exam/[id]/page.tsx` — continuation
- `D` `academy-web/src/app/player/module/[slug]/page.tsx` — continuation
- `D` `academy-web/src/app/player/page.tsx` — continuation
- `D` `academy-web/src/app/privacy/PrivacyContent.tsx` — continuation
- `D` `academy-web/src/app/privacy/page.tsx` — continuation
- `D` `academy-web/src/app/sign-in/page.tsx` — continuation
- `M` `academy-web/src/app/sitemap.ts` — continuation
- `D` `academy-web/src/app/unsubscribe/UnsubscribeForm.tsx` — continuation
- `D` `academy-web/src/app/unsubscribe/page.tsx` — continuation
- `M` `academy-web/src/components/ThemeToggle.tsx` — continuation
- `M` `academy-web/src/components/auth/AccountMenu.tsx` — continuation
- `M` `academy-web/src/components/course/CourseCover.tsx` — continuation
- `M` `academy-web/src/components/course/CourseDashboard.tsx` — continuation
- `M` `academy-web/src/components/course/CourseOverview.tsx` — continuation
- `M` `academy-web/src/components/course/CoverMotif.tsx` — continuation
- `M` `academy-web/src/components/course/LessonView.tsx` — continuation
- `M` `academy-web/src/components/course/RadarChart.tsx` — continuation
- `M` `academy-web/src/components/course/RoadmapGraph.tsx` — continuation
- `M` `academy-web/src/components/i18n/LanguageToggle.tsx` — continuation
- `M` `academy-web/src/components/i18n/LocaleProvider.tsx` — continuation
- `M` `academy-web/src/components/i18n/SiteChrome.tsx` — continuation
- `M` `academy-web/src/lib/content/course-loader.ts` — continuation
- `M` `academy-web/src/lib/content/course-source.ts` — continuation
- `M` `academy-web/src/lib/content/course-types.ts` — continuation
- `M` `academy-web/src/lib/course/assessment-policy.ts` — continuation
- `M` `academy-web/src/lib/course/progress-db.ts` — continuation
- `M` `academy-web/src/lib/course/progress.ts` — continuation
- `M` `academy-web/src/lib/course/roadmap.ts` — continuation
- `M` `academy-web/src/lib/course/skills.ts` — continuation
- `M` `academy-web/src/lib/i18n/ui.ts` — continuation
- `M` `academy-web/src/lib/identity/consumer-policy.ts` — continuation
- `M` `academy-web/src/lib/identity/registry.ts` — continuation
- `M` `academy-web/src/lib/seo.ts` — continuation
- `M` `academy-web/src/middleware.ts` — continuation
- `M` `academy-web/tests/integration/leads-db-fail.test.ts` — continuation
- `M` `academy-web/tests/unit/auth-callback-route.test.ts` — continuation
- `M` `academy-web/tests/unit/auth-me-route.test.ts` — continuation
- `M` `academy-web/tests/unit/content-registry.test.ts` — continuation
- `M` `academy-web/tests/unit/course-roadmap.test.ts` — continuation
- `M` `academy-web/tests/unit/explanations-route.test.ts` — continuation
- `M` `academy-web/tests/unit/identity-consumer-policy.test.ts` — continuation
- `M` `academy-web/tests/unit/identity-registry.test.ts` — continuation
- `M` `academy-web/tests/unit/internal-surface.test.ts` — continuation
- `M` `academy-web/tests/unit/legacy-direct-otp.test.ts` — continuation
- `M` `academy-web/tests/unit/media-route.test.ts` — continuation
- `M` `academy-web/tests/unit/security-wiring.test.ts` — continuation
- `M` `academy-web/tests/unit/sign-in-page.test.ts` — continuation
- `M` `academy-web/tests/unit/sign-out-route.test.ts` — continuation
- `M` `plans/active_plan.md` — continuation
- `M` `plans/completed_log.md` — continuation
- `??` `academy-web/assets/fonts/noto-sans-thai/LICENSE` — continuation
- `??` `academy-web/assets/fonts/noto-sans-thai/NotoSansThai-Bold.ttf` — continuation
- `??` `academy-web/assets/fonts/noto-sans-thai/NotoSansThai-Regular.ttf` — continuation
- `??` `academy-web/assets/fonts/noto-sans-thai/README.md` — continuation
- `??` `academy-web/e2e/course-experience.spec.ts` — continuation
- `??` `academy-web/playwright.public.config.ts` — continuation
- `??` `academy-web/scripts/public-course-page-paths.mjs` — continuation
- `??` `academy-web/scripts/public-share-image-paths.mjs` — continuation
- `??` `academy-web/scripts/verify-cf-public-course-pages.mjs` — continuation
- `??` `academy-web/scripts/verify-cf-public-share-images.mjs` — continuation
- `??` `academy-web/scripts/verify-public-course-pages.mjs` — continuation
- `??` `academy-web/scripts/verify-public-share-image-composition.mjs` — continuation
- `??` `academy-web/scripts/verify-public-share-images.mjs` — continuation
- `??` `academy-web/src/app/(localized)/courses/[slug]/[locale]/layout.tsx` — continuation
- `??` `academy-web/src/app/(localized)/courses/[slug]/[locale]/page.tsx` — continuation
- `??` `academy-web/src/app/(site)/access-required/page.tsx` — continuation
- `??` `academy-web/src/app/(site)/api/attempts/route.ts` — continuation
- `??` `academy-web/src/app/(site)/api/auth/me/route.ts` — continuation
- `??` `academy-web/src/app/(site)/api/auth/otp/route.ts` — continuation
- `??` `academy-web/src/app/(site)/api/auth/sign-out/route.ts` — continuation
- `??` `academy-web/src/app/(site)/api/auth/verify/route.ts` — continuation
- `??` `academy-web/src/app/(site)/api/courses/[slug]/skill-map/route.ts` — continuation
- `??` `academy-web/src/app/(site)/api/explanations/route.ts` — continuation
- `??` `academy-web/src/app/(site)/api/leads/route.ts` — continuation
- `??` `academy-web/src/app/(site)/api/leads/unsubscribe/route.ts` — continuation
- `??` `academy-web/src/app/(site)/api/practice/simulation/route.ts` — continuation
- `??` `academy-web/src/app/(site)/api/progress/reset/route.ts` — continuation
- `??` `academy-web/src/app/(site)/api/progress/route.ts` — continuation
- `??` `academy-web/src/app/(site)/auth/callback/route.ts` — continuation
- `??` `academy-web/src/app/(site)/course-media/[assetId]/route.ts` — continuation
- `??` `academy-web/src/app/(site)/courses/[slug]/learn/page.tsx` — continuation
- `??` `academy-web/src/app/(site)/courses/[slug]/lessons/[nodeId]/page.tsx` — continuation
- `??` `academy-web/src/app/(site)/courses/[slug]/page.tsx` — continuation
- `??` `academy-web/src/app/(site)/courses/[slug]/share/[locale]/route.tsx` — continuation
- `??` `academy-web/src/app/(site)/courses/page.tsx` — continuation
- `??` `academy-web/src/app/(site)/dashboard/page.tsx` — continuation
- `??` `academy-web/src/app/(site)/error.tsx` — continuation
- `??` `academy-web/src/app/(site)/layout.tsx` — continuation
- `??` `academy-web/src/app/(site)/page.tsx` — continuation
- `??` `academy-web/src/app/(site)/player/exam/[id]/page.tsx` — continuation
- `??` `academy-web/src/app/(site)/player/module/[slug]/page.tsx` — continuation
- `??` `academy-web/src/app/(site)/player/page.tsx` — continuation
- `??` `academy-web/src/app/(site)/privacy/PrivacyContent.tsx` — continuation
- `??` `academy-web/src/app/(site)/privacy/page.tsx` — continuation
- `??` `academy-web/src/app/(site)/sign-in/page.tsx` — continuation
- `??` `academy-web/src/app/(site)/unsubscribe/UnsubscribeForm.tsx` — continuation
- `??` `academy-web/src/app/(site)/unsubscribe/page.tsx` — continuation
- `??` `academy-web/src/components/AppShell.tsx` — continuation
- `??` `academy-web/src/components/course/CourseExperience.tsx` — continuation
- `??` `academy-web/src/components/course/CourseLocaleChromeSync.tsx` — continuation
- `??` `academy-web/src/components/course/CourseSkillMap.tsx` — continuation
- `??` `academy-web/src/components/course/PublicCourseCatalog.tsx` — continuation
- `??` `academy-web/src/components/course/PublicCourseLocaleLink.tsx` — continuation
- `??` `academy-web/src/components/course/PublicCourseSyllabus.tsx` — continuation
- `??` `academy-web/src/lib/content/course-step-summary.ts` — continuation
- `??` `academy-web/src/lib/content/legacy-public-course-route.ts` — continuation
- `??` `academy-web/src/lib/content/public-course.ts` — continuation
- `??` `academy-web/src/lib/course-share-image.tsx` — continuation
- `??` `academy-web/src/lib/course/skill-map-client.ts` — continuation
- `??` `academy-web/src/lib/course/skill-map-state.ts` — continuation
- `??` `academy-web/tests/unit/course-experience.test.ts` — continuation
- `??` `academy-web/tests/unit/course-locale-chrome-sync.test.ts` — continuation
- `??` `academy-web/tests/unit/course-skill-map-client.test.ts` — continuation
- `??` `academy-web/tests/unit/course-skill-map-route.test.ts` — continuation
- `??` `academy-web/tests/unit/course-skill-map.test.ts` — continuation
- `??` `academy-web/tests/unit/course-step-summary.test.ts` — continuation
- `??` `academy-web/tests/unit/dashboard-page.test.ts` — continuation
- `??` `academy-web/tests/unit/dashboard-response.test.ts` — continuation
- `??` `academy-web/tests/unit/learner-course-page.test.ts` — continuation
- `??` `academy-web/tests/unit/learner-dashboard-course.test.ts` — continuation
- `??` `academy-web/tests/unit/progress-dashboard-route.test.ts` — continuation
- `??` `academy-web/tests/unit/progress-db-allowlist.test.ts` — continuation
- `??` `academy-web/tests/unit/public-course-catalog.test.ts` — continuation
- `??` `academy-web/tests/unit/public-course-projection.test.ts` — continuation
- `??` `academy-web/tests/unit/public-course-route.test.ts` — continuation
- `??` `academy-web/tests/unit/public-course-share-route.test.ts` — continuation
- `??` `academy-web/tests/unit/public-course-syllabus.test.ts` — continuation
- `??` `academy-web/tests/unit/skill-map-state.test.ts` — continuation
- `??` `artifacts/public-course-syllabus-flight-boundary-2026-08-09.md` — continuation
- `??` `memory/feedback_static_evidence_and_generated_manifest_hygiene.md` — continuation
- `??` `reports/conformance/identity-control/academy-identity-control-conformance.json` — continuation
- `??` `reports/conformance/identity-control/academy-identity-integration-conformance.txt` — continuation
- `??` `reports/conformance/identity-control/academy-identity-unit-conformance.txt` — continuation
- `??` `reports/conformance/identity-control/academy-identity-unproven-scenarios.json` — continuation
- `??` `reports/conformance/identity-control/academy-lint-typecheck.txt` — continuation
- `??` `reports/conformance/identity-control/academy-unit-regression.txt` — continuation
- `??` `reports/reviews/identity-control-conformance-ril-2026-08-08.md` — continuation
- `??` `reports/reviews/learner-course-skill-map-checkpoint-2026-08-09.md` — continuation
- `??` `reports/reviews/learner-dashboard-data-boundary-checkpoint-2026-08-09.md` — continuation
- `??` `reports/reviews/public-course-canonical-locale-checkpoint-2026-08-09.md` — continuation
- `??` `reports/reviews/public-course-catalog-locale-checkpoint-2026-08-09.md` — continuation
- `??` `reports/reviews/public-course-locale-continuity-checkpoint-2026-08-09.md` — continuation
- `??` `reports/reviews/public-course-share-image-checkpoint-2026-08-09.md` — continuation
- `??` `reports/reviews/public-course-syllabus-checkpoint-2026-08-09.md` — continuation
## Cleanup State
- Processes: Pre-existing Next.js node process PID 59647 remains listening on TCP 3003; it predates this route and must not be treated as lane-owned.
- Artifacts: Only this handoff and its canonical pointer are generated for routing; every existing untracked Academy artifact remains continuation scope.

## Remaining Work And Risks
- Verify the exact producer positive vector through Academy consumer code and prove focused fail-closed negative cases.
- Record the producer revision and all six canonical artifact digests in Academy conformance evidence, then run an independent local checkpoint review.
- Keep the prior real-runtime blocker active: verification-key distribution, lifecycle endpoint/audiences, kill-switch operator, production authorization, and canonical owner bootstrap remain unavailable.
- Academy has a large pre-existing uncommitted continuation set; the local identity slice must not reset, stage, or claim unrelated paths.
- Using reconstructed or substitute fixture bytes would break source-bound provenance even if cryptographic tests passed.
- A local conformance PASS could be misread as release authorization unless enabled=false, releaseApproval=false, and the real-runtime blocker remain explicit.

No blocker for the bounded local fixture-conformance slice. Production runtime remains separately blocked by the prior handoff and is outside this packet's scope.

## Exact Next Action
Working directory: academy-web

Implement one bounded local Academy consumer conformance slice against Identity Control revision b63a1fd5f2822cdcf4187df952a6f356d9bee324, prove positive and fail-closed cases, and update local evidence without enabling runtime integration.

First step: Read the canonical context and prior blocked packet, verify the frozen Identity Control revision and six SHA-256 digests without editing that repository, then add the narrow failing Academy consumer test before implementation.

Commands:
- `rtk git -C ../../identity-control rev-parse HEAD`
- `rtk shasum -a 256 ../../identity-control/config/consumer-registry-v1.approved.json ../../identity-control/docs/integration/consumer-registry-v1.md ../../identity-control/docs/integration/consumer-conformance-kit.md ../../identity-control/docs/integration/lifecycle-pull-consumer-contract.md ../../identity-control/packages/contracts/src/index.ts ../../identity-control/packages/testing/src/index.ts`
- Run the focused Academy identity unit tests failing-first, implement the smallest local consumer boundary, then rerun the focused tests and the repository checks required by AGENTS.md.
- Update Academy conformance receipts, checkpoint review, plans, and closing handoff with observed commands and exact producer provenance.

## Done Definition
- Academy verifies the exact producer-owned positive envelope at the supplied issuer, audience, kid, ES256 algorithm, verification time, clock skew, and lifetime policy.
- Focused tamper and policy-mismatch cases fail closed, with no invented operational key, endpoint, credential, or production payload.
- Academy evidence binds Identity Control revision b63a1fd5f2822cdcf4187df952a6f356d9bee324 and the six canonical SHA-256 digests recorded in this packet.
- Independent checkpoint review has no unresolved Critical, High, or Medium findings; all Low findings are fixed or explicitly routed.
- Identity Control still records enabled=false for both clients and releaseApproval=false; Academy real runtime, owner bootstrap, deployment, and traffic remain blocked.

## Do Not Touch
- No DB, credential, operational key, endpoint provisioning, DNS, Cloudflare, deployment, production sign-in, owner bootstrap, lifecycle traffic, or external mutation is authorized.
- Do not edit Identity Control from this Academy handoff.
- Do not enable the Academy client, change Identity Control registry state, set releaseApproval=true, issue entitlement, or treat local conformance as release approval.
- Do not modify unrelated public-course, localization, dashboard, font, or media continuation work. Focused identity tests may import existing boundaries, but those imports do not authorize edits to the imported files.
- Do not discard or reset any continuation entry listed in the packet.
