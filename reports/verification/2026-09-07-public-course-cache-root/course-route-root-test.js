import worker from './bundle.js';
import { env } from 'cloudflare:workers';
export default { async test() {
 const runtime = { ASSETS: env.ASSETS, IDENTITY_LIFECYCLE_ENABLED: 'false' };
 const ctx={waitUntil(){},passThroughOnException(){}};
 for (const slug of ["assembly", "basic-os-linux", "c-low-level", "computer-architecture", "computer-networking", "git-essentials", "operating-systems", "setup-and-environment"]) for (const locale of ['en','th']) {
  const path='/courses/'+slug+'/'+locale;
  const r=await worker.fetch(new Request('https://academy.cyberskills.co.th'+path),runtime,ctx);
  const body=await r.text();
  console.log(JSON.stringify({path,status:r.status,bytes:body.length,h1:body.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1]}));
  if(r.status!==200||!body.includes('<h1')) throw Error('Course render failed '+path);
 }
 for(const path of ['/courses/assembly/learn','/courses/assembly/lessons/recursion-in-assembly',...["comptia-security-plus", "content-formats-demo", "isc2-cc"].map(s=>'/courses/'+s+'/en')]) {
 const r=await worker.fetch(new Request('https://academy.cyberskills.co.th'+path),runtime,ctx);
 console.log(JSON.stringify({privatePath:path,status:r.status,location:r.headers.get('location')}));
 if(![307,302,401,403,404].includes(r.status)) throw Error('Private route exposed '+path);
 if([307,302].includes(r.status)&&!r.headers.get('location')?.includes('/sign-in'))throw Error('Unexpected private redirect');
}
 const raw=await worker.fetch(new Request('https://raw-host.example/'),runtime,ctx);
 if(raw.status!==404)throw Error('raw host exposed');
}};