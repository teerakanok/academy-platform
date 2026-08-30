import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { runAcademyP1P7 } from "./academy-production-p1-p7-runner.mjs";

const D = "a".repeat(64);
const binding = () => ({
  authorityId: randomUUID(),
  releaseRevision: "b".repeat(40),
  identityReadinessSha256: D,
  validUntil: "2099-01-01T00:00:00Z",
  deploymentId: randomUUID(),
  versionId: randomUUID(),
  configuredNamesSha256: D,
  operationId: "academy-p5-abcdef0123456789ab",
});
function ports({ failAt } = {}) {
  const calls = [];
  const call = (name, value) => async () => {
    calls.push(name);
    if (failAt === name) throw Error("private");
    return value;
  };
  return {
    calls,
    value: {
      checkpoint: call("checkpoint", {}),
      reserveSynthetic: call("reserve", { status: "reserved" }),
      publicHome: call("P1", { check: "P1", status: "PASS" }),
      publicCourseCatalog: call("P2", { check: "P2", status: "PASS" }),
      startIdentity: call("P3", { status: "PASS", authorizationBound: true }),
      prepareSynthetic: call("prepare", {
        status: "fixture_prepared",
        auditSha256: D,
      }),
      startCanonicalOtp: call("otp", {
        status: "PASS",
        challengeId: randomUUID(),
      }),
      issueSynthetic: call("issue", {
        status: "code_issued",
        auditSha256: D,
        outputPath: "/protected/otp",
      }),
      completeIdentity: call("P5", { status: "PASS", callbackExchanged: true }),
      enrollLearner: call("P6", { status: "PASS", receiptSha256: D }),
      exerciseProgress: call("P7", { status: "PASS", authorized: true }),
      cleanupSyntheticAndAcademy: call("cleanup", {
        status: "ABSENT",
        identityReceiptSha256: D,
        academyReceiptSha256: D,
      }),
    },
  };
}

test("requires the exact P1-P7 sequence and terminal absence proof", async () => {
  const p = ports();
  const result = await runAcademyP1P7({ binding: binding(), ports: p.value });
  assert.deepEqual(result.checks, ["P1", "P2", "P3", "P4", "P5", "P6", "P7"]);
  assert.deepEqual(p.calls, [
    "P1",
    "P2",
    "P3",
    "checkpoint",
    "checkpoint",
    "reserve",
    "checkpoint",
    "prepare",
    "checkpoint",
    "otp",
    "issue",
    "P5",
    "P6",
    "P7",
    "checkpoint",
    "cleanup",
    "checkpoint",
  ]);
});

test("every post-prepare failure still performs cleanup and emits no PASS", async () => {
  for (const failAt of [
    "reserve",
    "prepare",
    "otp",
    "issue",
    "P5",
    "P6",
    "P7",
  ]) {
    const p = ports({ failAt });
    await assert.rejects(
      runAcademyP1P7({ binding: binding(), ports: p.value }),
    );
    assert.deepEqual(p.calls.slice(-2), ["cleanup", "checkpoint"]);
  }
});

test("headed production contract waits for real Turnstile without reading or logging its token", async () => {
  const source = await readFile(
    new URL("./academy-production-p1-p7-runner.mjs", import.meta.url),
    "utf8",
  );
  assert.match(source, /while \(await send\.isDisabled\(\)\)/);
  assert.match(source, /turnstileDeadlineMs/);
  assert.doesNotMatch(
    source,
    /cf-turnstile-response|turnstileToken|test.?token/i,
  );
  assert.doesNotMatch(source, /console\.(?:log|error)/);
  assert.match(source, /process\.stdout\.write/);
});
