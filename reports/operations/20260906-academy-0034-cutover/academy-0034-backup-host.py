import os,stat,json,subprocess,hashlib,re,datetime,sys,time
context=json.load(sys.stdin)
assert re.fullmatch(r'[0-9a-f-]{36}',context['cutover_id'])
def snapshot():
 r=subprocess.run(['docker','exec','supabase-db','pg_dump','-U','postgres','-d','postgres','--schema-only','--schema=academy','--no-comments'],capture_output=True)
 if r.returncode: raise RuntimeError('SCHEMA_SNAPSHOT_FAILED')
 raw=re.sub(rb'(?m)^\\(un)?restrict [A-Za-z0-9]+$',lambda m:b'\\'+(b'un' if m.group(1) else b'')+b'restrict ACADEMY_SCHEMA_AUTHORITY',r.stdout)
 return hashlib.sha256(raw).hexdigest()
pre_backup_schema_sha256=snapshot()
if pre_backup_schema_sha256!=context['expected_schema_sha256']:raise RuntimeError('BACKUP_SCHEMA_BASELINE_DRIFT')
backup_started_at=time.time()
if backup_started_at<context['maintenance_started_at']:raise RuntimeError('BACKUP_PRECEDES_MAINTENANCE')
base='/root/academy-db-backups/'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-digest-0034-cde63a58'
os.mkdir(base,0o700)
st=os.lstat(base)
assert st.st_uid==0 and stat.S_ISDIR(st.st_mode) and stat.S_IMODE(st.st_mode)==0o700
archive=base+'/academy.dump'
with os.fdopen(os.open(archive,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),'wb') as f:
 p=subprocess.run(['docker','exec','supabase-db','pg_dump','-U','postgres','-d','postgres','-Fc','--schema=academy'],stdout=f,stderr=subprocess.PIPE)
 if p.returncode: raise RuntimeError('ACADEMY_BACKUP_FAILED')
 f.flush();os.fsync(f.fileno())
b=open(archive,'rb').read()
p=subprocess.run(['docker','exec','-i','supabase-db','pg_restore','--list'],input=b,capture_output=True)
if p.returncode: raise RuntimeError('ACADEMY_ARCHIVE_LIST_FAILED')
entries=len([x for x in p.stdout.splitlines() if x and not x.startswith(b';')])
assert entries>0 and len(b)>0
r={'cutover_id':context['cutover_id'],'pre_backup_schema_sha256':pre_backup_schema_sha256,'backup_started_at':backup_started_at,'maintenance_started_at':context['maintenance_started_at'],'operation':'Academy Pool A postgres schema-only boundary full schema+data backup','path':archive,'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b),'mode':'0600','archiveListEntries':entries,'archiveListExit':p.returncode,'restoreExecuted':False,'productionSchemaMutation':False}
with os.fdopen(os.open(base+'/receipt.json',os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),'w') as f: json.dump(r,f,indent=2);f.write('\n');f.flush();os.fsync(f.fileno())
print(json.dumps(r))
