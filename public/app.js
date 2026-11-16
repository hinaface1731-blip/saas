import {catalog,demo,normalize,priceRow,lineKopecks,total,money} from './model.js';
import {documentContent} from './quote.js';

const $=s=>document.querySelector(s);
function el(tag,txt,cls) {const n=document.createElement(tag);if(txt!=null)n.textContent=txt;if(cls)n.className=cls;return n}
function button(label,cls,action){const b=el('button',label,cls);b.type='button';b.onclick=()=>run(b,action);return b}
function link(label,url,cls){const a=el('a',label,cls);a.href=url;a.target='_blank';a.rel='noreferrer';return a}
const modal=$('#modal'), content=$('#modal-body');
const date=n=>new Date(n).toLocaleDateString('ru-RU');
let session={user:null,contact:'FoolyQ',quotes:[]},doc,key,tab='editor',toastTimer;
function toast(msg){const n=$('#toast');n.textContent=msg;n.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>n.hidden=true,4000)}
function openDialog(title){$('#modal-title').textContent=title;$('#error').textContent='';content.className='dialog-stack';content.replaceChildren();if(!modal.open) modal.showModal()}
async function run(b,action){b.disabled=true;$('#error').textContent='';try{await action()}catch(e){if(modal.open)$('#error').textContent=e.message;else toast(e.message)}finally{b.disabled=false}}
function bind(id,action){const b=$(id);b.onclick=()=>run(b,action)}
async function api(path,data){
  const r=await fetch('/api'+path,data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  const v=await r.json();if(!r.ok)throw Object.assign(Error(v.error||'Ошибка запроса.'),{status:r.status});return v;
}
function draftId(){return 'faza-draft-v1:'+(session.user||'@guest')}
function loadDraft(fallback=demo,fallbackKey=crypto.randomUUID()){
  let saved;try{saved=JSON.parse(localStorage.getItem(draftId()))}catch{}
  doc=structuredClone(Array.isArray(saved?.doc?.items)?saved.doc:fallback);key=saved?.key||fallbackKey;
}
function markDraft(){ $('#draft-status').textContent=JSON.stringify(doc)===JSON.stringify(demo)?'Пример расчёта':'Черновик' }
function persist(changed=true){if(changed)key=crypto.randomUUID();markDraft();try{localStorage.setItem(draftId(),JSON.stringify({doc,key}))}catch{toast('Браузер не сохранил черновик на этом устройстве.')}}
function totals(){
  $('#sum').textContent=money(total(doc.items));$('#count').textContent=doc.items.length;
  for(const [i,row] of doc.items.entries()) $('#rows').children[i].querySelector('output').textContent=money(lineKopecks(row)/100);
}
function draw(){
  markDraft();
  for(const name of ['title','author','note']) {const input=$('#'+name);input.value=doc[name];input.oninput=()=>{doc[name]=input.value;persist()}}
  const rows=$('#rows');rows.replaceChildren();
  for(const [i,row] of doc.items.entries()){
    const wrap=el('div',null,'work-row');
    for(const [prop,label,max] of [['name','Наименование',120],['unit','Ед.',12],['qty','Объём',10000],['price','Цена, ₽',1000000]]){
      const box=el('label');box.append(el('span',label));const input=el('input');input.setAttribute('aria-label',label+' — работа '+(i+1));
      const num=prop==='qty'||prop==='price';
      if(num){input.type='number';input.min=prop==='qty'?'.01':'0';input.step='.01';input.max=max;input.inputMode='decimal'}else input.maxLength=max;
      input.value=row[prop];input.oninput=()=>{row[prop]=num?(input.value===''?'':Number(input.value)):input.value;totals();persist()};box.append(input);wrap.append(box);
    }
    const del=button('×','x',()=>{doc.items.splice(i,1);persist();draw()});del.setAttribute('aria-label','Удалить работу '+(i+1));
    wrap.append(el('output'),del);rows.append(wrap);
  }
  totals();
}
function select(name){tab=name;for(const t of ['editor','prices','archive'])$('#'+t).hidden=t!==name;
  for(const b of document.querySelectorAll('[data-tab]')){if(b.dataset.tab===name)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')}
  if(name==='prices')showPrices();if(name==='archive')history();
}
for(const b of document.querySelectorAll('[data-tab]'))b.onclick=()=>select(b.dataset.tab);
function refresh(){
  $('#account').textContent=session.user||'Войти';$('#help').href='https://t.me/'+session.contact;
  $('#allowance').textContent=session.paidUntil>Date.now()?'Тариф «Мастер» до '+date(session.paidUntil):session.quotes?.length?'Следующая публикация — по тарифу «Мастер».':'Первая смета по ссылке бесплатно.';
  select(tab);
}
function add(row){if(doc.items.length>=100)throw Error('В смете уже 100 позиций.');doc.items.push({...row,qty:1});persist();draw()}
function listPrices(root,pick){
  root.replaceChildren();for(const row of (session.prices?.length?session.prices:catalog)){
    const line=el('div',null,'record');const name=el('span',row.name), right=el('div',null,'record-action');right.append(el('span',money(row.price)+' / '+row.unit));
    const b=button('＋','outline small',()=>{add(row);if(modal.open)modal.close();select('editor');toast('Работа добавлена')});b.setAttribute('aria-label','Добавить '+row.name);
    if(pick)right.append(b);line.append(name,right);root.append(line);
  }
}
function showPrices(){$('#price-hint').textContent=session.prices?.length?'Ваши расценки. Добавляйте работы в смету кнопкой «＋».':'Пример прайса. Подставьте свои расценки перед отправкой заказчику.';listPrices($('#price-list'),true)}
function auth(after,register=false){
  openDialog(register?'Создать кабинет':'Войти в кабинет');
  const form=el('form',null,'dialog-stack');
  function field(label,type,autocomplete){const wrap=el('label',label),input=el('input');input.type=type;input.autocomplete=autocomplete;input.required=true;wrap.append(input);form.append(wrap);return input}
  const login=field('Логин','text','username'),pass=field('Пароль','password',register?'new-password':'current-password');login.maxLength=40;pass.minLength=8;pass.maxLength=128;
  if(register)form.append(el('p','Выберите логин от 3 символов и пароль от 8 символов. Сохраните их для входа с другого устройства.','dialog-note'));
  const submit=el('button',register?'Создать кабинет':'Войти','primary');submit.type='submit';form.append(submit);
  form.onsubmit=e=>{e.preventDefault();run(submit,async()=>{
    const guest=doc;
    session=await api(register?'/register':'/login',{login:login.value,password:pass.value});
    loadDraft(guest,key);persist(false);draw();refresh();modal.close();if(after)await after();
  })};
  content.append(form,button(register?'У меня уже есть кабинет':'Создать бесплатный кабинет','form-link',()=>auth(after,!register)));
}
function requireUser(fn){return session.user?fn():auth(fn,true)}
function account(){
  if(!session.user)return auth();
  openDialog(session.user);content.append(el('p',session.paidUntil>Date.now()?'Мастер до '+date(session.paidUntil):'Бесплатный кабинет','dialog-note'),
    button('Управление тарифом','primary',plan),button('Выйти','outline',async()=>{await api('/logout',{});session=await api('/me');loadDraft();draw();refresh();modal.close()}));
}
function plan(){
  openDialog('Тариф «Мастер»');content.append(el('h3','990 ₽ / 30 дней','price-big'),el('p','Публикуйте сметы по ссылке без ограничения на число отправок. При первом подключении поможем перенести ваш прайс и собрать смету по одному объекту.','dialog-note'),
    el('p','Первая публикация бесплатна. Созданные ссылки остаются доступны после окончания тарифа.','dialog-note'));
  if(session.paidUntil>Date.now())content.append(el('p','Доступ оплачен до '+date(session.paidUntil),'tag'));
  content.append(button(session.pending?'Открыть заказ':'Оформить заказ','primary',()=>requireUser(order)));
}
async function order(){
  const o=await api('/orders',{});session.pending=o.id;openDialog('Заказ на тариф «Мастер»');
  const msg='Хочу подключить Фазу на 30 дней за 990 ₽. Мой заказ '+o.id+'. Пришлите ссылку на оплату.';
  content.append(el('strong',o.id),el('p','Отправьте номер заказа в Telegram @'+o.contact+'. Владелец пришлёт реквизиты и включит доступ после подтверждения оплаты.','dialog-note'),
    link('Написать в Telegram ↗','https://t.me/'+o.contact+'?text='+encodeURIComponent(msg),'primary button-link'),
    button('Проверить доступ','outline',async()=>{session=await api('/me');refresh();if(!session.pending){modal.close();toast('Доступ активирован')}else toast('Заказ ожидает подтверждения оплаты')}));
}
function share(id){
  openDialog('Смета готова к отправке');const url=new URL('/q/'+id,location.origin).href;
  const input=el('input');input.readOnly=true;input.value=url;input.setAttribute('aria-label','Ссылка для заказчика');
  content.append(el('p','По этой ссылке заказчик увидит зафиксированные работы и цены. Документ можно распечатать или сохранить в PDF.','dialog-note'),input,
    button('Скопировать ссылку','primary',async()=>{try{await navigator.clipboard.writeText(url);toast('Ссылка скопирована')}catch{input.focus();input.select();toast('Ссылка выделена для копирования')}}),link('Открыть смету ↗',url,'outline button-link'));
}
async function publish(){
  const clean=normalize(doc), requestKey=key;
  if(!session.user)return auth(()=>sendQuote(clean,requestKey),true);
  return sendQuote(clean,requestKey);
}
async function sendQuote(clean,requestKey){
  try{const q=await api('/quotes',{doc:clean,key:requestKey});session=await api('/me');refresh();share(q.id)}
  catch(e){if(e.status===402){plan();$('#error').textContent=e.message}else throw e}
}
function importPrices(){
  openDialog('Импорт прайса');content.append(el('p','Скопируйте из Excel три столбца без шапки: название, единица и цена в рублях. Подойдут строки с табуляцией или точкой с запятой. Импорт заменит прайс в кабинете.','dialog-note'));
  const input=el('textarea');input.rows=7;input.placeholder='Монтаж розетки;шт;350\nПрокладка кабеля;м;120';input.setAttribute('aria-label','Строки прайса');content.append(input,button('Сохранить прайс','primary',async()=>{
    const rows=input.value.trim().split(/\r?\n/).filter(s=>s.trim()).map((s,i)=>{
      const parts=s.split(s.includes('\t')?'\t':';').map(v=>v.trim());
      if(parts.length!==3 || !/^\d+(?:[.,]\d{1,2})?$/.test(parts[2].replace(/\s/g,'')))throw Error('Проверьте три столбца в строке '+(i+1)+'.');
      return priceRow({name:parts[0],unit:parts[1],price:Number(parts[2].replace(/\s/g,'').replace(',','.'))});
    });
    if(!rows.length)throw Error('Вставьте строки прайса.');
    session.prices=(await api('/prices',{rows})).prices;modal.close();showPrices();toast('Прайс сохранён');
  }));
}
function history(){
  const root=$('#history');root.replaceChildren();
  if(!session.user){root.append(el('p','Войдите, чтобы открыть свои опубликованные сметы.','muted'),button('Войти','outline',()=>auth()));return}
  if(!session.quotes.length){root.append(el('p','Здесь появятся сметы, для которых вы получили ссылку.','muted'),button('Перейти в редактор','outline',()=>select('editor')));return}
  for(const q of session.quotes){const r=el('div',null,'record'),name=el('span',q.title);name.append(el('small',date(q.created)));r.append(name,button('Ссылка ↗','outline small',()=>share(q.id)));root.append(r)}
}
function preview(){
  const clean=normalize(doc);openDialog(clean.title);if(clean.author)content.append(el('p',clean.author,'dialog-note'));
  const result=el('div');documentContent(result,clean);content.append(result,button('Получить ссылку','primary',publish));
}
bind('#account',account);bind('#plan',plan);bind('#close-modal',()=>modal.close());bind('#publish',publish);bind('#preview',preview);
bind('#choose',()=>{openDialog('Добавить из прайса');const list=el('div');listPrices(list,true);content.append(list)});
bind('#import',()=>requireUser(importPrices));bind('#add',()=>{add({name:'',unit:'шт',price:0});$('#rows').lastElementChild.querySelector('input').focus()});
bind('#reset',()=>{openDialog('Начать пустую смету?');content.append(el('p','Текущий черновик на этом устройстве будет заменён. Опубликованные сметы доступны в архиве.','dialog-note'),button('Начать новую','primary',()=>{doc={title:'',author:doc.author,note:'',items:[]};persist();draw();modal.close();$('#title').focus()}))});
function scheme(){
  const ctx=$('#scheme').getContext('2d');if(!ctx)return;
  ctx.scale(2,2);ctx.fillStyle='#d2d9cb';for(let x=4;x<300;x+=10)for(let y=4;y<110;y+=10)ctx.fillRect(x,y,1,1);
  ctx.strokeStyle='#62816c';ctx.lineWidth=1.6;
  function path(points){ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke()}
  ctx.strokeRect(15,39,40,32);path([[55,55],[84,55],[84,26],[230,26]]);path([[84,55],[84,81],[230,81]]);
  for(const y of [26,81]){ctx.fillStyle='#f4f5f0';ctx.fillRect(119,y-6,22,12);ctx.strokeRect(119,y-6,22,12);ctx.beginPath();ctx.arc(240,y,10,0,2*Math.PI);ctx.stroke();path([[233,y-7],[247,y+7]]);path([[233,y+7],[247,y-7]])}
  ctx.fillStyle='#345c42';ctx.font='10px monospace';ctx.fillText('ЩР',28,59);ctx.fillText('QF1',120,15);ctx.fillText('QF2',120,100);
}
scheme();
try{session=await api('/me')}catch{toast('Не удалось загрузить кабинет. Проверьте соединение.')}
loadDraft();draw();refresh();
