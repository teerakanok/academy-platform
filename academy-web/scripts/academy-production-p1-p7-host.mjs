#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

const OP = /^\/root\/identity-synthetic-operations\/academy-p5-[a-f0-9]{18}$/;
const SUBJECT_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPERATION_ID = /^academy-p5-[a-f0-9]{18}$/;
const fail = () => {
  throw new Error("ACADEMY_P1_P7_HOST_REJECTED");
};

function ancestry(path) {
  let p = path;
  while (true) {
    const s = lstatSync(p);
    if (
      !s.isDirectory() ||
      s.isSymbolicLink() ||
      s.uid !== 0 ||
      s.mode & 0o022 ||
      realpathSync(p) !== p
    )
      fail();
    if (p === "/") return;
    p = dirname(p);
  }
}
function readStable(path, maximum, mode = 0o600) {
  ancestry(dirname(path));
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = fstatSync(fd, { bigint: true });
    if (
      !before.isFile() ||
      before.uid !== 0n ||
      (before.mode & 0o777n) !== BigInt(mode) ||
      before.nlink !== 1n ||
      before.size < 2n ||
      before.size > BigInt(maximum)
    )
      fail();
    const bytes = readFileSync(fd);
    const after = fstatSync(fd, { bigint: true }),
      pathState = lstatSync(path, { bigint: true });
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      before.ctimeNs !== after.ctimeNs ||
      after.dev !== pathState.dev ||
      after.ino !== pathState.ino ||
      after.size !== pathState.size
    )
      fail();
    return bytes;
  } finally {
    closeSync(fd);
  }
}

function fixture(operationPath, readOperation = readStable) {
  if (!OP.test(operationPath)) fail();
  const operationId = operationPath.split("/").at(-1),
    value = JSON.parse(
      readOperation(`${operationPath}/prepare-input.json`, 16_384),
    ),
    cleanup = JSON.parse(readOperation(`${operationPath}/cleanup.json`, 16_384));
  if (
    value.operationId !== operationId ||
    value.email !== `${operationId}@synthetic.cyberskills.co.th` ||
    cleanup.schema !== "identity-synthetic-sign-in-cleanup/v2" ||
    cleanup.operationId !== operationId ||
    cleanup.state !== "owned" ||
    !SUBJECT_UUID.test(cleanup.userId ?? "") ||
    cleanup.emailSha256 !==
      createHash("sha256").update(value.email).digest("hex")
  )
    fail();
  return { operationId, email: value.email, subject: cleanup.userId };
}

export function fixtureForTest(operationPath, readOperation) {
  return fixture(operationPath, readOperation);
}

export function databaseForTest(
  mode,
  subject,
  email,
  spawnDatabase = spawnSync,
  operationId = "academy-p5-000000000000000000",
) {
  if (
    !["enroll", "cleanup"].includes(mode) ||
    !SUBJECT_UUID.test(subject) ||
    typeof email !== "string" ||
    !OPERATION_ID.test(operationId)
  )
    fail();
  const sql =
    mode === "enroll"
      ? `begin;
create temp table academy_synthetic_fixture on commit drop as
  select :'academy_subject'::text as subject, :'academy_email'::text as email;
do $$ declare target uuid; begin
  lock table academy.users in share row exclusive mode;
  select u.id into strict target
    from academy.users u join academy_synthetic_fixture f
      on u.subject=f.subject and u.email=f.email;
  insert into academy.course_entitlement(user_id,course_slug,source)
    values(target,'setup-and-environment','grant')
    on conflict(user_id,course_slug) do update
      set source='grant',revoked_at=null,expires_at=null;
end $$;
select count(*) from academy.course_entitlement e
  join academy.users u on u.id=e.user_id
  join academy_synthetic_fixture f on u.subject=f.subject and u.email=f.email
  where e.course_slug='setup-and-environment' and e.source='grant'
    and e.revoked_at is null;
commit;`
      : `begin;
create temp table academy_synthetic_fixture on commit drop as
  select :'academy_subject'::text as subject, :'academy_email'::text as email;
do $$ declare target uuid; matched bigint; begin
  lock table academy.users in share row exclusive mode;
  select count(*) into strict matched
    from academy.users u join academy_synthetic_fixture f
      on u.subject=f.subject and u.email=f.email;
  if matched = 0 then return; end if;
  if matched <> 1 then raise exception 'ACADEMY_FIXTURE_USER_NOT_UNIQUE'; end if;
  select u.id into strict target
    from academy.users u join academy_synthetic_fixture f
      on u.subject=f.subject and u.email=f.email;
  delete from academy.users u using academy_synthetic_fixture f
    where u.id=target and u.subject=f.subject and u.email=f.email;
end $$;
select count(*) from academy.users u
  join academy_synthetic_fixture f on u.subject=f.subject and u.email=f.email;
commit;`;
  const result = spawnDatabase(
    "/usr/bin/docker",
    [
      "exec",
      "-i",
      "supabase-db",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      `academy_subject=${subject}`,
      "-v",
      `academy_email=${email}`,
      "-v",
      "ON_ERROR_STOP=1",
      "-AtX",
      "-q",
    ],
    { input: sql, encoding: "utf8", maxBuffer: 65_536, timeout: 30_000 },
  );
  const expected = mode === "enroll" ? "1" : "0";
  if (result.status !== 0 || result.stdout.trim() !== expected) fail();
  return {
    schema: "academy-synthetic-fixture-db/v1",
    operationId,
    status: mode === "enroll" ? "ENROLLED" : "ABSENT",
    emailSha256: createHash("sha256").update(email).digest("hex"),
};
}

function database(mode, operationPath) {
  const { email, operationId, subject } = fixture(operationPath);
  return databaseForTest(mode, subject, email, spawnSync, operationId);
}

export function main(args) {
  const [mode, operationPath, outputPath] = args;
  if (mode === "verify-authority" && args.length === 1) {
    const files = [
      ["/opt/node-v24.18.0/bin/node", 100_000_000, 0o755],
      [
        "/opt/identity-control/operators/prepare/87be595ca1f8db8a/prepare-synthetic-sign-in-fixture.mjs",
        100_000,
        0o500,
      ],
      [
        "/opt/identity-control/operators/prepare/87be595ca1f8db8a/manifest.json",
        100_000,
        0o400,
      ],
      [
        "/root/identity-reservation-wrapper-authority-b1b346f.json",
        100_000,
        0o600,
      ],
      [process.argv[1], 100_000, 0o755],
    ];
    process.stdout.write(
      `${JSON.stringify(
        files.map(([p, n, m]) =>
          createHash("sha256")
            .update(readStable(p, n, m))
            .digest("hex"),
        ),
      )}\n`,
    );
    return;
  }
  if (!OP.test(operationPath)) fail();
  if (mode === "stage-otp") {
    if (outputPath !== `${operationPath}/issue-output.json`) fail();
    const value = JSON.parse(readStable(outputPath, 16_384));
    if (!/^\d{6}$/.test(value.code ?? "")) fail();
    const handoff = `${operationPath}/academy-otp-handoff`;
    const bytes = Buffer.from(`${value.code}\n`);
    try {
      const fd = openSync(
        handoff,
        constants.O_WRONLY |
          constants.O_CREAT |
          constants.O_EXCL |
          constants.O_NOFOLLOW,
        0o600,
      );
      try {
        writeFileSync(fd, bytes);
      } finally {
        closeSync(fd);
      }
    } catch (error) {
      if (error?.code !== "EEXIST" || !readStable(handoff, 32).equals(bytes))
        fail();
    }
    process.stdout.write(
      `${JSON.stringify({ status: "STAGED", handoffPath: handoff })}\n`,
    );
    return;
  }
  if (mode === "clear-otp") {
    if (outputPath !== `${operationPath}/academy-otp-handoff`) fail();
    try {
      readStable(outputPath, 32);
    } catch (error) {
      if (error?.code === "ENOENT") {
        process.stdout.write(`${JSON.stringify({ status: "ABSENT" })}\n`);
        return;
      }
      throw error;
    }
    unlinkSync(outputPath);
    process.stdout.write(`${JSON.stringify({ status: "ABSENT" })}\n`);
    return;
  }
  if (outputPath !== undefined || !["enroll", "cleanup"].includes(mode)) fail();
  process.stdout.write(`${JSON.stringify(database(mode, operationPath))}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main(process.argv.slice(2));
  } catch {
    process.stderr.write("ACADEMY_P1_P7_HOST_REJECTED\n");
    process.exitCode = 1;
  }
}
