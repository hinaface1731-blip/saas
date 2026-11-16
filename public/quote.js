import {money,total,lineKopecks} from './model.js';
export function documentContent(root,doc) {
  root.replaceChildren();
  const table=document.createElement('table');table.className='quote-table';
  const head=table.createTHead().insertRow();
  for(const label of ['Работа','Объём','Цена','Сумма']) {const cell=document.createElement('th');cell.textContent=label;head.append(cell)}
  const body=table.createTBody();
  for(const row of doc.items) {const tr=body.insertRow();for(const v of [row.name,row.qty+' '+row.unit,money(row.price),money(lineKopecks(row)/100)]) tr.insertCell().textContent=v}
  const sum=document.createElement('h2');sum.className='document-sum';sum.textContent='Итого '+money(total(doc.items));root.append(table,sum);
  if(doc.note){const p=document.createElement('p');p.className='preserve';p.textContent=doc.note;root.append(p)}
}
if(location.pathname.startsWith('/q/')) {
  try {
    const response=await fetch('/api'+location.pathname), q=await response.json();
    if(!response.ok) throw Error(q.error);
    document.title=q.doc.title+' — Фаза';
    document.querySelector('#date').textContent=q.created?'Смета от '+new Date(q.created).toLocaleDateString('ru-RU'):'Пример сметы';
    document.querySelector('#title').textContent=q.doc.title;
    document.querySelector('#author').textContent=q.doc.author;
    documentContent(document.querySelector('#details'),q.doc);
    const print=document.querySelector('#print');print.hidden=false;print.onclick=()=>window.print();
  } catch(e){document.querySelector('#title').textContent=e.message}
}
