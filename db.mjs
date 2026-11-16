import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
export function openDb() {
  const dir=resolve(process.env.DATA_DIR || 'data');
  mkdirSync(dir,{recursive:true});
  const db=new DatabaseSync(resolve(dir,'faza.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS accounts(id INTEGER PRIMARY KEY, login TEXT UNIQUE NOT NULL, digest TEXT NOT NULL, paid_until INTEGER NOT NULL DEFAULT 0, prices TEXT NOT NULL DEFAULT '[]');
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES accounts, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS quotes(id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES accounts, request_id TEXT NOT NULL, doc TEXT NOT NULL, created INTEGER NOT NULL, UNIQUE(user_id, request_id));
    CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES accounts, created INTEGER NOT NULL, activated INTEGER);
    CREATE UNIQUE INDEX IF NOT EXISTS pending_order ON orders(user_id) WHERE activated IS NULL;`);
  return db;
}
export function transaction(db,fn) {
  db.exec('BEGIN IMMEDIATE');
  try {const result=fn(); db.exec('COMMIT'); return result}
  catch(e) {db.exec('ROLLBACK'); throw e}
}
export const month=30*24*60*60*1000;
export function activate(db,id) {
  return transaction(db,()=>{
    const order=db.prepare('SELECT * FROM orders WHERE id=?').get(id);
    if(!order) throw Error('Заказ не найден.');
    if(order.activated) return 'Заказ уже активирован.';
    const now=Date.now();
    db.prepare('UPDATE accounts SET paid_until=MAX(paid_until,?)+? WHERE id=?').run(now,month,order.user_id);
    db.prepare('UPDATE orders SET activated=? WHERE id=?').run(now,id);
    return 'Доступ продлён на 30 дней.';
  });
}
