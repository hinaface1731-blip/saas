import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {demo,total,normalize} from '../public/model.js';

test('Округление каждой строки до копейки и проверка значений',()=>{
  assert.equal(total([{qty:1.5,price:1.11},{qty:1.5,price:1.11}]),3.34);
  assert.equal(total(demo.items),35100);
  for(const qty of [0,-1,1.001,'',null])assert.throws(()=>normalize({...demo,items:[{...demo.items[0],qty}]}));
});
test('Публикация, изоляция кабинетов, оплата, повторное подтверждение и перезапуск',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'faza-test-')),env={...process.env,PORT:'0',HOST:'127.0.0.1',DATA_DIR:dir,COOKIE_SECURE:'0'};
  let proc,base;
  async function start(){
    proc=spawn(process.execPath,['server.mjs'],{env,stdio:['ignore','pipe','inherit']});
    const [out]=await Promise.race([once(proc.stdout,'data'),once(proc,'exit').then(()=>{throw Error('Сервер остановлен')})]);
    base='http://127.0.0.1:'+out.toString().trim().match(/\d+$/)[0];
  }
  async function stop(){if(proc && proc.exitCode===null && proc.signalCode===null){const done=once(proc,'exit');proc.kill();await done}}
  t.after(async()=>{await stop();await rm(dir,{recursive:true,force:true})});
  await start();
  async function call(path,data,cookie=''){
    const r=await fetch(base+'/api'+path,data===undefined?{headers:{cookie}}:{method:'POST',headers:{'Content-Type':'application/json',cookie},body:JSON.stringify(data)});
    return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};
  }
  const creds={login:'монтажник',password:'example-password'};
  const owner=(await call('/register',creds)).cookie;
  assert.ok(owner);
  const other=(await call('/register',{...creds,login:'другой'})).cookie;
  assert.equal((await call('/quotes',{doc:demo,key:randomUUID()})).status,401);
  const data={doc:demo,key:randomUUID()};
  const [a,b]=await Promise.all([call('/quotes',data,owner),call('/quotes',data,owner)]);
  assert.equal(a.status,200);assert.equal(a.body.id,b.body.id);
  assert.deepEqual((await call('/q/'+a.body.id)).body.doc,demo);
  assert.equal((await call('/me',undefined,other)).body.quotes.length,0);
  assert.equal((await call('/quotes',{...data,key:randomUUID()},owner)).status,402);
  const prices=[{name:'Работа',unit:'м',price:25.5}];
  assert.deepEqual((await call('/prices',{rows:prices},owner)).body.prices,prices);
  assert.deepEqual((await call('/me',undefined,other)).body.prices,[]);
  const order=(await call('/orders',{},owner)).body.id;
  assert.equal((await call('/orders',{},owner)).body.id,order);
  assert.match(execFileSync(process.execPath,['billing.mjs','list'],{env,encoding:'utf8'}),new RegExp(order));
  const grant=()=>execFileSync(process.execPath,['billing.mjs','activate',order],{env});
  grant();const expiry=(await call('/me',undefined,owner)).body.paidUntil;assert.ok(expiry>Date.now());
  grant();assert.equal((await call('/me',undefined,owner)).body.paidUntil,expiry);
  assert.equal((await call('/quotes',{doc:demo,key:randomUUID()},owner)).status,200);
  await stop();await start();
  assert.equal((await call('/me',undefined,owner)).body.quotes.length,2);
  assert.equal((await call('/q/'+a.body.id)).status,200);
  assert.equal((await call('/logout',{},owner)).status,200);
  assert.equal((await call('/me',undefined,owner)).body.user,null);
  assert.ok((await call('/login',creds)).cookie);
});
