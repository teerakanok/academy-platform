import subprocess,json,hashlib,datetime,re
from pathlib import Path
academy=Path('/private/tmp/academy-course-route-cde63a58')
crucible=Path('/private/tmp/crucible-capstone-banks-sparse-cde63a58')
original='99b0bfd9730355c043e911f46456827e0d669fcc'
release='624e5e39c79ca1d316e84f57b8586d0efb9d4f7b'
source='a160ff52bd07b132a3ae30578a7273f7f9b746f7'
courses=['assembly','basic-os-linux','c-low-level','computer-architecture','computer-networking','git-essentials','operating-systems','setup-and-environment']
def git(root,*args):return subprocess.check_output(['git',*args],cwd=root)
def original_preserved(a,b):
 if type(a)!=type(b):return False
 if isinstance(a,dict):return all(k in b and original_preserved(v,b[k]) for k,v in a.items())
 if isinstance(a,list):return len(b)>=len(a) and all(original_preserved(v,b[i]) for i,v in enumerate(a))
 return a==b
paths=[p for p in git(academy,'diff-tree','--no-commit-id','--name-only','-r',original).decode().splitlines() if p.startswith('academy-web/content/')]
corrections=[]
for path in paths:
 old=git(academy,'show',original+':'+path);new=git(academy,'show',release+':'+path)
 corrections.append({'path':path,'original_sha256':hashlib.sha256(old).hexdigest(),'release_sha256':hashlib.sha256(new).hexdigest(),'byte_equal':old==new,'original_fields_preserved':original_preserved(json.loads(old),json.loads(new))})
manifest=[];counts={}
for course in courses:
 report=json.loads(git(academy,'show',release+':reports/reviews/2026-09-05-glm-factcheck/'+course+'.json'))
 counts[course]=sum(f['severity'].lower() in ['critical','high'] for f in report['findings'])
 prefix='academy-web/content/courses/'+course+'/'
 for path in git(academy,'ls-tree','-r','--name-only',release,'--',prefix).decode().splitlines():
  cp='courses/academy/'+course+'/'+path[len(prefix):]
  a=git(academy,'show',release+':'+path);c=git(crucible,'show',source+':'+cp)
  manifest.append({'academy_path':path,'crucible_path':cp,'sha256':hashlib.sha256(a).hexdigest(),'equal':a==c})
adjudication=git(crucible,'show',source+':courses/academy/reports/factcheck/2026-09-05-critical-high-adjudication.md').decode()
rows=[x for x in adjudication.splitlines() if re.match(r'^\| (ASM|BOS|C|ARCH|NET|GIT|OS|SET)-\d+',x)]
result={'observed_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'original_projection':original,'release_source':release,'canonical_source':source,'original_finding_counts':counts,'original_findings':sum(counts.values()),'adjudication_rows':len(rows),'adjudicated_fixed':sum('CONFIRMED_FIXED' in x for x in rows),'adjudicated_refuted_preserved':sum('REFUTED_PRESERVED' in x for x in rows),'correction_files':len(corrections),'byte_identical_correction_files':sum(x['byte_equal'] for x in corrections),'original_fields_preserved_files':sum(x['original_fields_preserved'] for x in corrections),'canonical_files':len(manifest),'canonical_files_equal':sum(x['equal'] for x in manifest),'corrections':corrections,'manifest':manifest}
result['pass']=result['original_findings']==result['adjudication_rows']==50 and result['original_fields_preserved_files']==result['correction_files']==86 and result['canonical_files_equal']==result['canonical_files']==327
Path(__file__).with_suffix('.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k not in ['corrections','manifest']}))
assert result['pass']
