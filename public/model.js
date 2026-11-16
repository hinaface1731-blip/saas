export const catalog = [
  {name:'Штробление стен', unit:'м', price:450},
  {name:'Прокладка кабеля', unit:'м', price:120},
  {name:'Монтаж подрозетника', unit:'шт', price:350},
  {name:'Установка розетки', unit:'шт', price:300},
  {name:'Сборка квартирного щита', unit:'компл', price:6500},
  {name:'Монтаж светильника', unit:'шт', price:750}
];
export const demo = {title:'Электрика в двухкомнатной квартире', author:'', note:'',
  items:catalog.slice(0,4).map((row,i)=>({...row, qty:[28,90,18,18][i]}))};
export const money = value => new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',minimumFractionDigits:0,maximumFractionDigits:2}).format(value);
export function lineKopecks(row) {
  return Math.round(Math.round(Number(row.qty)*100) * Math.round(Number(row.price)*100) / 100);
}
export function total(items) {return items.reduce((sum,row)=>sum+lineKopecks(row),0)/100}
function field(value, max, required=false) {
  if(typeof value!=='string' || value.trim().length>max || (required && !value.trim())) throw Error('Проверьте текстовые поля.');
  return value.trim();
}
function numeric(value, min, max) {
  if(typeof value!=='number' || !Number.isFinite(value) || value<min || value>max || Math.abs(value*100-Math.round(value*100))>0.00001) throw Error('Проверьте количество и цены. Допустимо два знака после запятой.');
  return value;
}
export function priceRow(row) {
  return {name:field(row?.name,120,true),unit:field(row.unit,12,true),price:numeric(row.price,0,1000000)};
}
export function normalize(doc) {
  if(!Array.isArray(doc?.items) || !doc.items.length || doc.items.length>100) throw Error('В смете должно быть от 1 до 100 позиций.');
  return {title:field(doc.title,120,true),author:field(doc.author,100),note:field(doc.note,1000),
    items:doc.items.map(row=>({...priceRow(row),qty:numeric(row.qty,0.01,10000)}))};
}
