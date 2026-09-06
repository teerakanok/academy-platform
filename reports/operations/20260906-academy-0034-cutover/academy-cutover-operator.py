import json,sys,subprocess,hashlib,uuid,time,re,shlex
from pathlib import Path
R=Path('/private/tmp/cyberskills-prod-cde63a58/records')
W=Path('/private/tmp/academy-session-digest-cde63a58/academy-web')
OLD='90c390b5-ed8e-48e3-8ab5-3a3b8bb30cd8'
NEW='bd109c61-ddda-46c3-8d27-6cedc3365394'
MAINT='f126b6ac-7e3e-4f47-9990-1716b4c106ba'
BASE='003eb7eeccd4c5167152ddbb52857b362c1c6f2d6b90f7d2249fb86300dce036'
SSH=['rtk','proxy','ssh','-o','BatchMode=yes','-o','ConnectTimeout=10','root@ssh-db.cyberskills.co.th']
def save(n,o):
 p=R/n
 with p.open('x') as f:json.dump(o,f,indent=2);f.write('\n')
def load(n):return json.loads((R/n).read_text())
def sha(b):return hashlib.sha256(b).hexdigest()
def command(versions,message):return ['rtk','proxy','./node_modules/.bin/wrangler','versions','deploy',*versions,'--name','cyberskills-academy','--message',message,'--yes']
def verify_deployment(expected):
 cmd=['rtk','proxy','./node_modules/.bin/wrangler','deployments','list','--name','cyberskills-academy','--json']
 p=subprocess.run(cmd,cwd=W,capture_output=True,timeout=90)
 assert p.returncode==0,'DEPLOYMENT_LIST_FAILED'
 d=max(json.loads(p.stdout),key=lambda x:x['created_on'])
 actual={x['version_id']:x['percentage'] for x in d['versions']}
 assert actual==expected,'DEPLOYMENT_DRIFT'
 return {'command':cmd,'id':d['id'],'created_on':d['created_on'],'versions':actual}
def pinned():
 paths={'wrapper':R/'academy-0034-reviewed-wrapper-r2.sql','migration':W/'supabase/migrations/0034_identity_session_id_digest.sql'}
 pins={'wrapper':'11f942279ea4012566e9f49b5563b7b3d33c73ea89f30cff96d50a5928a96e4f','migration':'6355c54a468884008373876565443a6a5456e4005c2026377f46a8a449be66f0'}
 out={}
 for k,path in paths.items():
  b=path.read_bytes();assert sha(b)==pins[k],k+' DRIFT';out[k]=b.decode();out[k+'_sha256']=pins[k]
 return out
def host(script,payload,pin):
 b=(R/script).read_bytes();assert sha(b)==pin,'HOST_SCRIPT_DRIFT'
 p=subprocess.run(SSH+['python3 -c '+shlex.quote(b.decode())],input=json.dumps(payload).encode(),capture_output=True,timeout=150)
 try:receipt=json.loads(p.stdout)
 except Exception:receipt={'stdout_sha256':sha(p.stdout),'json_valid':False}
 result={'transport_exit':p.returncode,'host_script_sha256':pin,'stderr_present':bool(p.stderr),'stderr_sha256':sha(p.stderr),'receipt':receipt}
 return result
phase=sys.argv[1]
if phase=='prepare':
 pinned()
 review=Path('/private/tmp/academy-digest-packet-review-cde63a58/concrete-cutover-r2-review.md').read_bytes()
 assert sha(review)=='054a81c79d00c9de931d02960424879d764b70b01204b6e16abbf04765a8e0bc'
 d=verify_deployment({OLD:100,MAINT:0})
 context={'cutover_id':str(uuid.uuid4()),'expected_schema_sha256':BASE,'prepared_at':time.time(),'preflight':d,'review_sha256':sha(review),'commands':{'maintenance':command([MAINT+'@100',NEW+'@0'],'Authorized Academy session digest maintenance window'),'forward':command([NEW+'@100'],'Activate reviewed session digest app after exact 0034 COMMIT'),'abort_before_commit_only':command([OLD+'@100'],'Abort Academy cutover before database COMMIT')}}
 save('academy-cutover-intent.json',context);print(json.dumps(context))
elif phase in ('maintenance','forward'):
 ctx=load('academy-cutover-intent.json')
 if phase=='forward':
  c=load('academy-0034-production-commit.json');assert c['transport_exit']==0 and c['receipt']['commit_observed'] and c['receipt']['postconditions_verified']
 else:verify_deployment({OLD:100,MAINT:0})
 start=time.time();cmd=ctx['commands'][phase]
 p=subprocess.run(cmd,cwd=W,capture_output=True,timeout=120)
 o={'command':cmd,'started_at':start,'finished_at':time.time(),'exit':p.returncode,'output_sha256':sha(p.stdout),'stderr_present':bool(p.stderr)}
 save('academy-cutover-'+phase+'-deploy.json',o)
 assert p.returncode==0,'DEPLOY_FAILED_INSPECT_CURRENT'
 o['verified_deployment']=verify_deployment({MAINT:100,NEW:0} if phase=='maintenance' else {NEW:100})
 save('academy-cutover-'+phase+'-verified.json',o);print(json.dumps(o))
elif phase=='backup':
 ctx=load('academy-cutover-intent.json');m=load('academy-cutover-maintenance-verified.json')
 assert time.time()-m['finished_at']>=35,'DRAIN_WAIT_REQUIRED'
 assert load('academy-cutover-drain.json')['pass']
 ctx['maintenance_started_at']=m['finished_at']
 o=host('academy-0034-backup-host.py',ctx,'ce7245a3fd5ce7668f5a88f67a63da9c23e9dad29983161d7550d1e954b73b9c')
 save('academy-0034-fresh-backup.json',o);print(json.dumps(o));assert o['transport_exit']==0
elif phase in ('rollback','commit'):
 ctx=load('academy-cutover-intent.json');ctx.update(pinned());ctx['maintenance_started_at']=load('academy-cutover-maintenance-verified.json')['finished_at']
 b=load('academy-0034-fresh-backup.json');assert b['transport_exit']==0
 ctx['backup']={k:b['receipt'][k] for k in ['path','sha256']};ctx['backup_receipt_path']=str(Path(ctx['backup']['path']).parent/'receipt.json')
 if phase=='commit':
  r=load('academy-0034-maintenance-rollback.json');assert r['transport_exit']==0 and r['receipt']['rollback_observed'] and r['receipt']['schema_unchanged'] and r['receipt']['postconditions_verified']
  assert not (R/'academy-0034-commit-attempt.json').exists(),'NO_COMMIT_RETRY'
  save('academy-0034-commit-attempt.json',{'cutover_id':ctx['cutover_id'],'started_at':time.time()})
  o=host('academy-0034-host-commit.py',ctx,'0a0cb0ed12561b4db0a4bf7dbfd244c39eb50d2612abcabfd184ef0110658784');n='academy-0034-production-commit.json'
 else:o=host('academy-0034-host-rehearsal.py',ctx,'3f71f50149fb2164571326dd86983baa8e4186832c3e8e1573176becad1346de');n='academy-0034-maintenance-rollback.json'
 save(n,o);print(json.dumps(o));assert o['transport_exit']==0
else:raise RuntimeError('UNKNOWN_PHASE')
