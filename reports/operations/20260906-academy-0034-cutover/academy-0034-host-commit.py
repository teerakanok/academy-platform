import sys,json,subprocess,hashlib,re,os,stat
p=json.load(sys.stdin)
assert hashlib.sha256(p['wrapper'].encode()).hexdigest()==p['wrapper_sha256']
assert hashlib.sha256(p['migration'].encode()).hexdigest()==p['migration_sha256']
assert p['wrapper'].count('\\i :migration_file\n')==1
sql=p['wrapper'].replace('\\i :migration_file\n',p['migration']+'\n')
def snapshot():
 r=subprocess.run(['docker','exec','supabase-db','pg_dump','-U','postgres','-d','postgres','--schema-only','--schema=academy','--no-comments'],capture_output=True)
 if r.returncode: raise RuntimeError('SCHEMA_SNAPSHOT_FAILED')
 raw=re.sub(rb'(?m)^\\(un)?restrict [A-Za-z0-9]+$',lambda m:b'\\'+(b'un' if m.group(1) else b'')+b'restrict ACADEMY_SCHEMA_AUTHORITY',r.stdout)
 return hashlib.sha256(raw).hexdigest()
before=snapshot()
if before!=p['expected_schema_sha256']:raise RuntimeError('SCHEMA_BASELINE_DRIFT')
backup=p['backup']
if not re.fullmatch(r'/root/academy-db-backups/[0-9TZ]+-digest-0034-cde63a58/academy.dump',backup['path']):raise RuntimeError('BACKUP_PATH_REJECTED')
bs=os.lstat(backup['path'])
if not(stat.S_ISREG(bs.st_mode) and bs.st_uid==0 and bs.st_gid==0 and bs.st_nlink==1 and stat.S_IMODE(bs.st_mode)==0o600):raise RuntimeError('BACKUP_METADATA_REJECTED')
with open(backup['path'],'rb') as f:backup_hash=hashlib.sha256(f.read()).hexdigest()
if backup_hash!=backup['sha256']:raise RuntimeError('BACKUP_HASH_DRIFT')
receipt_path=p['backup_receipt_path']
if receipt_path!=os.path.dirname(backup['path'])+'/receipt.json':raise RuntimeError('BACKUP_RECEIPT_PATH_REJECTED')
rs=os.lstat(receipt_path)
if not(stat.S_ISREG(rs.st_mode) and rs.st_uid==0 and rs.st_gid==0 and rs.st_nlink==1 and stat.S_IMODE(rs.st_mode)==0o600):raise RuntimeError('BACKUP_RECEIPT_METADATA_REJECTED')
with open(receipt_path) as f:receipt=json.load(f)
if (receipt.get('path')!=backup['path'] or receipt.get('sha256')!=backup_hash
 or receipt.get('pre_backup_schema_sha256')!=p['expected_schema_sha256']
 or receipt.get('cutover_id')!=p['cutover_id']
 or receipt.get('maintenance_started_at')!=p['maintenance_started_at']
 or not isinstance(receipt.get('backup_started_at'),(int,float))
 or receipt['backup_started_at']<p['maintenance_started_at']
 or receipt.get('archiveListExit')!=0 or receipt.get('archiveListEntries',0)<=0):raise RuntimeError('BACKUP_RECEIPT_DRIFT')
cmd=['docker','exec','-i','supabase-db','psql','-X','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate','-v','academy_digest_commit=true','-v','migration_file=inline-reviewed-body','-At']
r=subprocess.run(cmd,input=sql.encode(),capture_output=True,timeout=100)
after=snapshot();lines=r.stdout.decode(errors='replace').splitlines()
allowed={'BEGIN','ROLLBACK','COMMIT','SET','DO','CREATE TABLE','INSERT 0 1','GRANT','REVOKE','ALTER TABLE','CREATE FUNCTION','COMMENT','LOCK TABLE'}
safe=[x for x in lines if x in allowed or x in ['academy_0034_transition_verified|checked_unexpired_120s_margin','academy_0034_transition_verified|skipped_no_unexpired_120s_margin']]
verified=any(x.startswith('academy_0034_transition_verified|') for x in safe)
out={'command':cmd,'mode':'COMMIT','exit':r.returncode,'wrapper_sha256':p['wrapper_sha256'],'migration_sha256':p['migration_sha256'],'before_schema_sha256':before,'after_schema_sha256':after,'schema_unchanged':before==after,'commit_observed':'COMMIT' in lines,'backup_sha256':backup_hash,'postconditions_verified':verified,'safe_output':safe,'sqlstates':re.findall(r'ERROR:\s+([A-Z0-9]{5})',r.stderr.decode(errors='replace')),'stderr_present':bool(r.stderr)}
print(json.dumps(out))
if r.returncode or before==after or 'COMMIT' not in lines or not verified:sys.exit(1)
