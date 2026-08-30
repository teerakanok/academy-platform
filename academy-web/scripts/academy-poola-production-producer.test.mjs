import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import {
  remoteCommand,
  remoteCommandForTest,
  runAcademyPoolAProducer,
  sshArguments,
} from "./academy-poola-production-producer.mjs";

const D = "a".repeat(64),
  R = "b".repeat(40),
  U = "2099-08-29T23:59:59Z",
  IDS = ["0021", "0022", "0023", "0024", "0025", "0026", "0027"];
const digest = (b) => createHash("sha256").update(b).digest("hex");
async function fixture(t) {
  const root = await mkdtemp("/private/tmp/academy-poola-producer-");
  t.after(() => rm(root, { recursive: true, force: true }));
  const receipt = join(root, "receipt.json"),
    authority = randomUUID();
  const common = [
    "--authority",
    authority,
    "--release",
    R,
    "--identity-readiness",
    D,
    "--valid-until",
    U,
    "--pool",
    "Pool A",
    "--database",
    "postgres",
    "--schema",
    "academy",
    "--receipt",
    receipt,
  ];
  return { root, receipt, authority, common };
}
const backupValue = (f) => ({
  schema: "academy-poola-backup-restore/v1",
  status: "MATCH",
  operation: "academy-backup-restore",
  binding: {
    authorityId: f.authority,
    releaseRevision: R,
    identityReadinessSha256: D,
    validUntil: U,
  },
  target: { pool: "Pool A", database: "postgres", schema: "academy" },
  identityRestoreReceiptSha256: D,
  checks: [
    { name: "isolated-restore", status: "MATCH" },
    { name: "academy-schema-only", status: "MATCH" },
    { name: "ownership-grants", status: "MATCH" },
    { name: "cleanup", status: "MATCH" },
  ],
  schemaAuthority: { sourceSha256: D, restoredSha256: D, status: "MATCH" },
  rollback: { status: "READY", artifactSha256: D },
});

test("publishes canonical protected backup receipt only after isolated restore MATCH", async (t) => {
  const f = await fixture(t);
  const value = await runAcademyPoolAProducer(
    [...f.common, "--identity-restore", D],
    {
      remote: async (p) => {
        assert.equal(p.operation, "backup");
        assert.equal(p.authorityId, f.authority);
        assert.equal(p.releaseRevision, R);
        assert.equal(p.identityReadinessSha256, D);
        assert.equal(p.identityRestoreReceiptSha256, D);
        assert.match(p.capturedAt, /^\d{4}-/);
        return {
          status: "MATCH",
          artifactSha256: D,
          bytes: 42,
          objectCount: 8,
          cleanupVerified: true,
          sourceSchemaSha256: D,
          restoredSchemaSha256: D,
        };
      },
    },
  );
  assert.equal(value.status, "MATCH");
  assert.equal((await stat(f.receipt)).mode & 0o777, 0o600);
  assert.equal(await readFile(f.receipt, "utf8"), `${JSON.stringify(value)}\n`);
});

test("publishes v2 exact-byte transaction receipt bound to backup and ordered hashes", async (t) => {
  const f = await fixture(t);
  const backup = join(f.root, "backup.json"),
    prior = backupValue(f);
  await writeFile(backup, `${JSON.stringify(prior)}\n`, { mode: 0o600 });
  const specs = [];
  for (const id of IDS) {
    const path = join(f.root, `${id}.sql`),
      body = `select '${id}';\n`;
    await writeFile(path, body, { mode: 0o600 });
    specs.push(["--migration", `${id}:${path}:${digest(body)}`]);
  }
  const value = await runAcademyPoolAProducer(
    [
      ...f.common,
      "--ordered",
      IDS.join(","),
      "--backup-receipt",
      backup,
      ...specs.flat(),
    ],
    {
      remote: async (p) => {
        assert.match(p.sql, /BEGIN|select/);
        return { status: "PASS", tableCount: 8 };
      },
    },
  );
  assert.equal(value.schema, "academy-poola-migrations/v2");
  assert.equal(
    value.ledgerSemantics,
    "exact-bytes-executed-in-this-transaction",
  );
  assert.deepEqual(value.transaction, {
    atomic: true,
    onErrorStop: true,
    status: "COMMITTED",
  });
  assert.equal(
    value.rollback.backupReceiptSha256,
    digest(`${JSON.stringify(prior)}\n`),
  );
});

test("remote failure and migration digest drift publish no receipt", async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    runAcademyPoolAProducer([...f.common, "--identity-restore", D], {
      remote: async () => {
        throw Error("private");
      },
    }),
  );
  await assert.rejects(readFile(f.receipt));
  const path = join(f.root, "0021.sql");
  await writeFile(path, "select 1;\n", { mode: 0o600 });
  const specs = IDS.flatMap((id) => ["--migration", `${id}:${path}:${D}`]);
  await assert.rejects(
    runAcademyPoolAProducer(
      [
        ...f.common,
        "--ordered",
        IDS.join(","),
        "--backup-receipt",
        path,
        ...specs,
      ],
      {
        remote: async () => {
          throw Error("must not call");
        },
      },
    ),
  );
  await assert.rejects(readFile(f.receipt));
});

test("remote boundary retains cleanup and one atomic migration transaction", async () => {
  const source = await readFile(
    new URL("./academy-poola-production-producer.mjs", import.meta.url),
    "utf8",
  );
  assert.match(source, /finally:/);
  assert.match(source, /dropdb/);
  assert.match(source, /BEGIN;\\n/);
  assert.match(source, /COMMIT;\\n/);
  assert.match(source, /ON_ERROR_STOP=1/);
  assert.doesNotMatch(source, /SERVICE_ROLE|JWT_SECRET|ANON_KEY/);
  assert.match(
    remoteCommand(),
    /^\/usr\/bin\/python3 -c '[A-Za-z0-9+\/=();." ]+'$/,
  );
  assert.deepEqual(sshArguments().slice(0, 5), [
    "-o",
    "BatchMode=yes",
    "-o",
    "StrictHostKeyChecking=yes",
    "root@ssh-db.cyberskills.co.th",
  ]);
  assert.equal(sshArguments()[5], remoteCommand());
});

test("invalid backup receipt and noncanonical expiry cause zero remote calls", async (t) => {
  const f = await fixture(t),
    backup = join(f.root, "backup.json");
  await writeFile(
    backup,
    `${JSON.stringify({ ...backupValue(f), status: "UNKNOWN" })}\n`,
    { mode: 0o600 },
  );
  let calls = 0;
  await assert.rejects(
    runAcademyPoolAProducer(
      [
        ...f.common,
        "--ordered",
        IDS.join(","),
        "--backup-receipt",
        backup,
        ...IDS.flatMap((id) => ["--migration", `${id}:${backup}:${D}`]),
      ],
      {
        remote: async () => {
          calls++;
          return {};
        },
      },
    ),
  );
  assert.equal(calls, 0);
  const args = [...f.common];
  args[args.indexOf(U)] = "invalid";
  await assert.rejects(
    runAcademyPoolAProducer([...args, "--identity-restore", D], {
      remote: async () => {
        calls++;
        return {};
      },
    }),
  );
  assert.equal(calls, 0);
});

test("decoded remote program proves restore and suppresses MATCH when cleanup fails", async (t) => {
  const f = await fixture(t),
    bin = join(f.root, "bin"),
    workspace = join(f.root, "remote");
  await mkdir(bin);
  const docker = join(bin, "docker");
  await writeFile(
    docker,
    `#!/bin/sh
case "$*" in
  *" pg_dump "*"--schema-only"*) case "$*" in *"academy_restore_"*) [ "\${FAKE_SCHEMA_MISMATCH:-0}" = 1 ] && printf DRIFT || printf SCHEMA ;; *) printf SCHEMA ;; esac ;;
  *" pg_dump "*) printf x >> "\${FAKE_DUMP_LOG}"; printf DUMP ;;
  *" pg_restore --list"*) cat >/dev/null ;;
  *" pg_restore "*) cat >/dev/null ;;
  *" dropdb "*) [ "\${FAKE_DROP_FAIL:-0}" = 1 ] && exit 9 || exit 0 ;;
  *" createdb "*) exit 0 ;;
  *" -d academy_restore_"*) printf '8|0|0|0|0|0|0\\n' ;;
  *" from pg_database "*) printf '0\\n' ;;
  *) exit 7 ;;
esac
`,
  );
  await chmod(docker, 0o755);
  const dumpLog = join(f.root, "dump.log");
  const execute = (
    dropFails,
    schemaMismatch = false,
    authorityId = f.authority,
  ) =>
    new Promise((resolve) => {
      const child = spawn("/bin/sh", ["-c", remoteCommandForTest(workspace)], {
        env: {
          PATH: `${bin}:/usr/bin:/bin`,
          FAKE_DROP_FAIL: dropFails ? "1" : "0",
          FAKE_SCHEMA_MISMATCH: schemaMismatch ? "1" : "0",
          FAKE_DUMP_LOG: dumpLog,
        },
        stdio: ["pipe", "pipe", "pipe"],
      });
      let stdout = "",
        stderr = "";
      child.stdout.on("data", (chunk) => (stdout += chunk));
      child.stderr.on("data", (chunk) => (stderr += chunk));
      child.on("close", (status) => resolve({ status, stdout, stderr }));
      child.stdin.end(
        JSON.stringify({
          operation: "backup",
          authorityId,
          releaseRevision: R,
          identityReadinessSha256: D,
          identityRestoreReceiptSha256: D,
          capturedAt: "2026-08-30T00:00:00.000Z",
        }),
      );
    });
  const success = await execute(false);
  assert.equal(success.status, 0, success.stderr);
  assert.equal(JSON.parse(success.stdout).cleanupVerified, true);
  const sidecar = join(workspace, f.authority, "academy.dump.sha256");
  await rm(sidecar);
  const recovered = await execute(false);
  assert.equal(recovered.status, 0, recovered.stderr);
  assert.equal(await readFile(dumpLog, "utf8"), "xx");
  const mismatch = await execute(false, true, randomUUID());
  assert.notEqual(mismatch.status, 0);
  assert.equal(mismatch.stdout, "");
  const failure = await execute(true);
  assert.notEqual(failure.status, 0);
  assert.equal(failure.stdout, "");
});
