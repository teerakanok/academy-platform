import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
import net from 'node:net';
const repo='/private/tmp/academy-csp-cde63a58/academy-web', out='/private/tmp/cyberskills-prod-cde63a58/records';
const require=createRequire(repo+'/package.json');const {chromium}=require('@playwright/test');
const port=61003, origin=`http://127.0.0.1:${port}`;
await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(port,'127.0.0.1',()=>s.close(resolve));});
let serverLog='',browser;const result={checked_at:new Date().toISOString(),scope:'local production Worker via workerd; no production journey claim',checks:[],captures:[]};
const child=spawn(process.execPath,[repo+'/node_modules/wrangler/bin/wrangler.js','dev','--config',out+'/academy-csp-local-worker-r3.json','--local','--ip','127.0.0.1','--port',String(port),'--inspector-port','61004','--show-interactive-dev-session','false','--log-level','info'],{cwd:repo,env:{PATH:process.env.PATH,HOME:process.env.HOME,NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',WRANGLER_SEND_METRICS:'false',CI:'true'},stdio:['ignore','pipe','pipe']});
child.stdout.on('data',x=>serverLog+=x);child.stderr.on('data',x=>serverLog+=x);
try{
 const until=Date.now()+45000;while(!serverLog.includes('Ready on http://127.0.0.1:'+port)){if(child.exitCode!==null||Date.now()>until)throw Error('OWNED_SERVER_NOT_READY');await new Promise(r=>setTimeout(r,150));}
 let previous;
 for(let i=0;i<2;i++){
  const res=await fetch(origin+'/courses/basic-os-linux/en',{headers:{'x-nonce':'attacker-probe','content-security-policy':"script-src 'unsafe-inline'"}});const html=await res.text(),csp=res.headers.get('content-security-policy')||'',nonce=csp.match(/'nonce-([^']+)'/)?.[1];
  const scripts=[...html.matchAll(/<script\b([^>]*)>/g)].map(x=>x[1]);const nonces=scripts.map(x=>x.match(/nonce="([^"]+)"/)?.[1]);
  const pass=res.status===200&&!!nonce&&nonce!==previous&&nonce!=='attacker-probe'&&csp.includes("'strict-dynamic'")&&csp.split(',').length===1&&!csp.includes("'unsafe-eval'")&&!/script-src[^;]*'unsafe-inline'/.test(csp)&&scripts.length>0&&nonces.every(n=>n===nonce);
  result.checks.push({check:'fresh-response-nonce-'+i,status:res.status,scriptCount:scripts.length,allScriptNoncesMatch:nonces.every(n=>n===nonce),cacheControl:res.headers.get('cache-control'),policyCount:csp.split(',').length,pass});if(!pass)throw Error('NONCE_HTML_MISMATCH');previous=nonce;
 }
 for(const [path,expected] of [['/brand/logo-academy.svg',200],['/courses/basic-os-linux/de',404]]){const response=await fetch(origin+path);const policy=response.headers.get('content-security-policy')||'';const pass=response.status===expected&&policy.split(';').some(d=>d.trim()==="script-src 'self'");result.checks.push({check:'fallback',path,status:response.status,pass});await response.arrayBuffer();if(!pass)throw Error('FALLBACK_POLICY_FAILED');}
 browser=await chromium.launch({channel:'chrome',headless:true});
 for(const [name,viewport] of [['desktop',{width:1440,height:900}],['mobile',{width:390,height:844}]])for(const theme of ['light','dark']){
  const context=await browser.newContext({viewport,colorScheme:theme});await context.route('**/*',async r=>{if(new URL(r.request().url()).origin!==origin)return r.abort(); if(r.request().isNavigationRequest()&&r.request().resourceType()==='document'){const response=await r.fetch();const body=await response.text();return r.fulfill({response,body:body.replace('</head>','<script>window.__untrustedCspProbe=1</script></head>')});}return r.continue();});const page=await context.newPage();let errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/courses/basic-os-linux/en',{waitUntil:'networkidle'});await page.getByTestId('public-course-syllabus').waitFor({timeout:10000}).catch(async e=>{await page.screenshot({path:out+'/academy-csp-workerd-failure-r10.png'});result.diagnostic={url:page.url(),title:await page.title(),body:(await page.locator('body').innerText()).slice(0,2000),pageErrors:errors};throw e;});
  if(theme==='dark'){await page.getByTestId('theme-toggle').click();await page.reload({waitUntil:'networkidle'});await page.getByTestId('public-course-syllabus').waitFor({timeout:10000}).catch(async e=>{await page.screenshot({path:out+'/academy-csp-workerd-failure-r10.png'});result.diagnostic={url:page.url(),title:await page.title(),body:(await page.locator('body').innerText()).slice(0,2000),pageErrors:errors};throw e;});}if(await page.locator('html').getAttribute('data-theme')!==theme)throw Error('ACTUAL_THEME_MISMATCH');
  const before=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,scripts:[...document.scripts].length}));
  // Parser-inserted untrusted script tests browser enforcement without DevTools injection privileges.
  const injectionBlocked=await page.evaluate(()=>window.__untrustedCspProbe===undefined);await page.locator('[data-testid="lang-th"]:visible').first().click();await page.waitForURL('**/courses/basic-os-linux/th');await page.getByTestId('public-course-syllabus').waitFor({timeout:10000}).catch(async e=>{await page.screenshot({path:out+'/academy-csp-workerd-failure-r10.png'});result.diagnostic={url:page.url(),title:await page.title(),body:(await page.locator('body').innerText()).slice(0,2000),pageErrors:errors};throw e;});
  const capture=out+`/academy-csp-workerd-${name}-${theme}-r10.png`;if(new URL(page.url()).origin!==origin)throw Error('CAPTURE_TARGET_CHANGED');await page.screenshot({path:capture});
  const pass=!before.overflow&&injectionBlocked&&errors.length===0;result.captures.push({name,theme,viewport,url:page.url(),capture,injectionBlocked,actualTheme:await page.locator('html').getAttribute('data-theme'),pageErrors:errors,pass});await context.close();if(!pass)throw Error('BROWSER_ACCEPTANCE_FAILED');
 }
}catch(e){result.failure=e.message;result.serverLogTail=serverLog.slice(-3000);process.exitCode=1}finally{if(browser)await browser.close();child.kill('SIGTERM');await new Promise(r=>child.exitCode!==null?r():child.once('exit',r));result.pass=!result.failure&&result.checks.length===4&&result.captures.length===4;writeFileSync(out+'/academy-csp-workerd-render-r10.json',JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify(result));}
