import sys,json,subprocess,hashlib,re
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
cmd=['docker','exec','-i','supabase-db','psql','-X','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate','-v','academy_digest_commit=false','-v','migration_file=inline-reviewed-body','-At']
r=subprocess.run(cmd,input=sql.encode(),capture_output=True,timeout=100)
after=snapshot();lines=r.stdout.decode(errors='replace').splitlines()
allowed={'BEGIN','ROLLBACK','SET','DO','CREATE TABLE','INSERT 0 1','GRANT','REVOKE','ALTER TABLE','CREATE FUNCTION','COMMENT','LOCK TABLE'}
safe=[x for x in lines if x in allowed or x in ['academy_0034_transition_verified|checked_unexpired_120s_margin','academy_0034_transition_verified|skipped_no_unexpired_120s_margin']]
verified=any(x.startswith('academy_0034_transition_verified|') for x in safe)
out={'command':cmd,'mode':'ROLLBACK','exit':r.returncode,'wrapper_sha256':p['wrapper_sha256'],'migration_sha256':p['migration_sha256'],'before_schema_sha256':before,'after_schema_sha256':after,'schema_unchanged':before==after,'rollback_observed':'ROLLBACK' in lines,'postconditions_verified':verified,'safe_output':safe,'sqlstates':re.findall(r'ERROR:\s+([A-Z0-9]{5})',r.stderr.decode(errors='replace')),'stderr_present':bool(r.stderr)}
print(json.dumps(out))
if r.returncode or before!=after or 'ROLLBACK' not in lines or not verified:sys.exit(1)
