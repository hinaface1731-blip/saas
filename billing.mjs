import {openDb,activate} from './db.mjs';
const db=openDb();
try {
  const [cmd,id]=process.argv.slice(2);
  if(cmd==='list') console.table(db.prepare('SELECT o.id, a.login, datetime(o.created/1000,\'unixepoch\') AS created_utc FROM orders o JOIN accounts a ON o.user_id=a.id WHERE o.activated IS NULL ORDER BY o.created').all());
  else if(cmd==='activate' && id) console.log(activate(db,id.trim().toUpperCase()));
  else throw Error('Использование: node billing.mjs list | activate НОМЕР');
} catch(e){ console.error(e.message);process.exitCode=1 } finally {db.close()}
