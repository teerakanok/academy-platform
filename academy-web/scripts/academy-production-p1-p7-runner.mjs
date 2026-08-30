#!/usr/bin/env node
import { createHash, randomBytes } from "node:crypto";
import { constants } from "node:fs";
import {
  mkdir,
  open,
  realpath,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createAcademyP1P7SshRemote } from "./academy-production-p1-p7-ssh.mjs";

export const IDENTITY_SYNTHETIC_AUTHORITY = Object.freeze({
  revision: "a3be2773267d5149cc317bd8289f68be09bfe9ae",
  executable:
    "/opt/identity-control/operators/releases/a3be2773267d5149cc317bd8289f68be09bfe9ae-c2073d07df83d1d4e963816ac3e4af28126113764a1d88cd951c7bd1d02680dc/synthetic-sign-in-code.mjs",
  executableSha256:
    "c2073d07df83d1d4e963816ac3e4af28126113764a1d88cd951c7bd1d02680dc",
  node: "/opt/node-v24.18.0/bin/node",
  nodeSha256:
    "41a74efb34cbde5c7632cdac0cf8bd1a14d0b8d73dc1e82755014d9a9ce70f5c",
  manifestSha256:
    "cfa590e568260ff6117b1bc7cda88169dbf8eef81441fdf1fe3ff6f5c39207f3",
  authorityReceiptSha256:
    "04e969c91965d5c8f6b1d585fe0972a3aab498a784373bd0dc908c31a25b411e",
  wrapper:
    "/opt/identity-control/operators/prepare/87be595ca1f8db8a/prepare-synthetic-sign-in-fixture.mjs",
  wrapperSha256:
    "87be595ca1f8db8a218bc14dec055d66b07307017b5cfc812a721f490cc320c1",
  wrapperManifestSha256:
    "443b9f7c80f7e89e649922807692b9657c93737bc17b809bd46d2631a6eb1571",
  wrapperAuthoritySha256:
    "b0a1897048e9881a0789204619de9c770bc5258904ba597ab7afc026998cb01e",
  hostHelperSha256:
    "221f2831c71f108128b23992358aa61fde9daca213cbd0c5a1c157180e55544f",
});

const CHECKS = Object.freeze(["P1", "P2", "P3", "P4", "P5", "P6", "P7"]);
const SHA = /^[a-f0-9]{64}$/;
const REV = /^[a-f0-9]{40}$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const fail = () => {
  throw new Error("ACADEMY_P1_P7_REJECTED");
};

export async function runAcademyP1P7({ binding, ports }) {
  if (
    !binding ||
    !UUID.test(binding.authorityId) ||
    !REV.test(binding.releaseRevision) ||
    !SHA.test(binding.identityReadinessSha256) ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(binding.validUntil) ||
    !UUID.test(binding.deploymentId) ||
    !UUID.test(binding.versionId) ||
    !SHA.test(binding.configuredNamesSha256) ||
    !/^academy-p5-[a-f0-9]{18}$/.test(binding.operationId) ||
    !ports
  )
    fail();
  const evidence = [];
  let cleanupNeeded = false,
    cleanup,
    originatingError;
  try {
    evidence.push(await exactCheck("P1", ports.publicHome()));
    evidence.push(await exactCheck("P2", ports.publicCourseCatalog()));
    const started = await ports.startIdentity();
    if (started?.status !== "PASS" || !started.authorizationBound) fail();
    evidence.push({ check: "P3", status: "PASS" });
    await ports.checkpoint("operation-planned");
    cleanupNeeded = true;
    await ports.checkpoint("cleanup-needed");
    const reserved = await ports.reserveSynthetic({
      operationId: binding.operationId,
    });
    if (reserved?.status !== "reserved") fail();
    await ports.checkpoint("reserved");
    const fixture = await ports.prepareSynthetic({
      operationId: binding.operationId,
    });
    if (
      fixture?.status !== "fixture_prepared" ||
      !SHA.test(fixture.auditSha256)
    )
      fail();
    await ports.checkpoint("prepared");
    const challenge = await ports.startCanonicalOtp();
    if (challenge?.status !== "PASS" || !UUID.test(challenge.challengeId))
      fail();
    const issued = await ports.issueSynthetic({
      challengeId: challenge.challengeId,
    });
    if (issued?.status !== "code_issued" || !SHA.test(issued.auditSha256))
      fail();
    evidence.push({ check: "P4", status: "PASS" });
    const completed = await ports.completeIdentity({
      outputPath: issued.outputPath,
    });
    if (completed?.status !== "PASS" || !completed.callbackExchanged) fail();
    evidence.push({ check: "P5", status: "PASS" });
    const enrolled = await ports.enrollLearner();
    if (enrolled?.status !== "PASS" || !SHA.test(enrolled.receiptSha256))
      fail();
    evidence.push({ check: "P6", status: "PASS" });
    const progressed = await ports.exerciseProgress();
    if (progressed?.status !== "PASS" || !progressed.authorized) fail();
    evidence.push({ check: "P7", status: "PASS" });
  } catch (error) {
    originatingError = error;
  } finally {
    if (cleanupNeeded) {
      let cleanupError;
      try {
        await ports.checkpoint("cleanup-pending");
      } catch (error) {
        cleanupError = error;
      }
      try {
        cleanup = await ports.cleanupSyntheticAndAcademy();
        await ports.checkpoint("cleaned");
      } catch (error) {
        cleanupError ??= error;
      }
      if (!originatingError && cleanupError) throw cleanupError;
    }
  }
  if (originatingError) throw originatingError;
  if (
    cleanup?.status !== "ABSENT" ||
    !SHA.test(cleanup.identityReceiptSha256) ||
    !SHA.test(cleanup.academyReceiptSha256) ||
    JSON.stringify(evidence.map((value) => value.check)) !==
      JSON.stringify(CHECKS)
  )
    fail();
  const body = {
    status: "PASS",
    authorityId: binding.authorityId,
    releaseRevision: binding.releaseRevision,
    identityReadinessSha256: binding.identityReadinessSha256,
    validUntil: binding.validUntil,
    deploymentId: binding.deploymentId,
    versionId: binding.versionId,
    configuredNamesSha256: binding.configuredNamesSha256,
    checks: CHECKS,
    evidence,
    cleanup,
    identitySyntheticAuthority: IDENTITY_SYNTHETIC_AUTHORITY,
  };
  return {
    ...body,
    receiptSha256: createHash("sha256")
      .update(`${JSON.stringify(body)}\n`)
      .digest("hex"),
  };
}

const CONFIG = "/opt/academy/production-operations/p1-p7-config.json";
async function protectedConfig(expectedSha256) {
  if (!SHA.test(expectedSha256) || (await realpath(CONFIG)) !== CONFIG) fail();
  const h = await open(CONFIG, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const s = await h.stat();
    if (
      !s.isFile() ||
      s.nlink !== 1 ||
      s.uid !== 0 ||
      (s.mode & 0o777) !== 0o600 ||
      s.size > 4096
    )
      fail();
    const bytes = await h.readFile(),
      value = JSON.parse(bytes);
    if (
      createHash("sha256").update(bytes).digest("hex") !== expectedSha256 ||
      bytes.toString() !== `${JSON.stringify(value)}\n` ||
      JSON.stringify(Object.keys(value)) !==
        JSON.stringify(["schema", "turnstileDeadlineMs"]) ||
      value.schema !== "academy-production-p1-p7-config/v1" ||
      !Number.isSafeInteger(value.turnstileDeadlineMs) ||
      value.turnstileDeadlineMs < 30_000 ||
      value.turnstileDeadlineMs > 300_000
    )
      fail();
    return value;
  } finally {
    await h.close();
  }
}
function flags(args) {
  if (args.length % 2) fail();
  const out = Object.create(null);
  for (let i = 0; i < args.length; i += 2) {
    if (!/^--[a-z][a-z-]*$/.test(args[i]) || args[i] in out) fail();
    out[args[i]] = args[i + 1];
  }
  return out;
}
export async function main(args, injected = {}) {
  const v = flags(args),
    config = await (injected.readConfig?.(v["--config"]) ??
      protectedConfig(v["--config"]));
  if (
    JSON.stringify(Object.keys(v)) !==
      JSON.stringify([
        "--authority",
        "--release",
        "--readiness",
        "--valid-until",
        "--deployment",
        "--version",
        "--config",
      ]) ||
    !UUID.test(v["--authority"]) ||
    !REV.test(v["--release"]) ||
    !SHA.test(v["--readiness"]) ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(v["--valid-until"]) ||
    !Number.isFinite(Date.parse(v["--valid-until"])) ||
    Date.now() >= Date.parse(v["--valid-until"]) ||
    !UUID.test(v["--deployment"]) ||
    !UUID.test(v["--version"]) ||
    !SHA.test(v["--config"])
  )
    fail();
  const journal = injected.operationId ? null : await durableJournal(),
    operationId = injected.operationId ?? journal.operationId,
    checkpoint = injected.checkpoint ?? journal.checkpoint,
    remote = injected.remote ?? createAcademyP1P7SshRemote();
  if (journal?.cleanupNeeded) {
    const cleaned = await remote.cleanup({
      operationPath: `/root/identity-synthetic-operations/${operationId}`,
    });
    if (cleaned.status !== "ABSENT") fail();
    await checkpoint("cleaned");
    fail();
  }
  if (journal?.phase === "cleaned") {
    await unlink(JOURNAL);
    await syncPath("/var/root/academy-production-operations");
    fail();
  }
  const chromium = injected.chromium ?? (await import("playwright")).chromium,
    browser = await chromium.launch({ headless: false }),
    context = await browser.newContext(),
    page = await context.newPage();
  try {
    const result = await runAcademyP1P7({
      binding: {
        authorityId: v["--authority"],
        releaseRevision: v["--release"],
        identityReadinessSha256: v["--readiness"],
        validUntil: v["--valid-until"],
        deploymentId: v["--deployment"],
        versionId: v["--version"],
        configuredNamesSha256: v["--config"],
        operationId,
      },
      ports: createHeadedBrowserPorts({
        page,
        remote,
        academyOrigin: "https://academy.cyberskills.co.th",
        turnstileDeadlineMs: config.turnstileDeadlineMs,
        checkpoint,
      }),
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await context.close();
    await browser.close();
  }
}
const JOURNAL = "/var/root/academy-production-operations/p1-p7-journal.json";
async function durableJournal() {
  await mkdir("/var/root/academy-production-operations", {
    recursive: true,
    mode: 0o700,
  });
  let value;
  try {
    const h = await open(JOURNAL, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const s = await h.stat({ bigint: true });
      if (
        !s.isFile() ||
        s.uid !== 0n ||
        (s.mode & 0o777n) !== 0o600n ||
        s.nlink !== 1n ||
        s.size > 4096n
      )
        fail();
      value = JSON.parse(await h.readFile("utf8"));
    } finally {
      await h.close();
    }
  } catch (error) {
    if (error?.code !== "ENOENT") fail();
    value = {
      schema: "academy-p1-p7-journal/v1",
      operationId: `academy-p5-${randomBytes(9).toString("hex")}`,
      phase: "operation-planned",
      cleanupNeeded: false,
    };
    await writeFile(JOURNAL, `${JSON.stringify(value)}\n`, {
      flag: "wx",
      mode: 0o600,
    });
    await syncPath(JOURNAL);
    await syncPath("/var/root/academy-production-operations");
  }
  if (
    value.schema !== "academy-p1-p7-journal/v1" ||
    !/^academy-p5-[a-f0-9]{18}$/.test(value.operationId) ||
    typeof value.cleanupNeeded !== "boolean"
  )
    fail();
  return {
    operationId: value.operationId,
    phase: value.phase,
    checkpoint: async (phase) => {
      const next = {
        ...value,
        phase,
        cleanupNeeded:
          phase === "cleaned"
            ? false
            : value.cleanupNeeded || phase === "cleanup-needed",
      };
      const temp = `${JOURNAL}.${process.pid}.tmp`;
      await writeFile(temp, `${JSON.stringify(next)}\n`, {
        flag: "wx",
        mode: 0o600,
      });
      await syncPath(temp);
      await rename(temp, JOURNAL);
      await syncPath("/var/root/academy-production-operations");
      value = next;
    },
  };
}
async function syncPath(path) {
  const h = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    await h.sync();
  } finally {
    await h.close();
  }
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  main(process.argv.slice(2)).catch(() => {
    process.stderr.write("ACADEMY_P1_P7_REJECTED\n");
    process.exitCode = 1;
  });

async function exactCheck(check, promise) {
  const value = await promise;
  if (value?.status !== "PASS" || value.check !== check) fail();
  return { check, status: "PASS" };
}

export function createHeadedBrowserPorts({
  page,
  remote,
  academyOrigin,
  turnstileDeadlineMs = 120_000,
  checkpoint = async () => {},
}) {
  if (academyOrigin !== "https://academy.cyberskills.co.th" || !page || !remote)
    fail();
  let operation, challengeId;
  return {
    checkpoint,
    reserveSynthetic: async ({ operationId }) => {
      operation = {
        operationPath: `/root/identity-synthetic-operations/${operationId}`,
      };
      const reserved = await remote.reserve({ operationId });
      operation = reserved;
      return reserved;
    },
    publicHome: async () => {
      const response = await page.goto(`${academyOrigin}/`, {
        waitUntil: "domcontentloaded",
      });
      return {
        check: "P1",
        status: response?.status() === 200 ? "PASS" : "FAIL",
      };
    },
    publicCourseCatalog: async () => {
      const response = await page.goto(`${academyOrigin}/courses`, {
        waitUntil: "domcontentloaded",
      });
      return {
        check: "P2",
        status: response?.status() === 200 ? "PASS" : "FAIL",
      };
    },
    startIdentity: async () => {
      await page.goto(`${academyOrigin}/sign-in?next=/dashboard`, {
        waitUntil: "domcontentloaded",
      });
      await page.getByTestId("identity-control-continue").click();
      await page.waitForURL(
        /^https:\/\/accounts\.cyberskills\.co\.th\/sign-in\?/,
      );
      return { status: "PASS", authorizationBound: true };
    },
    prepareSynthetic: async () => {
      operation = await remote.prepare({
        operationPath: operation.operationPath,
      });
      if (
        operation?.status !== "fixture_prepared" ||
        !/^\/root\/identity-synthetic-operations\/academy-p5-[a-f0-9]{18}$/.test(
          operation.operationPath,
        )
      )
        fail();
      return { status: operation.status, auditSha256: operation.auditSha256 };
    },
    startCanonicalOtp: async () => {
      const operationId = operation.operationPath.split("/").at(-1),
        email = `${operationId}@synthetic.cyberskills.co.th`,
        send = page.getByRole("button", { name: "Email me a sign-in code" });
      await page.getByLabel("Email address").fill(email);
      await send.waitFor({ state: "visible", timeout: turnstileDeadlineMs });
      const deadline = Date.now() + turnstileDeadlineMs;
      while (await send.isDisabled()) {
        if (Date.now() >= deadline) fail();
        await page.waitForTimeout(250);
      }
      const responsePromise = page.waitForResponse(
        (response) =>
          response.url().endsWith("/v1/otp/start") &&
          response.request().method() === "POST",
      );
      await send.click();
      const response = await responsePromise;
      if (response.status() !== 200) fail();
      const body = await response.json();
      if (!UUID.test(body?.challengeId)) fail();
      challengeId = body.challengeId;
      return { status: "PASS", challengeId };
    },
    issueSynthetic: async () =>
      remote.issue({ operationPath: operation.operationPath, challengeId }),
    completeIdentity: async ({ outputPath }) => {
      const otp = await remote.consumeOtp({
        operationPath: operation.operationPath,
        outputPath,
      });
      if (!/^\d{6}$/.test(otp)) fail();
      await page.getByLabel("6-digit code").fill(otp);
      await page.getByRole("button", { name: "Continue" }).click();
      await page.waitForURL(
        /^https:\/\/academy\.cyberskills\.co\.th\/(?:dashboard)?/,
      );
      const me = await page.request.get(`${academyOrigin}/api/auth/me`),
        body = await me.json();
      if (me.status() !== 200 || body?.signedIn !== true) fail();
      return { status: "PASS", callbackExchanged: true };
    },
    enrollLearner: async () =>
      remote.enroll({ operationPath: operation.operationPath }),
    exerciseProgress: async () => {
      const response = await page.request.post(
        `${academyOrigin}/api/progress`,
        {
          headers: {
            origin: academyOrigin,
            "content-type": "application/json",
          },
          data: {
            action: "open",
            slug: "setup-and-environment",
            nodeId: "choose-your-environment",
          },
        },
      );
      return {
        status: response.status() === 200 ? "PASS" : "FAIL",
        authorized: response.status() === 200,
      };
    },
    cleanupSyntheticAndAcademy: async () =>
      remote.cleanup({ operationPath: operation.operationPath }),
  };
}
