import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import {
  mkdtemp,
  mkdir,
  readdir,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { Readable } from "node:stream";
import {
  createAcademyP1P7SshRemote,
  secureTransferOtp,
} from "./academy-production-p1-p7-ssh.mjs";

const D = "a".repeat(64),
  operationPath =
    "/root/identity-synthetic-operations/academy-p5-abcdef0123456789ab";
test("SSH adapter invokes only fixed reviewed wrapper and bounded host programs", async () => {
  const calls = [];
  const executeSsh = async (args) => {
    calls.push(args);
    if (args.includes("stage-otp"))
      return JSON.stringify({
        status: "STAGED",
        handoffPath: `${operationPath}/academy-otp-handoff`,
      });
    if (args.includes("clear-otp")) return JSON.stringify({ status: "ABSENT" });
    if (args[1]?.includes("academy-production-p1-p7-host.mjs")) {
      const mode = args[2];
      return JSON.stringify({
        schema: "academy-synthetic-fixture-db/v1",
        operationId: operationPath.split("/").at(-1),
        status: mode === "enroll" ? "ENROLLED" : "ABSENT",
        emailSha256: D,
      });
    }
    if (args.includes("issue"))
      return JSON.stringify({
        status: "code_issued",
        operationPath,
        outputPath: `${operationPath}/issue-output.json`,
        auditSha256: D,
      });
    if (args.includes("cleanup"))
      return JSON.stringify({
        status: "removed",
        operationPath,
        receiptSha256: D,
      });
    return JSON.stringify({
      status: "fixture_prepared",
      operationPath,
      auditSha256: D,
    });
  };
  const remote = createAcademyP1P7SshRemote({
    executeSsh,
    transferOtp: async () => "123456",
  });
  assert.equal(
    (await remote.reserve({ operationId: operationPath.split("/").at(-1) }))
      .operationPath,
    operationPath,
  );
  assert.equal(
    (await remote.prepare({ operationPath })).operationPath,
    operationPath,
  );
  const challengeId = randomUUID();
  const issued = await remote.issue({ operationPath, challengeId });
  assert.equal(
    await remote.consumeOtp({ operationPath, outputPath: issued.outputPath }),
    "123456",
  );
  assert.equal((await remote.enroll({ operationPath })).status, "ENROLLED");
  assert.equal((await remote.cleanup({ operationPath })).status, "ABSENT");
  assert.ok(calls.every((args) => args[0].startsWith("/opt/")));
  assert.ok(calls.every((args) => !args.includes("-e")));
  assert.doesNotMatch(
    JSON.stringify(calls),
    /adminToken|recipientHmacKeyBase64/,
  );
});

test("SSH adapter rejects foreign operation paths before calls", async () => {
  let calls = 0;
  const remote = createAcademyP1P7SshRemote({
    executeSsh: async () => (calls++, ""),
  });
  await assert.rejects(
    remote.issue({ operationPath: "/tmp/foreign", challengeId: randomUUID() }),
  );
  assert.equal(calls, 0);
});

function child(bytes, { stall = false } = {}) {
  const value = new EventEmitter();
  value.stdout = stall
    ? new Readable({ read() {} })
    : Readable.from([Buffer.from(bytes)]);
  value.kill = () => {
    value.stdout.destroy();
    queueMicrotask(() => value.emit("close", 1));
  };
  if (!stall) queueMicrotask(() => value.emit("close", 0));
  return value;
}
test("secure OTP transfer uses real O_EXCL path and rejects ancestor, oversize, and timeout", async (t) => {
  const root = await mkdtemp("/private/tmp/academy-otp-transfer-test-"),
    parent = `${root}/parent`;
  await mkdir(parent, { mode: 0o700 });
  t.after(() => rm(root, { recursive: true, force: true }));
  const options = {
    parent,
    authorityPaths: [root, parent],
    expectedUid: process.getuid(),
    spawnProcess: () => child("123456\n"),
    deadlineMs: 50,
  };
  assert.equal(
    await secureTransferOtp(
      { handoffPath: `${operationPath}/academy-otp-handoff` },
      options,
    ),
    "123456",
  );
  assert.deepEqual(await readdir(parent), []);
  await assert.rejects(
    secureTransferOtp(
      { handoffPath: `${operationPath}/academy-otp-handoff` },
      {
        ...options,
        afterOpen: async (path) => {
          await rename(path, `${path}.moved`);
          await writeFile(path, "000000\n", { mode: 0o600 });
        },
      },
    ),
  );
  assert.deepEqual(await readdir(parent), []);
  await assert.rejects(
    secureTransferOtp(
      { handoffPath: `${operationPath}/academy-otp-handoff` },
      { ...options, spawnProcess: () => child("1".repeat(17)) },
    ),
  );
  assert.deepEqual(await readdir(parent), []);
  await assert.rejects(
    secureTransferOtp(
      { handoffPath: `${operationPath}/academy-otp-handoff` },
      {
        ...options,
        spawnProcess: () => child("", { stall: true }),
        deadlineMs: 5,
      },
    ),
  );
  assert.deepEqual(await readdir(parent), []);
  const link = `${root}/link`;
  await symlink(parent, link);
  await assert.rejects(
    secureTransferOtp(
      { handoffPath: `${operationPath}/academy-otp-handoff` },
      { ...options, parent: link, authorityPaths: [root, link] },
    ),
  );
  assert.deepEqual(await readdir(parent), []);
});
