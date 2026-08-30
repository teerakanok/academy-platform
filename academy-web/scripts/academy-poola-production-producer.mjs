#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const SHA = /^[a-f0-9]{64}$/;
const REV = /^[a-f0-9]{40}$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const IDS = ["0021", "0022", "0023", "0024", "0025", "0026", "0027"];
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const fail = () => {
  throw new Error("ACADEMY_POOLA_PRODUCER_REJECTED");
};
const exact = (v, k) =>
  v &&
  typeof v === "object" &&
  !Array.isArray(v) &&
  JSON.stringify(Object.keys(v)) === JSON.stringify(k);
const hash = (b) => createHash("sha256").update(b).digest("hex");
function parse(args) {
  if (args.length % 2) fail();
  const v = Object.create(null);
  for (let i = 0; i < args.length; i += 2) {
    if (!/^--[a-z][a-z-]*$/.test(args[i])) fail();
    if (args[i] === "--migration") {
      (v[args[i]] ??= []).push(args[i + 1]);
      continue;
    }
    if (args[i] in v) fail();
    v[args[i]] = args[i + 1];
  }
  return v;
}
async function stable(path, modes) {
  const p = resolve(path);
  if (p !== path || (await realpath(p)) !== p) fail();
  const pathBefore = await lstat(p, { bigint: true });
  const h = await open(p, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await h.stat({ bigint: true });
    const same = (a, b) =>
      a.dev === b.dev &&
      a.ino === b.ino &&
      a.size === b.size &&
      a.uid === b.uid &&
      a.gid === b.gid &&
      a.mode === b.mode &&
      a.nlink === b.nlink &&
      a.mtimeNs === b.mtimeNs &&
      a.ctimeNs === b.ctimeNs;
    if (
      !before.isFile() ||
      before.nlink !== 1n ||
      !modes.includes(Number(before.mode & 0o777n)) ||
      before.uid !== BigInt(process.getuid()) ||
      before.size < 1n ||
      before.size > 1048576n ||
      !same(pathBefore, before)
    )
      fail();
    const bytes = await h.readFile();
    const after = await h.stat({ bigint: true });
    const pathAfter = await lstat(p, { bigint: true });
    if (
      !same(before, after) ||
      !same(after, pathAfter) ||
      BigInt(bytes.length) !== before.size
    )
      fail();
    return bytes;
  } finally {
    await h.close();
  }
}
async function readBackup(path, binding) {
  const bytes = await stable(path, [0o600]);
  let value;
  try {
    value = JSON.parse(bytes);
  } catch {
    fail();
  }
  if (
    !bytes.equals(Buffer.from(`${JSON.stringify(value)}\n`)) ||
    !exact(value, [
      "schema",
      "status",
      "operation",
      "binding",
      "target",
      "identityRestoreReceiptSha256",
      "checks",
      "schemaAuthority",
      "rollback",
    ]) ||
    value.schema !== "academy-poola-backup-restore/v1" ||
    value.status !== "MATCH" ||
    value.operation !== "academy-backup-restore" ||
    JSON.stringify(value.binding) !== JSON.stringify(binding) ||
    JSON.stringify(value.target) !==
      JSON.stringify({
        pool: "Pool A",
        database: "postgres",
        schema: "academy",
      }) ||
    !SHA.test(value.identityRestoreReceiptSha256) ||
    JSON.stringify(value.checks) !==
      JSON.stringify([
        { name: "isolated-restore", status: "MATCH" },
        { name: "academy-schema-only", status: "MATCH" },
        { name: "ownership-grants", status: "MATCH" },
        { name: "cleanup", status: "MATCH" },
      ]) ||
    JSON.stringify(value.schemaAuthority) !==
      JSON.stringify({
        sourceSha256: value.schemaAuthority?.sourceSha256,
        restoredSha256: value.schemaAuthority?.restoredSha256,
        status: "MATCH",
      }) ||
    !SHA.test(value.schemaAuthority.sourceSha256) ||
    value.schemaAuthority.restoredSha256 !==
      value.schemaAuthority.sourceSha256 ||
    JSON.stringify(value.rollback) !==
      JSON.stringify({
        status: "READY",
        artifactSha256: value.rollback?.artifactSha256,
      }) ||
    !SHA.test(value.rollback.artifactSha256)
  )
    fail();
  return { value, sha256: hash(bytes) };
}
async function publish(path, value) {
  const parent = dirname(path);
  if ((await realpath(parent)) !== parent) fail();
  const h = await open(
    path,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_EXCL |
      constants.O_NOFOLLOW,
    0o600,
  );
  try {
    await h.writeFile(`${JSON.stringify(value)}\n`);
    await h.sync();
  } finally {
    await h.close();
  }
  const d = await open(parent, "r");
  try {
    await d.sync();
  } finally {
    await d.close();
  }
}
function runSsh(payload, deadline) {
  return new Promise((ok, bad) => {
    const child = spawn("/usr/bin/ssh", sshArguments(), {
      stdio: ["pipe", "pipe", "ignore"],
      env: {
        HOME: process.env.HOME,
        LANG: "C",
        LC_ALL: "C",
        PATH: "/usr/bin:/bin",
      },
    });
    let out = "";
    const timer = setTimeout(
      () => child.kill("SIGKILL"),
      Math.max(1, deadline - Date.now()),
    );
    child.stdout.on("data", (c) => {
      out += c;
      if (out.length > 65536) child.kill("SIGKILL");
    });
    child.on("error", bad);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return bad(Error("REMOTE_FAILED"));
      try {
        ok(JSON.parse(out));
      } catch {
        bad(Error("REMOTE_INVALID"));
      }
    });
    child.stdin.end(JSON.stringify(payload));
  });
}
const REMOTE = String.raw`import sys,json,subprocess,hashlib,os,stat,datetime,re
p=json.load(sys.stdin); op=p['operation']; aid=p['authorityId']; base='/root/academy-db-backups/'+aid; os.makedirs(base,mode=0o700,exist_ok=True); st=os.stat(base,follow_symlinks=False)
if st.st_uid!=0 or (st.st_mode & 0o777)!=0o700: raise RuntimeError('workspace')
def run(a,data=None): return subprocess.run(a,input=data,text=not isinstance(data,(bytes,bytearray)),capture_output=True,check=True).stdout
def canonical_schema(raw):
 lines=raw.splitlines(keepends=True);out=[]
 for line in lines:
  m=re.fullmatch(r'\\(un)?restrict [A-Za-z0-9]+\n',line)
  out.append(('\\unrestrict ACADEMY_SCHEMA_AUTHORITY\n' if m and m.group(1) else '\\restrict ACADEMY_SCHEMA_AUTHORITY\n') if m else line)
 return ''.join(out)
if op=='backup':
 tmp=base+'/academy.dump.tmp'; final=base+'/academy.dump'; side=base+'/academy.dump.sha256'; scratch='academy_restore_'+aid.replace('-','_')
 authority={'schema':'academy-poola-dump-authority/v1','operationId':aid,'releaseRevision':p['releaseRevision'],'identityReadinessSha256':p['identityReadinessSha256'],'identityRestoreReceiptSha256':p['identityRestoreReceiptSha256']}
 try:
  if os.path.lexists(tmp):
   ts=os.lstat(tmp)
   if not stat.S_ISREG(ts.st_mode) or ts.st_uid!=0 or (ts.st_mode & 0o777)!=0o600 or ts.st_nlink!=1: raise RuntimeError('foreign-temp')
   os.unlink(tmp)
  if os.path.lexists(final):
   fs=os.lstat(final)
   if not stat.S_ISREG(fs.st_mode) or fs.st_uid!=0 or (fs.st_mode & 0o777)!=0o600 or fs.st_nlink!=1 or fs.st_size<1: raise RuntimeError('foreign-dump')
   digest=hashlib.sha256(open(final,'rb').read()).hexdigest()
   if not os.path.lexists(side):
    os.unlink(final)
    d=os.open(base,os.O_RDONLY);os.fsync(d);os.close(d)
   else:
    ss=os.lstat(side)
    if not stat.S_ISREG(ss.st_mode) or ss.st_uid!=0 or (ss.st_mode & 0o777)!=0o600 or ss.st_nlink!=1 or ss.st_size>1024: raise RuntimeError('foreign-digest')
    raw=open(side,'r',encoding='ascii').read();meta=json.loads(raw)
    if raw!=json.dumps(meta,separators=(',',':'))+'\n' or meta!={**authority,'dumpSha256':digest,'dumpBytes':fs.st_size,'capturedAt':meta.get('capturedAt')} or not isinstance(meta.get('capturedAt'),str): raise RuntimeError('resume-digest')
    try: datetime.datetime.strptime(meta['capturedAt'],'%Y-%m-%dT%H:%M:%S.%fZ')
    except ValueError: raise RuntimeError('resume-timestamp')
  elif os.path.lexists(side): raise RuntimeError('orphan-digest')
  if not os.path.exists(final):
   with os.fdopen(os.open(tmp,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),'wb') as f: subprocess.run(['docker','exec','supabase-db','pg_dump','-U','postgres','-d','postgres','-Fc','--schema=academy'],stdout=f,check=True);f.flush();os.fsync(f.fileno())
   os.rename(tmp,final)
   fs=os.lstat(final);digest=hashlib.sha256(open(final,'rb').read()).hexdigest();meta={**authority,'dumpSha256':digest,'dumpBytes':fs.st_size,'capturedAt':p['capturedAt']}
   with os.fdopen(os.open(side,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),'w',encoding='ascii') as f: f.write(json.dumps(meta,separators=(',',':'))+'\n');f.flush();os.fsync(f.fileno())
   d=os.open(base,os.O_RDONLY);os.fsync(d);os.close(d)
  source_schema=canonical_schema(run(['docker','exec','supabase-db','pg_dump','-U','postgres','-d','postgres','--schema-only','--schema=academy','--no-comments']))
  run(['docker','exec','-i','supabase-db','pg_restore','--list'],open(final,'rb').read())
  subprocess.run(['docker','exec','supabase-db','dropdb','-U','postgres','--if-exists',scratch],check=True,stdout=subprocess.DEVNULL)
  run(['docker','exec','supabase-db','createdb','-U','postgres',scratch]);subprocess.run(['docker','exec','-i','supabase-db','pg_restore','-U','postgres','-d',scratch],input=open(final,'rb').read(),check=True)
  restored_schema=canonical_schema(run(['docker','exec','supabase-db','pg_dump','-U','postgres','-d',scratch,'--schema-only','--schema=academy','--no-comments']))
  if source_schema!=restored_schema: raise RuntimeError('schema-authority-mismatch')
  proof=run(['docker','exec','supabase-db','psql','-U','postgres','-d',scratch,'-AtX','-F','|','-c',"select (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='academy'),(select count(*) from pg_namespace n where n.nspname='academy' and (pg_get_userbyid(n.nspowner)<>'postgres' or n.nspacl is not null)),(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='academy' and (c.relkind not in ('r','p','v','m','S','f','i','I','c') or pg_get_userbyid(c.relowner)<>'postgres' or c.relacl is not null)),(select count(*) from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='academy' and a.attnum>0 and not a.attisdropped and a.attacl is not null),(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='academy' and (pg_get_userbyid(p.proowner)<>'postgres' or p.proacl is not null)),(select count(*) from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='academy' and (pg_get_userbyid(t.typowner)<>'postgres' or t.typacl is not null)),(select count(*) from pg_default_acl d join pg_namespace n on n.oid=d.defaclnamespace where n.nspname='academy')"]).strip().split('|')
  if len(proof)!=7 or int(proof[0])<1 or proof[1:]!=['0','0','0','0','0','0']: raise RuntimeError('objects-owner-acl')
  b=open(final,'rb').read();schema_hash=hashlib.sha256(source_schema.encode()).hexdigest();result={'status':'MATCH','artifactSha256':hashlib.sha256(b).hexdigest(),'bytes':len(b),'objectCount':int(proof[0]),'sourceSchemaSha256':schema_hash,'restoredSchemaSha256':hashlib.sha256(restored_schema.encode()).hexdigest()}
 finally:
  dropped=subprocess.run(['docker','exec','supabase-db','dropdb','-U','postgres','--if-exists',scratch],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0;os.path.exists(tmp) and os.unlink(tmp)
  absent=run(['docker','exec','supabase-db','psql','-U','postgres','-d','postgres','-AtX','-c',"select count(*) from pg_database where datname='"+scratch+"'"]).strip()=='0'
  if not dropped or not absent: raise RuntimeError('cleanup')
 print(json.dumps({**result,'cleanupVerified':True}))
else:
 sql='BEGIN;\n'+p['sql']+'\nCOMMIT;\n';run(['docker','exec','-i','supabase-db','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-X'],sql)
 check=run(['docker','exec','supabase-db','psql','-U','postgres','-d','postgres','-AtX','-c',"select count(*) from information_schema.tables where table_schema='academy'"]).strip()
 if not check.isdigit() or int(check)<1: raise RuntimeError('postcondition')
 print(json.dumps({'status':'PASS','tableCount':int(check)}))`;
export function remoteCommand() {
  const encoded = Buffer.from(REMOTE).toString("base64");
  return `/usr/bin/python3 -c 'import base64;exec(base64.b64decode("${encoded}"))'`;
}
export function remoteCommandForTest(workspaceRoot) {
  if (!workspaceRoot.startsWith("/private/tmp/") || workspaceRoot.includes("'"))
    fail();
  const source = REMOTE.replace(
    "/root/academy-db-backups",
    workspaceRoot,
  ).replaceAll("st_uid!=0", `st_uid!=${process.getuid()}`);
  const encoded = Buffer.from(source).toString("base64");
  return `/usr/bin/python3 -c 'import base64;exec(base64.b64decode("${encoded}"))'`;
}
export function sshArguments() {
  return [
    "-o",
    "BatchMode=yes",
    "-o",
    "StrictHostKeyChecking=yes",
    "root@ssh-db.cyberskills.co.th",
    remoteCommand(),
  ];
}

export async function runAcademyPoolAProducer(args, { remote = runSsh } = {}) {
  const v = parse(args);
  for (const x of [
    "--authority",
    "--release",
    "--identity-readiness",
    "--valid-until",
    "--pool",
    "--database",
    "--schema",
    "--receipt",
  ])
    if (!v[x]) fail();
  if (
    !UUID.test(v["--authority"]) ||
    !REV.test(v["--release"]) ||
    !SHA.test(v["--identity-readiness"]) ||
    v["--pool"] !== "Pool A" ||
    v["--database"] !== "postgres" ||
    v["--schema"] !== "academy" ||
    !ISO.test(v["--valid-until"]) ||
    !Number.isFinite(Date.parse(v["--valid-until"])) ||
    new Date(v["--valid-until"]).toISOString() !==
      v["--valid-until"].replace("Z", ".000Z") ||
    Date.now() >= Date.parse(v["--valid-until"])
  )
    fail();
  const binding = {
    authorityId: v["--authority"],
    releaseRevision: v["--release"],
    identityReadinessSha256: v["--identity-readiness"],
    validUntil: v["--valid-until"],
  };
  const target = { pool: "Pool A", database: "postgres", schema: "academy" };
  const deadline = Math.min(
    Date.parse(v["--valid-until"]),
    Date.now() + 120000,
  );
  if (v["--identity-restore"]) {
    if (!SHA.test(v["--identity-restore"])) fail();
    const r = await remote(
      {
        operation: "backup",
        authorityId: v["--authority"],
        releaseRevision: v["--release"],
        identityReadinessSha256: v["--identity-readiness"],
        identityRestoreReceiptSha256: v["--identity-restore"],
        capturedAt: new Date().toISOString(),
      },
      deadline,
    );
    if (
      !exact(r, [
        "status",
        "artifactSha256",
        "bytes",
        "objectCount",
        "cleanupVerified",
        "sourceSchemaSha256",
        "restoredSchemaSha256",
      ]) ||
      r.status !== "MATCH" ||
      !SHA.test(r.artifactSha256) ||
      !Number.isSafeInteger(r.bytes) ||
      r.bytes < 1 ||
      !Number.isSafeInteger(r.objectCount) ||
      r.objectCount < 1 ||
      r.cleanupVerified !== true ||
      !SHA.test(r.sourceSchemaSha256) ||
      r.restoredSchemaSha256 !== r.sourceSchemaSha256
    )
      fail();
    const receipt = {
      schema: "academy-poola-backup-restore/v1",
      status: "MATCH",
      operation: "academy-backup-restore",
      binding,
      target,
      identityRestoreReceiptSha256: v["--identity-restore"],
      checks: [
        { name: "isolated-restore", status: "MATCH" },
        { name: "academy-schema-only", status: "MATCH" },
        { name: "ownership-grants", status: "MATCH" },
        { name: "cleanup", status: "MATCH" },
      ],
      schemaAuthority: {
        sourceSha256: r.sourceSchemaSha256,
        restoredSha256: r.restoredSchemaSha256,
        status: "MATCH",
      },
      rollback: { status: "READY", artifactSha256: r.artifactSha256 },
    };
    await publish(v["--receipt"], receipt);
    return receipt;
  }
  if (v["--ordered"] !== IDS.join(",")) fail();
  const backup = await readBackup(v["--backup-receipt"], binding);
  const specs = Array.isArray(v["--migration"])
    ? v["--migration"]
    : [v["--migration"]];
  if (specs.length !== 7) fail();
  const ledger = [];
  let sql = "";
  for (let i = 0; i < 7; i++) {
    const [id, path, sha] = specs[i].split(":");
    if (id !== IDS[i] || !SHA.test(sha)) fail();
    const b = await stable(path, [0o600, 0o644]);
    if (hash(b) !== sha) fail();
    ledger.push({ id, sha256: sha, status: "APPLIED" });
    sql += b.toString("utf8") + "\n";
  }
  const r = await remote(
    { operation: "migrations", authorityId: v["--authority"], sql },
    deadline,
  );
  if (
    !exact(r, ["status", "tableCount"]) ||
    r.status !== "PASS" ||
    !Number.isSafeInteger(r.tableCount) ||
    r.tableCount < 1
  )
    fail();
  const receipt = {
    schema: "academy-poola-migrations/v2",
    status: "PASS",
    operation: "academy-migrations-0021-0027",
    binding,
    target,
    ordered: IDS,
    ledgerSemantics: "exact-bytes-executed-in-this-transaction",
    ledger,
    transaction: { atomic: true, onErrorStop: true, status: "COMMITTED" },
    postconditions: { academyTableCount: r.tableCount, status: "PASS" },
    rollback: { backupReceiptSha256: backup.sha256, status: "READY" },
  };
  await publish(v["--receipt"], receipt);
  return receipt;
}
if (import.meta.url === `file://${process.argv[1]}`)
  runAcademyPoolAProducer(process.argv.slice(2))
    .then(() => console.log("RECEIPT_WRITTEN"))
    .catch(() => {
      console.error("ACADEMY_POOLA_PRODUCER_REJECTED");
      process.exitCode = 1;
    });
