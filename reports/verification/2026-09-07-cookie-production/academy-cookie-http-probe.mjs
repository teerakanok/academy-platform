import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {publicCoursePagePaths} from '/private/tmp/academy-course-route-cde63a58/academy-web/scripts/public-course-page-paths.mjs';
const mode=process.argv[2]; if(!['candidate','production'].includes(mode))throw new Error('INVALID_MODE');
const origin='https://academy.cyberskills.co.th'; const version='8e4d5c04-6b6f-459b-99e3-5b2352d0f133';
const result={checked_at:new Date().toISOString(),mode,version_override:mode==='candidate',candidate_version:version,checks:[],browser_verified:false};
try {
 const credential=execFileSync('/opt/homebrew/bin/cloudflared',['access','token','--app',origin],{encoding:'utf8',stdio:['ignore','pipe','ignore'],timeout:15000}).trim(); if(!credential)throw new Error('ACCESS_UNAVAILABLE');
 const override=mode==='candidate'?{'Cloudflare-Workers-Version-Overrides':`cyberskills-academy="${version}"`}:{};
 const paths=[['/',200],['/sign-in',200],['/robots.txt',200],...publicCoursePagePaths().map(p=>[p,200]),...['operating-systems','computer-networking','setup-and-environment','c-low-level'].map(c=>[`/courses/${c}/learn`,307]),['/courses/comptia-security-plus/en',404]];
 for(const [path,expected] of paths){const response=await fetch(origin+path,{headers:{...override,Cookie:`CF_Authorization=${credential}`},redirect:'manual',signal:AbortSignal.timeout(20000)});result.checks.push({path,status:response.status,expected,pass:response.status===expected});await response.arrayBuffer();}
 const response=await fetch('https://cyberskills-academy.songpon-te.workers.dev/',{redirect:'manual',signal:AbortSignal.timeout(20000)});result.checks.push({surface:'raw-host',status:response.status,expected:404,pass:response.status===404});await response.arrayBuffer();
}catch(error){result.failure='ACCESS_OR_HTTP_PROBE_FAILED';result.process_status=Number.isInteger(error?.status)?error.status:null;result.process_error_code=/^[A-Z0-9_]+$/.test(error?.code??'')?error.code:'unknown';result.error_type=String(error?.name??'unknown');result.cause_code=/^[A-Z0-9_]+$/.test(error?.cause?.code??'')?error.cause.code:'unknown';}
result.pass=!result.failure&&result.checks.length===25&&result.checks.every(x=>x.pass);if(!result.pass)process.exitCode=1;
writeFileSync(`/private/tmp/cyberskills-prod-cde63a58/records/academy-cookie-${mode}-http.json`,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
