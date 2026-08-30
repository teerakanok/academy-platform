#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { IDENTITY_SYNTHETIC_AUTHORITY } from "./academy-production-p1-p7-runner.mjs";

import { executeAcademyCloudflareHelper } from "./academy-production-cloudflare-helper.mjs";
import { executeAcademyDatabaseOperation } from "./academy-production-database-adapter.mjs";

const SHA = /^[a-f0-9]{64}$/;
const REV = /^[a-f0-9]{40}$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const fail = () => {
  throw new Error("ACADEMY_PRODUCTION_OPERATION_REJECTED");
};
const receipt = (body) => ({
  ...body,
  receiptSha256: createHash("sha256")
    .update(`${JSON.stringify(body)}\n`)
    .digest("hex"),
});
function runProtectedHook({ executable, args }) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(executable, args, {
      stdio: ["ignore", "pipe", "ignore"],
      env: {
        HOME: process.env.HOME,
        LANG: "C",
        LC_ALL: "C",
        PATH: "/usr/bin:/bin",
      },
      shell: false,
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
      if (output.length > 1024 * 1024) child.kill("SIGKILL");
    });
    child.once("error", reject);
    child.once("close", (status) => {
      if (status !== 0) return reject(Error("HOOK_FAILED"));
      try {
        resolvePromise(JSON.parse(output));
      } catch {
        reject(Error("HOOK_INVALID"));
      }
    });
  });
}

function flags(args) {
  if (args.length % 2) fail();
  const out = Object.create(null);
  for (let i = 0; i < args.length; i += 2) {
    if (!/^--[a-z][a-z0-9-]*$/.test(args[i]) || args[i] in out) fail();
    out[args[i]] = args[i + 1];
  }
  return out;
}
function common(v) {
  if (
    !UUID.test(v["--authority"]) ||
    !REV.test(v["--release"]) ||
    !SHA.test(v["--readiness"]) ||
    !Number.isFinite(Date.parse(v["--valid-until"])) ||
    Date.now() >= Date.parse(v["--valid-until"])
  )
    fail();
}
async function protectedHook(path) {
  const target = resolve(path);
  if (target !== path || (await realpath(target)) !== target) fail();
  const h = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const s = await h.stat();
    if (
      !s.isFile() ||
      s.nlink !== 1 ||
      s.uid !== process.getuid() ||
      s.mode & 0o077 ||
      !(s.mode & 0o111) ||
      s.size < 1 ||
      s.size > 16 * 1024 * 1024
    )
      fail();
    const hash = createHash("sha256");
    for await (const c of h.createReadStream()) hash.update(c);
    return hash.digest("hex");
  } finally {
    await h.close();
  }
}

export async function executeAcademyProductionOperation(
  args,
  {
    database = executeAcademyDatabaseOperation,
    cloudflare = executeAcademyCloudflareHelper,
    runHook = runProtectedHook,
  } = {},
) {
  const v = flags(args);
  common(v);
  const op = v["--operation"];
  const shared = {
    authorityId: v["--authority"],
    releaseRevision: v["--release"],
    identityReadinessSha256: v["--readiness"],
    validUntil: v["--valid-until"],
  };
  if (op === "backupRestore" || op === "applyMigrations") {
    if (!v["--database-config"]) fail();
    const operationValue =
      op === "backupRestore"
        ? {
            kind: "backupRestore",
            identityRestoreReceiptSha256: v["--restore"],
          }
        : {
            kind: "applyMigrations",
            ordered: String(v["--ordered"]).split(","),
          };
    return database({
      configPath: v["--database-config"],
      input: { ...shared, operationValue },
    });
  }
  const cloudflareMap = {
    inspectRecovery: [
      "inspect",
      "--mode",
      v["--mode"],
      "--journal",
      v["--journal"],
    ],
    uploadCandidate: [
      "upload",
      "--source",
      v["--source"],
      "--traffic",
      v["--traffic"],
    ],
    activateTraffic: [
      "activate",
      "--expected-deployment",
      v["--expected-deployment"],
      "--expected-version",
      v["--expected-version"],
      "--candidate",
      v["--candidate"],
      "--traffic",
      v["--traffic"],
    ],
    rollbackTraffic: [
      "rollback",
      "--expected-deployment",
      v["--expected-deployment"],
      "--expected-version",
      v["--expected-version"],
      "--target",
      v["--target"],
      "--prior",
      v["--prior"],
    ],
    checkResidue: [
      "residue",
      "--deployment",
      v["--deployment"],
      "--version",
      v["--version"],
    ],
  };
  if (cloudflareMap[op]) {
    const [kind, ...tail] = cloudflareMap[op];
    return cloudflare([
      "--authority",
      shared.authorityId,
      "--release",
      shared.releaseRevision,
      "--readiness",
      shared.identityReadinessSha256,
      "--valid-until",
      shared.validUntil,
      "--operation",
      kind,
      ...tail,
    ]);
  }
  if (op === "smokeP1P7") {
    if (
      !runHook ||
      !v["--hook"] ||
      !SHA.test(v["--hook-sha256"]) ||
      (await protectedHook(v["--hook"])) !== v["--hook-sha256"] ||
      !UUID.test(v["--deployment"]) ||
      !UUID.test(v["--version"]) ||
      !SHA.test(v["--config"])
    )
      fail();
    let value;
    try {
      value = await runHook({
        executable: v["--hook"],
        args: [
          "--authority",
          shared.authorityId,
          "--release",
          shared.releaseRevision,
          "--readiness",
          shared.identityReadinessSha256,
          "--valid-until",
          shared.validUntil,
          "--deployment",
          v["--deployment"],
          "--version",
          v["--version"],
          "--config",
          v["--config"],
        ],
      });
    } catch {
      fail();
    }
    if (
      JSON.stringify(value?.checks) !==
        JSON.stringify(["P1", "P2", "P3", "P4", "P5", "P6", "P7"]) ||
      value.status !== "PASS" ||
      value.deploymentId !== v["--deployment"] ||
      value.versionId !== v["--version"] ||
      value.configuredNamesSha256 !== v["--config"] ||
      value.authorityId !== shared.authorityId ||
      value.releaseRevision !== shared.releaseRevision ||
      value.identityReadinessSha256 !== shared.identityReadinessSha256 ||
      value.validUntil !== shared.validUntil ||
      value.cleanup?.status !== "ABSENT" ||
      !SHA.test(value.cleanup.academyReceiptSha256) ||
      !SHA.test(value.cleanup.identityReceiptSha256) ||
      !SHA.test(value.receiptSha256) ||
      JSON.stringify(value.identitySyntheticAuthority) !==
        JSON.stringify(IDENTITY_SYNTHETIC_AUTHORITY)
    )
      fail();
    return receipt({
      status: "PASS",
      deploymentId: value.deploymentId,
      versionId: value.versionId,
      configuredNamesSha256: value.configuredNamesSha256,
      checks: value.checks,
      cleanup: value.cleanup,
      runnerReceiptSha256: value.receiptSha256,
      identitySyntheticAuthority: value.identitySyntheticAuthority,
    });
  }
  fail();
}

if (import.meta.url === `file://${process.argv[1]}`)
  executeAcademyProductionOperation(process.argv.slice(2))
    .then((v) => process.stdout.write(`${JSON.stringify(v)}\n`))
    .catch(() => {
      process.stderr.write("ACADEMY_PRODUCTION_OPERATION_REJECTED\n");
      process.exitCode = 1;
    });
