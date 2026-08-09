# Session Handoff: academy-platform

<!-- session-handoff/v1
{
  "schema": "session-handoff/v1",
  "id": "20260809T013829227Z-academy-identity-runtime-blocked",
  "created_at": "2026-08-09T01:38:29.227Z",
  "project": "academy-platform",
  "objective": "Preserve Academy public-preview and learner-data-boundary work; await Identity Control runtime release gates before enabling real learner accounts.",
  "state": "blocked",
  "repo": {
    "remote": "github.com/teerakanok/academy-platform",
    "branch": "main",
    "base_head": "c19a339c6d3e59781be68c1661fa1bbcbcf04676"
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
      "Preserve current Academy implementation and reports without enabling accounts, lessons, course access, or production integration.",
      "After Identity Control publishes runtime inputs and receives authorization, resume Academy only for canonical owner bootstrap and entitled learner runtime proof."
    ],
    "forbidden": [
      "Do not edit Identity Control from this Academy handoff.",
      "No DB, credential, key, DNS, Cloudflare, deployment, production sign-in, lifecycle traffic, or external mutation is authorized.",
      "Do not enable the Academy client, issue entitlement, or treat this local evidence as release approval."
    ]
  },
  "canonical_read_order": [
    "AGENTS.md",
    "plans/active_plan.md",
    "plans/completed_log.md",
    "academy-web/src/lib/identity/consumer-policy.ts",
    "academy-web/src/lib/identity/registry.ts"
  ],
  "owner_decisions": [
    "Academy remains fail-closed until Identity Control runtime release and separate production authorization.",
    "Public previews may remain static, but learner accounts, lessons, progress, and enrollment must not be opened.",
    "No production or shared-infrastructure mutation is authorized by this handoff."
  ],
  "completed": [
    "Added static EN/TH public course previews, localized metadata/share images, and allowlisted public projections.",
    "Hardened learner skill-map and dashboard Flight/API data boundaries; dashboard progress reads now require entitlement-approved slugs.",
    "Recorded checkpoint reports and updated the active plan/completed log.",
    "Ecosystem: no impact — Academy stayed disabled and no cross-product contract, infrastructure, or release state changed."
  ],
  "changed_files": [
    {
      "path": "academy-web/src/components/course/CourseDashboard.tsx",
      "reason": "Entitlement-driven dashboard DTO and fail-closed client response handling."
    },
    {
      "path": "academy-web/src/app/(site)/api/progress/route.ts",
      "reason": "Private no-store dashboard response and entitlement-before-progress-read boundary."
    },
    {
      "path": "academy-web/src/lib/course/progress-db.ts",
      "reason": "Required slug allowlist for dashboard progress query."
    },
    {
      "path": "academy-web/src/lib/content/public-course.ts",
      "reason": "Explicit public and learner-dashboard DTO allowlists."
    },
    {
      "path": "plans/active_plan.md",
      "reason": "Current checkpoints and external runtime gates."
    },
    {
      "path": "plans/completed_log.md",
      "reason": "Session outcome and residual authorization gate."
    },
    {
      "path": "reports/reviews/learner-dashboard-data-boundary-checkpoint-2026-08-09.md",
      "reason": "Verification and review evidence."
    }
  ],
  "remaining_work": [
    "Identity Control must publish Academy verification-key reference, lifecycle endpoint/audiences, named kill-switch operator, conformance rehearsal evidence, and separate production authorization.",
    "Academy must then bootstrap the owner from canonical sign-in and run entitled learner browser proof in EN/TH at 320/390px.",
    "Retention cron and media deployment evidence, legal review, catalog decision, and public-release authorization remain separate gates."
  ],
  "risks": [
    "All current Academy implementation is uncommitted local continuation state.",
    "Identity runtime and owner bootstrap are intentionally unwired; no learner account can be opened.",
    "Public preview content is not authorization to market or sell the catalog."
  ],
  "next": {
    "cwd": "academy-web",
    "summary": "Wait for Identity Control consumer-runtime release inputs; then resume Academy for canonical owner bootstrap and entitled learner proof.",
    "first_step": "In Identity Control, implement and independently verify the Academy consumer release prerequisites without enabling Academy from this repository.",
    "commands": [
      "Read the Identity Control active plan and consumer registry release gates.",
      "After producer release authorization, resume academy-platform and run rtk npm run test:unit plus the entitled learner browser matrix."
    ],
    "acceptance": [
      "Identity Control has published non-secret runtime inputs and independent conformance evidence with separate production authorization.",
      "Academy receives no invented key, endpoint, or authorization and remains fail-closed until those inputs exist.",
      "Canonical owner bootstrap and entitled learner EN/TH browser proof complete without opening unauthorized course access."
    ],
    "execution_boundary": "blocked-external-or-sensitive"
  },
  "blocker": {
    "reason": "Identity Control consumer runtime is disabled and lacks published verification-key, lifecycle, kill-switch, conformance, and production-authorization inputs.",
    "required_input": "Identity Control implementation/release evidence and explicit production authorization; then one canonical owner sign-in for Academy bootstrap."
  },
  "verification": [
    {
      "command": "rtk npm run test:unit",
      "result": "474/474 passed across 71 files."
    },
    {
      "command": "rtk npm run build",
      "result": "Passed; one pre-existing generated-registry unused-disable warning only."
    },
    {
      "command": "rtk npm run test:e2e:public",
      "result": "24/24 passed on desktop and mobile."
    },
    {
      "command": "rtk git diff --check",
      "result": "Passed."
    },
    {
      "command": "session-cleanup.mjs scan/sweep/verify --since 2026-08-08T14:58:17Z",
      "result": "session-cleanup/v1 clean=true; session residue: 0 paths (0 B reclaimable), 0 processes; untracked in repo from this session: 67 files (265.7 KB) to triage."
    }
  ],
  "cleanup": {
    "processes": "session-cleanup/v1 clean=true; session residue: 0 paths (0 B reclaimable), 0 processes; no --keep.",
    "artifacts": "session-cleanup/v1 clean=true; session residue: 0 paths (0 B reclaimable), 0 processes; untracked in repo from this session: 67 files (265.7 KB) to triage; all continuation."
  }
}
-->

## Objective
Preserve Academy public-preview and learner-data-boundary work; await Identity Control runtime release gates before enabling real learner accounts.

## Owner Intent And Decisions
- Academy remains fail-closed until Identity Control runtime release and separate production authorization.
- Public previews may remain static, but learner accounts, lessons, progress, and enrollment must not be opened.
- No production or shared-infrastructure mutation is authorized by this handoff.
- Allowed scope: Preserve current Academy implementation and reports without enabling accounts, lessons, course access, or production integration.
- Allowed scope: After Identity Control publishes runtime inputs and receives authorization, resume Academy only for canonical owner bootstrap and entitled learner runtime proof.
- Forbidden scope: Do not edit Identity Control from this Academy handoff.
- Forbidden scope: No DB, credential, key, DNS, Cloudflare, deployment, production sign-in, lifecycle traffic, or external mutation is authorized.
- Forbidden scope: Do not enable the Academy client, issue entitlement, or treat this local evidence as release approval.

## Repository State
- State: blocked.
- Branch: main.
- Baseline: c19a339c6d3e59781be68c1661fa1bbcbcf04676.
- Delivery: local.

## Completed This Session
- Added static EN/TH public course previews, localized metadata/share images, and allowlisted public projections.
- Hardened learner skill-map and dashboard Flight/API data boundaries; dashboard progress reads now require entitlement-approved slugs.
- Recorded checkpoint reports and updated the active plan/completed log.
- Ecosystem: no impact — Academy stayed disabled and no cross-product contract, infrastructure, or release state changed.

## Changed Files
- academy-web/src/components/course/CourseDashboard.tsx: Entitlement-driven dashboard DTO and fail-closed client response handling.
- academy-web/src/app/(site)/api/progress/route.ts: Private no-store dashboard response and entitlement-before-progress-read boundary.
- academy-web/src/lib/course/progress-db.ts: Required slug allowlist for dashboard progress query.
- academy-web/src/lib/content/public-course.ts: Explicit public and learner-dashboard DTO allowlists.
- plans/active_plan.md: Current checkpoints and external runtime gates.
- plans/completed_log.md: Session outcome and residual authorization gate.
- reports/reviews/learner-dashboard-data-boundary-checkpoint-2026-08-09.md: Verification and review evidence.
- Other exact continuation files are listed in the machine-readable worktree allowlist.

## Verification
- rtk npm run test:unit: 474/474 passed across 71 files.
- rtk npm run build: Passed; one pre-existing generated-registry unused-disable warning only.
- rtk npm run test:e2e:public: 24/24 passed on desktop and mobile.
- rtk git diff --check: Passed.
- session-cleanup.mjs scan/sweep/verify --since 2026-08-08T14:58:17Z: session-cleanup/v1 clean=true; session residue: 0 paths (0 B reclaimable), 0 processes; untracked in repo from this session: 67 files (265.7 KB) to triage.

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
- Processes: session-cleanup/v1 clean=true; session residue: 0 paths (0 B reclaimable), 0 processes; no --keep.
- Artifacts: session-cleanup/v1 clean=true; session residue: 0 paths (0 B reclaimable), 0 processes; untracked in repo from this session: 67 files (265.7 KB) to triage; all continuation.

## Remaining Work And Risks
- Identity Control must publish Academy verification-key reference, lifecycle endpoint/audiences, named kill-switch operator, conformance rehearsal evidence, and separate production authorization.
- Academy must then bootstrap the owner from canonical sign-in and run entitled learner browser proof in EN/TH at 320/390px.
- Retention cron and media deployment evidence, legal review, catalog decision, and public-release authorization remain separate gates.
- All current Academy implementation is uncommitted local continuation state.
- Identity runtime and owner bootstrap are intentionally unwired; no learner account can be opened.
- Public preview content is not authorization to market or sell the catalog.

Blocked on: Identity Control consumer runtime is disabled and lacks published verification-key, lifecycle, kill-switch, conformance, and production-authorization inputs.

Required input: Identity Control implementation/release evidence and explicit production authorization; then one canonical owner sign-in for Academy bootstrap.

## Exact Next Action
Working directory: academy-web

Wait for Identity Control consumer-runtime release inputs; then resume Academy for canonical owner bootstrap and entitled learner proof.

First step: In Identity Control, implement and independently verify the Academy consumer release prerequisites without enabling Academy from this repository.

Commands:
- Read the Identity Control active plan and consumer registry release gates.
- After producer release authorization, resume academy-platform and run rtk npm run test:unit plus the entitled learner browser matrix.

## Done Definition
- Identity Control has published non-secret runtime inputs and independent conformance evidence with separate production authorization.
- Academy receives no invented key, endpoint, or authorization and remains fail-closed until those inputs exist.
- Canonical owner bootstrap and entitled learner EN/TH browser proof complete without opening unauthorized course access.

## Do Not Touch
- No DB, credential, key, DNS, Cloudflare, deployment, production sign-in, lifecycle traffic, or external mutation is authorized.
- Do not edit Identity Control from this Academy handoff.
- Do not enable the Academy client, issue entitlement, or treat this local evidence as release approval.
- Do not discard or reset any continuation entry listed in the packet.
