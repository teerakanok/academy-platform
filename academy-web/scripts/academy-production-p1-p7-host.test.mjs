import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  databaseForTest,
  fixtureForTest,
  main,
} from "./academy-production-p1-p7-host.mjs";

test("host helper rejects foreign paths before protected reads or database calls", () => {
  assert.throws(() => main(["enroll", "/tmp/foreign"]), /REJECTED/);
  assert.throws(
    () => main(["consume-otp", "/tmp/foreign", "/tmp/output"]),
    /REJECTED/,
  );
});

test("host helper uses stable no-follow reads and argv/stdin database execution", async () => {
  const source = await readFile(
    new URL("./academy-production-p1-p7-host.mjs", import.meta.url),
    "utf8",
  );
  assert.match(source, /O_NOFOLLOW/);
  assert.match(source, /before\.dev !== after\.dev/);
  assert.match(source, /"\/usr\/bin\/docker"/);
  assert.match(source, /input: transaction\(terminal\)/);
  assert.doesNotMatch(source, /execSync|shell\s*:/);
  assert.doesNotMatch(source, /console\./);
});

test("database values bind as text-compatible psql variables outside the do block", async () => {
  const subject = "11111111-2222-5333-8444-555555555555";
  const email = "quote'; drop fixture;--@synthetic.example";
  const operationId = "academy-p5-0123456789abcdef12";
  const calls = [];
  const spawnDatabase = (file, argv, options) => {
    calls.push({ file, argv, options });
    return {
      status: 0,
      stdout: "1\n",
    };
  };
  const result = databaseForTest(
    "enroll",
    subject,
    email,
    spawnDatabase,
    operationId,
  );
  assert.deepEqual(result, {
    schema: "academy-synthetic-fixture-db/v1",
    operationId,
    status: "ENROLLED",
    emailSha256:
      "683c83a07e5822e2e24ad814680cc454e97951f066cd717afd9e925d231a73a2",
  });
  assert.equal(calls.length, 2);
  const [{ argv, options }, committed] = calls;
  const variableValues = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "-v") variableValues.push(argv[index + 1]);
  }
  assert.ok(variableValues.includes(`academy_subject=${subject}`));
  assert.ok(variableValues.includes(`academy_email=${email}`));
  const sql = options.input;
  assert.match(sql, /:'academy_subject'/);
  assert.match(sql, /:'academy_email'/);
  assert.match(sql, /:'academy_subject'::text/);
  assert.doesNotMatch(sql, /:'academy_subject'::uuid/);
  assert.match(sql, /select .* into strict /);
  assert.match(sql, /insert into academy\.course_entitlement/);
  assert.doesNotMatch(sql, /drop fixture/);
  assert.doesNotMatch(sql, /quote';/);
  assert.ok(argv.includes("-q"));
  assert.match(sql, /set local lock_timeout = '2s';/);
  assert.match(sql, /set local statement_timeout = '8s';/);
  assert.match(sql, /rollback;$/);
  assert.match(committed.options.input, /commit;$/);
  assert.equal(
    sql.replace(/rollback;$/, ""),
    committed.options.input.replace(/commit;$/, ""),
  );
  assert.deepEqual(committed.argv, argv);
  assert.equal(options.timeout, 12_000);
  assert.equal(committed.options.timeout, 12_000);
  assert.match(
    await readFile(
      new URL("./academy-production-p1-p7-host.mjs", import.meta.url),
      "utf8",
    ),
    /databaseForTest\(mode, subject, email, spawnSync, operationId\)/,
  );
});

test("failed database rehearsal rejects before any commit invocation", () => {
  const calls = [];
  assert.throws(
    () =>
      databaseForTest(
        "enroll",
        "11111111-2222-5333-8444-555555555555",
        "safe@example.test",
        (file, argv, options) => {
          calls.push({ file, argv, options });
          return { status: 0, stdout: "0\n" };
        },
      ),
    /REJECTED/,
  );
  assert.equal(calls.length, 1);
  assert.match(calls[0].options.input, /rollback;$/);
  assert.doesNotMatch(calls[0].options.input, /commit;/);
});

test("cleanup rejects duplicate fixture users before its final commit", () => {
  let input = "";
  databaseForTest(
    "cleanup",
    "11111111-2222-5333-8444-555555555555",
    "safe@example.test",
    (file, argv, options) => {
      input = options.input;
      return { status: 0, stdout: "0\n" };
    },
  );
  assert.match(input, /matched <> 1/);
  assert.match(input, /matched = 0 then return/);
  assert.match(input, /delete from academy\.users u using academy_synthetic_fixture f\s+where u\.id=target and u\.subject=f\.subject and u\.email=f\.email/);
});

test("protected fixture boundary rejects malformed identity before database", () => {
  const operationPath =
    "/root/identity-synthetic-operations/academy-p5-0123456789abcdef12";
  const operationId = operationPath.split("/").at(-1);
  const files = new Map([
    [
      `${operationPath}/prepare-input.json`,
      JSON.stringify({ operationId, email: `quote'; --@example.test` }),
    ],
    [
      `${operationPath}/cleanup.json`,
      JSON.stringify({
        schema: "identity-synthetic-sign-in-cleanup/v2",
        operationId,
        state: "owned",
        userId: "11111111-2222-5333-8444-555555555555",
        emailSha256:
          "0000000000000000000000000000000000000000000000000000000000000000",
      }),
    ],
  ]);
  assert.throws(
    () =>
      fixtureForTest(operationPath, (path) => {
        if (!files.has(path)) throw new Error("missing");
        return Buffer.from(files.get(path));
      }),
    /REJECTED/,
  );
});

test("database result must be the exact expected row count", () => {
  for (const stdout of ["0", "2"]) {
    assert.throws(() =>
      databaseForTest("enroll", "11111111-2222-5333-8444-555555555555", "safe@example.test", () => ({
        status: 0,
        stdout,
      })),
    );
  }
  assert.doesNotThrow(() =>
    databaseForTest("cleanup", "11111111-2222-5333-8444-555555555555", "safe@example.test", () => ({
      status: 0,
      stdout: "0\n",
    })),
  );
});

test("bound fixture SQL proves enrollment, rollback, cleanup, and lock deadline on PostgreSQL", async (t) => {
  const psql = process.env.ACADEMY_SEC019_PSQL;
  const databaseUrl = process.env.ACADEMY_SEC019_DATABASE_URL;
  if (!psql || !databaseUrl)
    t.skip("real PostgreSQL fixture unavailable: set ACADEMY_SEC019_PSQL and ACADEMY_SEC019_DATABASE_URL");
  if (!psql || !databaseUrl) return;
  const disposable = new URL(databaseUrl);
  if (disposable.pathname !== "/academy_sec019_disposable") assert.fail("fixture must target academy_sec019_disposable");
  const capture = (mode) => {
    const transactions = [];
    const variables = [];
    databaseForTest(
      mode,
      "11111111-2222-5333-8444-555555555555",
      "quote'; drop fixture;--@synthetic.example",
      (file, argv, options) => {
        transactions.push(options.input);
        for (let index = 0; index < argv.length; index += 1)
          if (argv[index] === "-v") variables.push(argv[index + 1]);
        return { status: 0, stdout: mode === "enroll" ? "1\n" : "0\n" };
      },
    );
    return {
      rehearsal: transactions[0],
      commit: transactions[1],
      variables: variables.slice(0, variables.length / 2),
    };
  };
  const run = (sql, variables = []) => {
    const result = spawnSync(
      psql,
      ["-d", databaseUrl, ...variables.flatMap((value) => ["-v", value]), "-v", "ON_ERROR_STOP=1", "-AtX", "-q"],
      { input: sql, encoding: "utf8", timeout: 30000, maxBuffer: 65536 },
    );
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  const enroll = capture("enroll");
  const cleanup = capture("cleanup");
  run(`create schema academy;
create table academy.users(id uuid primary key default gen_random_uuid(),issuer text not null,subject text not null,email text not null);
create unique index users_issuer_subject_unique on academy.users(issuer,subject);
create table academy.course_entitlement(user_id uuid not null references academy.users(id) on delete cascade,course_slug text not null,source text not null,revoked_at timestamptz,expires_at timestamptz,primary key(user_id,course_slug));`);
  t.after(() => run("drop schema academy cascade;"));
  assert.notEqual(
    spawnSync(psql, ["-d", databaseUrl, ...enroll.variables.flatMap((value) => ["-v", value]), "-v", "ON_ERROR_STOP=1", "-AtX", "-q"], {
      input: enroll.commit,
      encoding: "utf8",
      timeout: 30000,
      maxBuffer: 65536,
    }).status,
    0,
  );
  assert.equal(run("select count(*) from academy.users;"), "0\n");
  run(`insert into academy.users(issuer,subject,email) values ('https://issuer.test','11111111-2222-5333-8444-555555555555','other@example.test'),('https://issuer-other.test','11111111-2222-5333-8444-555555555555','quote''; drop fixture;--@synthetic.example');`);
  assert.equal(run(enroll.rehearsal, enroll.variables), "1\n");
  assert.equal(run(`select count(*) from academy.course_entitlement where course_slug='setup-and-environment';`), "0\n");
  assert.equal(run(enroll.commit, enroll.variables), "1\n");
  assert.equal(run(enroll.commit, enroll.variables), "1\n");
  assert.equal(run(`select count(*) from academy.course_entitlement where course_slug='setup-and-environment';`), "1\n");
  assert.equal(run(cleanup.rehearsal, cleanup.variables), "0\n");
  assert.equal(run("select count(*) from academy.users where email=$$quote'; drop fixture;--@synthetic.example$$;"), "1\n");
  assert.equal(run(cleanup.commit, cleanup.variables), "0\n");
  assert.equal(run(cleanup.commit, cleanup.variables), "0\n");
  assert.equal(run("select count(*) from academy.users where email='other@example.test';"), "1\n");
  run(`insert into academy.users(issuer,subject,email) values ('https://issuer-duplicate.test','11111111-2222-5333-8444-555555555555','quote''; drop fixture;--@synthetic.example'),('https://issuer-duplicate-other.test','11111111-2222-5333-8444-555555555555','quote''; drop fixture;--@synthetic.example');`);
  for (const { commit, variables } of [enroll, cleanup]) {
    const result = spawnSync(psql, ["-d", databaseUrl, ...variables.flatMap((value) => ["-v", value]), "-v", "ON_ERROR_STOP=1", "-AtX", "-q"], {
      input: commit,
      encoding: "utf8",
      timeout: 30000,
      maxBuffer: 65536,
    });
    assert.notEqual(result.status, 0);
  }
  assert.equal(run("select count(*) from academy.users;"), "3\n");

  run("delete from academy.users where email <> 'other@example.test';");
  const holder = spawn(psql, ["-d", databaseUrl, "-AtX", "-q"], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  const closed = new Promise((resolve) => holder.once("close", resolve));
  t.after(async () => {
    if (holder.exitCode === null) holder.kill("SIGTERM");
    await closed;
  });
  const locked = new Promise((resolve, reject) => {
    let stdout = "";
    const timer = setTimeout(() => reject(new Error("lock holder timeout")), 5_000);
    holder.once("error", reject);
    holder.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (stdout.includes("LOCKED")) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
  holder.stdin.end(
    "begin; lock table academy.users in access exclusive mode; select 'LOCKED'; select pg_sleep(4); rollback;\n",
  );
  await locked;
  const startedAt = Date.now();
  const timedOut = spawnSync(
    psql,
    [
      "-d",
      databaseUrl,
      ...enroll.variables.flatMap((value) => ["-v", value]),
      "-v",
      "ON_ERROR_STOP=1",
      "-AtX",
      "-q",
    ],
    {
      input: enroll.rehearsal,
      encoding: "utf8",
      timeout: 12_000,
      maxBuffer: 65_536,
    },
  );
  assert.notEqual(timedOut.status, 0);
  assert.match(timedOut.stderr, /lock timeout/);
  assert.ok(Date.now() - startedAt < 5_000);
  holder.kill("SIGTERM");
  await closed;
  assert.equal(
    run("select count(*) from academy.course_entitlement;"),
    "0\n",
  );
});
