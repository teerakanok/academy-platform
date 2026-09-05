import pg from '/private/tmp/academy-security-glm-cde63a58/academy-web/node_modules/pg/lib/index.js';
import {randomBytes} from 'node:crypto';
const clients=Array.from({length:12},()=>new pg.Client({connectionString:process.env.TEST_DATABASE_URL}));
let count=0;
try {
 await Promise.all(clients.map(async c=>{await c.connect();await c.query('BEGIN');}));
 const results=await Promise.all(clients.map(c=>c.query('select academy.create_identity_authorization_transaction($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) as result',[randomBytes(24).toString('base64url'),'V'.repeat(43),'N'.repeat(32),'D'.repeat(43),'academy-test','https://academy.example.test/auth/callback','academy','academy-api','https://identity.example.test','https://identity.example.test/v1/code/exchange','/dashboard',600])));
 count=results.filter(r=>r.rows[0].result.status==='created').length;
 console.log(JSON.stringify({baseline:'0025 before aggregate admission',concurrent_clients:12,required_test_cap:4,observed_created:count,cap_assertion_passed:count<=4}));
 process.exitCode=count<=4?0:1;
}finally{await Promise.all(clients.map(async c=>{await c.query('ROLLBACK');await c.end();}));}
