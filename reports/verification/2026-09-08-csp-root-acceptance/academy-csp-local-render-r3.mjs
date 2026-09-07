import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
import net from 'node:net';
const repo='/private/tmp/academy-csp-cde63a58/academy-web', out='/private/tmp/cyberskills-prod-cde63a58/records';
const require=createRequire(repo+'/package.json');const {chromium}=require('@playwright/test');
const port=61003, origin=`http://127.0.0.1:${port}`;
await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(port,'127.0.0.1',()=>s.close(resolve));});
let serverLog='',browser;const result={checked_at:new Date().toISOString(),scope:'local production Next build; no production journey claim',checks:[],captures:[]};
const child=spawn(process.execPath,[repo+'/node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{cwd:repo,env:{PATH:process.env.PATH,HOME:process.env.HOME,NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1'},stdio:['ignore','pipe','pipe']});
child.stdout.on('data',x=>serverLog+=x);child.stderr.on('data',x=>serverLog+=x);
try{
 const until=Date.now()+45000;while(!serverLog.includes('Ready in')){if(child.exitCode!==null||Date.now()>until)throw Error('OWNED_SERVER_NOT_READY');await new Promise(r=>setTimeout(r,150));}
 let previous;
 for(let i=0;i<2;i++){
  const res=await fetch(origin+'/courses/basic-os-linux/en',{headers:{'x-nonce':'attacker-probe','content-security-policy':"script-src 'unsafe-inline'"}});const html=await res.text(),csp=res.headers.get('content-security-policy')||'',nonce=csp.match(/'nonce-([^']+)'/)?.[1];
  const scripts=[...html.matchAll(/<script\b([^>]*)>/g)].map(x=>x[1]);const nonces=scripts.map(x=>x.match(/nonce="([^"]+)"/)?.[1]);
  const pass=res.status===200&&!!nonce&&nonce!==previous&&nonce!=='attacker-probe'&&csp.includes("'strict-dynamic'")&&!csp.includes("'unsafe-eval'")&&!/script-src[^;]*'unsafe-inline'/.test(csp)&&scripts.length>0&&nonces.every(n=>n===nonce);
  result.checks.push({check:'fresh-response-nonce-'+i,status:res.status,scriptCount:scripts.length,allScriptNoncesMatch:nonces.every(n=>n===nonce),cacheControl:res.headers.get('cache-control'),pass});if(!pass)throw Error('NONCE_HTML_MISMATCH');previous=nonce;
 }
 browser=await chromium.launch({channel:'chrome',headless:true});
 for(const [name,viewport] of [['desktop',{width:1440,height:900}],['mobile',{width:390,height:844}]])for(const theme of ['light','dark']){
  const context=await browser.newContext({viewport,colorScheme:theme});await context.route('**/*',async r=>{if(new URL(r.request().url()).origin!==origin)return r.abort(); if(r.request().isNavigationRequest()&&r.request().resourceType()==='document'){const response=await r.fetch();const body=await response.text();return r.fulfill({response,body:body.replace('</head>','<script>window.__untrustedCspProbe=1</script></head>')});}return r.continue();});const page=await context.newPage();let errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/courses/basic-os-linux/en',{waitUntil:'networkidle'});await page.getByTestId('public-course-syllabus').waitFor();
  if(theme==='dark'){await page.getByTestId('theme-toggle').click();await page.reload({waitUntil:'networkidle'});await page.getByTestId('public-course-syllabus').waitFor();}if(await page.locator('html').getAttribute('data-theme')!==theme)throw Error('ACTUAL_THEME_MISMATCH');
  const before=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,scripts:[...document.scripts].length}));
  // Parser-inserted untrusted script tests browser enforcement without DevTools injection privileges.
  const injectionBlocked=await page.evaluate(()=>window.__untrustedCspProbe===undefined);await page.locator('[data-testid="lang-th"]:visible').first().click();await page.waitForURL('**/courses/basic-os-linux/th');await page.getByTestId('public-course-syllabus').waitFor();
  const capture=out+`/academy-csp-local-${name}-${theme}-r3.png`;if(new URL(page.url()).origin!==origin)throw Error('CAPTURE_TARGET_CHANGED');await page.screenshot({path:capture});
  const pass=!before.overflow&&injectionBlocked&&errors.length===0;result.captures.push({name,theme,viewport,url:page.url(),capture,injectionBlocked,actualTheme:await page.locator('html').getAttribute('data-theme'),pageErrors:errors,pass});await context.close();if(!pass)throw Error('BROWSER_ACCEPTANCE_FAILED');
 }
}catch(e){result.failure=e.message;process.exitCode=1}finally{if(browser)await browser.close();child.kill('SIGTERM');await new Promise(r=>child.exitCode!==null?r():child.once('exit',r));result.pass=!result.failure&&result.checks.length===2&&result.captures.length===4;writeFileSync(out+'/academy-csp-local-render-r3.json',JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify(result));}
