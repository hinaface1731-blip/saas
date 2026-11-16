import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {randomBytes,createHash,scrypt,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {openDb,transaction,month} from './db.mjs';
import {normalize,priceRow,demo} from './public/model.js';

const db=openDb(), derive=promisify(scrypt);
const cookieName='faza_session';
const contact=process.env.SALES_TELEGRAM || 'FoolyQ';
if (!/^[A-Za-z0-9_]{5,32}$/.test(contact)) throw Error('Проверьте SALES_TELEGRAM');
const secure=process.env.COOKIE_SECURE==='1';
const hash=value=>createHash('sha256').update(value).digest('hex');
const fail=(status,message)=>{throw Object.assign(Error(message),{status})};
const rates=new Map();
function throttle(ip) {
  const now=Date.now(), entry=rates.get(ip);
  if(!entry || entry.until<=now) rates.set(ip,{n:1,until:now+600000});
  else if(++entry.n>30) fail(429,'Много попыток входа. Попробуйте через 10 минут.');
}
setInterval(()=>{
  for(const [ip,v] of rates) if(v.until<=Date.now()) rates.delete(ip);
  db.prepare('DELETE FROM sessions WHERE expires<=?').run(Date.now());
},600000).unref();
const sessionToken=req=>(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1)||'';
function account(req) {
  return db.prepare('SELECT a.* FROM accounts a JOIN sessions s ON a.id=s.user_id WHERE s.token=? AND s.expires>?').get(hash(sessionToken(req)),Date.now());
}
function cookie(value,age) {return cookieName+'='+value+'; Path=/; HttpOnly; SameSite=Lax; Max-Age='+age+(secure?'; Secure':'')}
function json(res,data,status=200) {
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
  res.end(JSON.stringify(data));
}
async function body(req) {
  if(req.headers['content-type']?.split(';')[0]!=='application/json') fail(415,'Ожидается JSON.');
  if(req.headers.origin) {
    let host;try {host=new URL(req.headers.origin).host}catch{}
    if(host!==req.headers.host) fail(403,'Источник запроса не совпадает.');
  }
  const chunks=[];let size=0;
  for await(const chunk of req) {size+=chunk.length;if(size>128000) fail(413,'Слишком много данных.');chunks.push(chunk)}
  try {const value=JSON.parse(Buffer.concat(chunks).toString());if(value && typeof value==='object' && !Array.isArray(value)) return value}catch{}
  fail(400,'Некорректный запрос.');
}
function validate(fn){try{return fn()}catch(e){fail(400,e.message)}}
function state(user) {
  if(!user) return {user:null,contact};
  const quotes=db.prepare('SELECT id,created,doc FROM quotes WHERE user_id=? ORDER BY created DESC').all(user.id).map(q=>{
    const doc=JSON.parse(q.doc);return {id:q.id,created:q.created,title:doc.title};
  });
  return {user:user.login,paidUntil:user.paid_until,prices:JSON.parse(user.prices),quotes,contact,
    pending:db.prepare('SELECT id FROM orders WHERE user_id=? AND activated IS NULL').get(user.id)?.id};
}
async function auth(req,res,path,data) {
  throttle((process.env.TRUST_PROXY==='1' && req.headers['x-forwarded-for']?.split(',').at(-1)?.trim()) || req.socket.remoteAddress);
  const login=String(data.login||'').trim().toLowerCase(), pass=data.password;
  if(!/^[a-zа-яё0-9_-]{3,40}$/u.test(login) || typeof pass!=='string' || pass.length<8 || pass.length>128) fail(400,'Логин — 3–40 букв, цифр, дефисов или подчёркиваний. Пароль — 8–128 символов.');
  let user=db.prepare('SELECT * FROM accounts WHERE login=?').get(login);
  if(path==='/api/register') {
    if(user) fail(409,'Такой логин уже занят.');
    const salt=randomBytes(16).toString('hex'),digest=(await derive(pass,salt,64)).toString('hex');
    if(!db.prepare('INSERT OR IGNORE INTO accounts(login,digest) VALUES(?,?)').run(login,salt+'.'+digest).changes) fail(409,'Такой логин уже занят.');
    user=db.prepare('SELECT * FROM accounts WHERE login=?').get(login);
  } else {
    const [salt,expected]=(user?.digest||'dummy.'+'0'.repeat(128)).split('.');
    const actual=await derive(pass,salt,64);
    if(!timingSafeEqual(actual,Buffer.from(expected,'hex')) || !user) fail(401,'Проверьте логин и пароль.');
  }
  const token=randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(token),user.id,Date.now()+month);
  res.setHeader('Set-Cookie',cookie(token,month/1000));
  json(res,state(user));
}
const staticFiles=new Map([['/','index.html'],['/app.js','app.js'],['/model.js','model.js'],['/style.css','style.css'],['/quote.js','quote.js']]);
const types={html:'text/html',js:'text/javascript',css:'text/css'};
const server=http.createServer(async(req,res)=>{
  try {
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    const path=new URL(req.url,'http://localhost').pathname;
    if(req.method==='GET') {
      if(path==='/api/me') return json(res,state(account(req)));
      if(/^\/api\/q\/(example|[0-9a-f]{32})$/.test(path)) {
        const id=path.split('/').pop();
        if(id==='example') return json(res,{doc:demo,created:null});
        const q=db.prepare('SELECT created,doc FROM quotes WHERE id=?').get(id);
        if(!q) fail(404,'Смета не найдена.');
        return json(res,{doc:JSON.parse(q.doc),created:q.created});
      }
      const file=staticFiles.get(path) || (/^\/q\/(example|[0-9a-f]{32})$/.test(path)?'quote.html':null);
      if(!file) fail(404,'Страница не найдена.');
      const content=await readFile(new URL('./public/'+file,import.meta.url));
      res.writeHead(200,{'Content-Type':types[file.split('.').pop()]+'; charset=utf-8','Cache-Control':'no-cache'});return res.end(content);
    }
    if(req.method!=='POST') fail(405,'Метод не поддерживается.');
    const data=await body(req);
    if(['/api/register','/api/login'].includes(path)) return await auth(req,res,path,data);
    const user=account(req);
    if(!user) fail(401,'Сначала войдите в кабинет.');
    if(path==='/api/logout') {
      db.prepare('DELETE FROM sessions WHERE token=?').run(hash(sessionToken(req)));
      res.setHeader('Set-Cookie',cookie('',0));return json(res,{ok:true});
    }
    if(path==='/api/prices') {
      if(!Array.isArray(data.rows) || data.rows.length>300) fail(400,'Прайс допускает до 300 позиций.');
      const prices=validate(()=>data.rows.map(priceRow));
      db.prepare('UPDATE accounts SET prices=? WHERE id=?').run(JSON.stringify(prices),user.id);
      return json(res,{prices});
    }
    if(path==='/api/quotes') {
      const doc=validate(()=>normalize(data.doc));
      if(!/^[\da-f-]{36}$/.test(data.key||'')) fail(400,'Неверный ключ операции.');
      const id=transaction(db,()=>{
        const prior=db.prepare('SELECT id,doc FROM quotes WHERE user_id=? AND request_id=?').get(user.id,data.key);
        if(prior) {if(prior.doc!==JSON.stringify(doc)) fail(409,'Черновик изменился. Повторите отправку.');return prior.id}
        const paid=db.prepare('SELECT paid_until FROM accounts WHERE id=?').get(user.id).paid_until>Date.now();
        if(!paid && db.prepare('SELECT 1 FROM quotes WHERE user_id=? LIMIT 1').get(user.id)) fail(402,'Бесплатная смета уже отправлена. Для следующей подключите тариф «Мастер».');
        const id=randomBytes(16).toString('hex');
        db.prepare('INSERT INTO quotes VALUES(?,?,?,?,?)').run(id,user.id,data.key,JSON.stringify(doc),Date.now());
        return id;
      });
      return json(res,{id});
    }
    if(path==='/api/orders') {
      const id=transaction(db,()=>{
        const prior=db.prepare('SELECT id FROM orders WHERE user_id=? AND activated IS NULL').get(user.id);
        if(prior) return prior.id;
        const id='FZ-'+randomBytes(6).toString('hex').toUpperCase();
        db.prepare('INSERT INTO orders VALUES(?,?,?,NULL)').run(id,user.id,Date.now());return id;
      });
      return json(res,{id,contact});
    }
    fail(404,'Страница не найдена.');
  } catch(e) {if(!e.status) console.error(e);if(!res.headersSent) json(res,{error:e.status?e.message:'Ошибка сервера. Повторите запрос.'},e.status||500);else res.end()}
});
server.listen(Number(process.env.PORT||3000),process.env.HOST||'127.0.0.1',()=>console.log('Фаза запущена на порту '+server.address().port));
