import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, mkdtemp, open, rmdir, unlink } from "node:fs/promises";
import { promisify } from "node:util";

const run = promisify(execFile);
const HOST = "root@ssh-db.cyberskills.co.th";
const WRAPPER =
  "/opt/identity-control/operators/prepare/87be595ca1f8db8a/prepare-synthetic-sign-in-fixture.mjs";
const NODE = "/opt/node-v24.18.0/bin/node";
const HOST_HELPER =
  "/opt/academy/production-operations/academy-production-p1-p7-host.mjs";
const EXPECTED = Object.freeze({
  node: "41a74efb34cbde5c7632cdac0cf8bd1a14d0b8d73dc1e82755014d9a9ce70f5c",
  wrapper: "87be595ca1f8db8a218bc14dec055d66b07307017b5cfc812a721f490cc320c1",
  manifest: "443b9f7c80f7e89e649922807692b9657c93737bc17b809bd46d2631a6eb1571",
  authority: "b0a1897048e9881a0789204619de9c770bc5258904ba597ab7afc026998cb01e",
  hostHelper:
    "221f2831c71f108128b23992358aa61fde9daca213cbd0c5a1c157180e55544f",
});
const OP = /^\/root\/identity-synthetic-operations\/academy-p5-[a-f0-9]{18}$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA = /^[a-f0-9]{64}$/;
const fail = () => {
  throw new Error("ACADEMY_P1_P7_SSH_REJECTED");
};

async function ssh(args, options = {}) {
  const result = await run(
    "/usr/bin/ssh",
    ["-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", HOST, ...args],
    {
      encoding: "utf8",
      timeout: 30_000,
      maxBuffer: 65_536,
      env: { HOME: process.env.HOME, PATH: "/usr/bin:/bin" },
      ...options,
    },
  );
  return result.stdout;
}
async function verifyAuthority() {
  const hashes = JSON.parse(await ssh([NODE, HOST_HELPER, "verify-authority"]));
  if (
    JSON.stringify(hashes) !==
    JSON.stringify([
      EXPECTED.node,
      EXPECTED.wrapper,
      EXPECTED.manifest,
      EXPECTED.authority,
      EXPECTED.hostHelper,
    ])
  )
    fail();
}
async function wrapper(args) {
  await verifyAuthority();
  const value = JSON.parse(await ssh([NODE, WRAPPER, ...args]));
  if (!OP.test(value?.operationPath)) fail();
  return value;
}

export function createAcademyP1P7SshRemote({
  executeSsh = ssh,
  transferOtp,
} = {}) {
  const invokeWrapper = async (args) => {
    if (executeSsh === ssh) return wrapper(args);
    const value = JSON.parse(await executeSsh([NODE, WRAPPER, ...args]));
    if (!OP.test(value?.operationPath)) fail();
    return value;
  };
  return {
    reserve: async ({ operationId }) => invokeWrapper(["reserve", operationId]),
    prepare: async ({ operationPath }) =>
      invokeWrapper(["prepare", operationPath]),
    issue: async ({ operationPath, challengeId }) => {
      if (!OP.test(operationPath) || !UUID.test(challengeId)) fail();
      const value = await invokeWrapper(["issue", operationPath, challengeId]);
      if (value.status !== "code_issued" || !SHA.test(value.auditSha256))
        fail();
      return value;
    },
    consumeOtp: async ({ operationPath, outputPath }) => {
      if (
        !OP.test(operationPath) ||
        outputPath !== `${operationPath}/issue-output.json`
      )
        fail();
      const staged = JSON.parse(
        await invokeHost(["stage-otp", operationPath, outputPath]),
      );
      if (
        staged.status !== "STAGED" ||
        staged.handoffPath !== `${operationPath}/academy-otp-handoff` ||
        Object.keys(staged).sort().join(",") !== "handoffPath,status"
      )
        fail();
      const code = transferOtp
        ? await transferOtp(staged)
        : await secureTransferOtp(staged);
      await invokeHost(["clear-otp", operationPath, staged.handoffPath]);
      if (!/^\d{6}$/.test(code)) fail();
      return code;
    },
    enroll: async ({ operationPath }) =>
      db(invokeHost, "enroll", operationPath),
    cleanup: async ({ operationPath }) => {
      const [academyResult, identityResult, otpResult] =
        await Promise.allSettled([
          db(invokeHost, "cleanup", operationPath),
          invokeWrapper(["cleanup", operationPath]),
          invokeHost([
            "clear-otp",
            operationPath,
            `${operationPath}/academy-otp-handoff`,
          ]),
        ]);
      if (
        academyResult.status !== "fulfilled" ||
        identityResult.status !== "fulfilled" ||
        otpResult.status !== "fulfilled"
      )
        fail();
      const academy = academyResult.value,
        identity = identityResult.value;
      if (
        !["removed", "already_absent"].includes(identity.status) ||
        !SHA.test(identity.receiptSha256)
      )
        fail();
      return {
        status: "ABSENT",
        academyReceiptSha256: academy.receiptSha256,
        identityReceiptSha256: identity.receiptSha256,
      };
    },
  };
  async function invokeHost(args) {
    if (executeSsh === ssh) await verifyAuthority();
    return executeSsh([NODE, HOST_HELPER, ...args]);
  }
}
export async function secureTransferOtp(staged, options = {}) {
  const parent =
      options.parent ??
      "/private/var/root/academy-production-operations/otp-transfer",
    authorityPaths = options.authorityPaths ?? [
      "/private",
      "/private/var",
      "/private/var/root",
      "/private/var/root/academy-production-operations",
      parent,
    ],
    expectedUid = options.expectedUid ?? 0,
    spawnProcess = options.spawnProcess ?? spawn,
    deadlineMs = options.deadlineMs ?? 30_000;
  await mkdir(parent, { recursive: true, mode: 0o700 });
  for (const path of authorityPaths) {
    const s = await lstat(path);
    if (
      !s.isDirectory() ||
      s.isSymbolicLink() ||
      s.uid !== expectedUid ||
      s.mode & 0o022
    )
      fail();
  }
  const directory = await mkdtemp(`${parent}/transfer-`),
    local = `${directory}/otp`;
  const ds = await lstat(directory);
  if (
    !ds.isDirectory() ||
    ds.isSymbolicLink() ||
    ds.uid !== expectedUid ||
    (ds.mode & 0o777) !== 0o700
  )
    fail();
  const h = await open(
    local,
    constants.O_RDWR |
      constants.O_CREAT |
      constants.O_EXCL |
      constants.O_NOFOLLOW,
    0o600,
  );
  try {
    const before = await h.stat({ bigint: true });
    if (before.nlink !== 1n) fail();
    await unlink(local);
    const detached = await h.stat({ bigint: true });
    if (
      detached.dev !== before.dev ||
      detached.ino !== before.ino ||
      detached.nlink !== 0n
    )
      fail();
    await options.afterOpen?.(local);
    const child = spawnProcess(
      "/usr/bin/ssh",
      [
        "-o",
        "BatchMode=yes",
        "-o",
        "StrictHostKeyChecking=yes",
        HOST,
        "/bin/cat",
        staged.handoffPath,
      ],
      {
        stdio: ["ignore", "pipe", "ignore"],
        env: { HOME: process.env.HOME, PATH: "/usr/bin:/bin" },
      },
    );
    const completion = new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    });
    const timer = setTimeout(() => child.kill("SIGKILL"), deadlineMs);
    let size = 0;
    for await (const chunk of child.stdout) {
      size += chunk.length;
      if (size > 16) {
        child.kill("SIGKILL");
        fail();
      }
      await h.write(chunk);
    }
    const status = await completion.finally(() => clearTimeout(timer));
    if (status !== 0) fail();
    await h.sync();
    const s = await h.stat({ bigint: true });
    if (
      !s.isFile() ||
      s.uid !== BigInt(expectedUid) ||
      (s.mode & 0o777n) !== 0o600n ||
      s.nlink !== 0n ||
      s.size > 16n ||
      before.dev !== s.dev ||
      before.ino !== s.ino
    )
      fail();
    const buffer = Buffer.alloc(Number(s.size));
    await h.read(buffer, 0, buffer.length, 0);
    return buffer.toString().trim();
  } finally {
    await h.close();
    await unlink(local).catch(() => {});
    await rmdir(directory).catch(() => {});
  }
}
async function db(invokeHost, mode, operationPath) {
  if (!OP.test(operationPath)) fail();
  const value = JSON.parse(await invokeHost([mode, operationPath]));
  if (value.status !== (mode === "enroll" ? "ENROLLED" : "ABSENT")) fail();
  return {
    ...value,
    receiptSha256: createHash("sha256")
      .update(`${JSON.stringify(value)}\n`)
      .digest("hex"),
  };
}
