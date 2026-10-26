/* JAAN warehouse exchange: pure three-way merge. No network or storage here. */
(function(root){
'use strict';
const FORMAT='jaan-warehouse-xlsx-v1',CLEAR='[очистить]';
const FIELDS=[
 ['sku','Артикул','required'],['name','Название','required'],['category','Категория','text'],['subcategory','Подкатегория','text'],
 ['purchasePrice','Закупочная цена','number'],['purchaseCurrency','Валюта закупки','currency'],['wholesalePrice','Опт BYN','number'],
 ['wholesaleUsd','Опт USD','nullable'],['retailPrice','Розница BYN','number'],['minStock','Минимальный остаток','integer'],
 ['zone','Зона склада','text'],['shelf','Полка','text'],['locationNote','Расположение','text'],['note','Комментарий','text']
];
const PRODUCT_HEADERS=[...FIELDS.map(f=>f[1]),'ID товара (не менять)'];
const VARIANT_HEADERS=['Артикул','Цвет / вариант','Остаток','ID товара (не менять)','ID варианта (не менять)'];
const LIMITS={products:10000,variants:30000,file:8*1024*1024,expanded:64*1024*1024};
const norm=s=>String(s??'').trim().replace(/\s+/g,' ').toLocaleLowerCase('ru');
const id=s=>typeof s==='string'&&/^[a-zA-Z0-9_.-]{1,160}$/.test(s);
const same=(a,b)=>a===b||(a==null&&b==null);
function value(p,key,type){if(type==='number'||type==='integer')return Number(p[key])||0;if(type==='nullable')return p[key]==null?null:Number(p[key]);return String(p[key]??'').trim()}
function snapshot(warehouse,createdAt,exportId){
 if(warehouse.length>LIMITS.products||warehouse.reduce((n,p)=>n+(p.variants||[]).length,0)>LIMITS.variants)throw Error('За один раз можно выгрузить до 10 000 товаров и 30 000 вариантов.');
 const products=[],variants=[];
 const sorted=[...warehouse].sort((a,b)=>[a.category,a.subcategory,a.name,a.sku].join('\0').localeCompare([b.category,b.subcategory,b.name,b.sku].join('\0'),'ru',{numeric:true}));
 for(const p of sorted){const fields={};for(const [key,,type] of FIELDS)fields[key]=value(p,key,type);products.push({id:p.id,fields});for(const v of p.variants||[])variants.push({id:v.id,productId:p.id,color:String(v.color||'Без цвета').trim(),qty:Number(v.qty)||0})}
 return {format:FORMAT,createdAt,exportId,products,variants};
}
function parse(raw,type,isNew){
 if(raw===null||raw===undefined||String(raw).trim()==='')return {skip:!isNew,value:type==='currency'?'RUB':type==='nullable'?null:type==='number'||type==='integer'?0:''};
 if(typeof raw==='object'||typeof raw==='boolean')throw Error('неверный тип ячейки');
 const s=String(raw).trim();if(s===CLEAR){if(type==='text')return {value:''};if(type==='nullable')return {value:null};throw Error('это поле нельзя очистить; для нулевой цены или остатка введите 0')}
 if(type==='number'||type==='integer'||type==='nullable'){
  const clean=s.replace(/[\s\u00a0\u202f]/g,'').replace(',','.');
  if(!/^\d+(?:\.\d+)?$/.test(clean))throw Error('нужно неотрицательное число');
  const n=Number(clean);if(!Number.isFinite(n)||n>999999999||(type==='integer'&&!Number.isSafeInteger(n)))throw Error(type==='integer'?'нужно целое число от 0 до 999999999':'слишком большое число');return {value:n};
 }
 if(type==='currency'){const v=s.toUpperCase();if(!['BYN','RUB'].includes(v))throw Error('допустимы RUB или BYN');return {value:v}}
 if(s.length>32000)throw Error('текст длиннее 32 000 символов');return {value:s};
}
function validateBase(model){
 if(model?.format!==FORMAT||!Array.isArray(model.products)||!Array.isArray(model.variants)||!Array.isArray(model.productRows)||!Array.isArray(model.variantRows)||typeof model.exportId!=='string'||!id(model.exportId))throw Error('Выберите Excel, сформированный кнопкой JAAN Print. Служебная вкладка должна сохраниться.');
 if(model.products.length>LIMITS.products||model.productRows.length>LIMITS.products||model.variants.length>LIMITS.variants||model.variantRows.length>LIMITS.variants)throw Error('Превышен лимит строк Excel.');
 const pids=new Set(),vkeys=new Set();
 for(const p of model.products){if(!id(p?.id)||pids.has(p.id)||!p.fields||typeof p.fields!=='object')throw Error('Повреждены служебные данные товаров.');pids.add(p.id);for(const [key,,type] of FIELDS){const v=p.fields[key];if(v===null&&type==='nullable')continue;if(['number','integer','nullable'].includes(type)){if(typeof v!=='number'||!Number.isFinite(v)||(type==='integer'&&(!Number.isSafeInteger(v)||v<0)))throw Error('Повреждено исходное число товара.')}else if(typeof v!=='string'||v.length>32000)throw Error('Повреждена исходная запись товара.')}}
 for(const v of model.variants){const key=v?.productId+'\0'+v?.id;if(!pids.has(v?.productId)||!id(v?.id)||vkeys.has(key)||typeof v.color!=='string'||!Number.isSafeInteger(v.qty)||v.qty<0)throw Error('Повреждены служебные данные вариантов.');vkeys.add(key)}
}
function plan(model,warehouse,options={}){
 validateBase(model);
 const errors=[],changes=[],stockChanges=[],warnings=[],next=warehouse.map(p=>({...p,variants:(p.variants||[]).map(v=>({...v}))}));
 const live=new Map(warehouse.map(p=>[p.id,p])),out=new Map(next.map(p=>[p.id,p])),base=new Map(model.products.map(p=>[p.id,p])),vb=new Map(model.variants.map(v=>[v.productId+'\0'+v.id,v]));
 const variantOut=new Map(next.flatMap(p=>p.variants.map(v=>[p.id+'\0'+v.id,v])));
 const seenP=new Set(),seenV=new Set(),newProducts=[],newSet=new Set(),newVariants=[],changedProducts=new Set();let ignoredStock=0;
 const err=(sheet,row,text)=>{if(errors.length<200)errors.push(`${sheet}, строка ${row}: ${text}`)};
 const change=(p,field,before,after)=>{changes.push({sku:p.sku,name:p.name,field,before,after});changedProducts.add(p.id)};
 for(const row of model.productRows){
  const rid=String(row.id??'').trim(),isNew=!rid,pid=isNew?'@p'+row.row:rid;
  if(seenP.has(pid)){err('Товары',row.row,'ID товара повторяется.');continue}seenP.add(pid);
  if(!isNew&&(!base.has(pid)||!live.has(pid))){err('Товары',row.row,'неизвестный ID или товар удалён после выгрузки. Сформируйте новый Excel.');continue}
  const p=isNew?{id:pid,variants:[],createdAt:null,photo:''}:out.get(pid),b=base.get(pid)?.fields,l=live.get(pid);
  if(isNew){for(const [key,,type] of FIELDS)p[key]=type==='nullable'?null:type==='number'||type==='integer'?0:type==='currency'?'RUB':'';p.minStock=5}
  for(const [key,label,type] of FIELDS){
   try{const raw=row.values?.[key];if(!isNew&&typeof raw==='string'&&typeof b[key]==='string'&&raw.trim()===b[key])continue;const parsed=parse(raw,type,isNew);if(parsed.skip||(isNew&&key==='minStock'&&String(raw??'').trim()===''))continue;
    const wanted=key==='category'?(parsed.value||'Без категории'):parsed.value;if(!isNew){if(same(wanted,b[key]))continue;const current=value(l,key,type);if(!same(current,b[key])&&!same(current,wanted)){err('Товары',row.row,`${label}: значение изменилось в приложении после выгрузки.`);continue}if(same(current,wanted))continue;change(p,label,current,wanted)}
    p[key]=wanted;
   }catch(e){err('Товары',row.row,`${label}: ${e.message}.`)}
  }
  if(!p.sku||!p.name)err('Товары',row.row,'обязательны артикул и название.');p.category=p.category||'Без категории';
  if(isNew){newProducts.push(pid);newSet.add(pid);next.push(p);out.set(pid,p);changes.push({sku:p.sku,name:p.name,field:'Новый товар',before:'',after:p.name})}
 }
 // Resolve new colour rows by the final SKU; IDs keep existing links through renames.
 const bySku=new Map();for(const p of next){const key=norm(p.sku);if(key&&bySku.has(key)){err('Товары','—',`артикул «${p.sku}» повторяется. Для существующего товара сохраните его ID.`)}else if(key)bySku.set(key,p)}
 for(const row of model.variantRows){
  const vid=String(row.id??'').trim(),pid=String(row.productId??'').trim(),isNew=!vid,p=pid?out.get(pid):bySku.get(norm(row.sku));
  if(!p){err('Цвета и остатки',row.row,'товар не найден. Для нового товара сначала добавьте строку во вкладку «Товары».');continue}
  if(!vid&&pid&&!base.has(pid)){err('Цвета и остатки',row.row,'неизвестный ID товара.');continue}
  const token=isNew?'@v'+row.row:vid,key=p.id+'\0'+token;if(seenV.has(key)){err('Цвета и остатки',row.row,'вариант повторяется.');continue}seenV.add(key);
  const b=vb.get(p.id+'\0'+vid),v=isNew?{id:token,color:'Без цвета',qty:0}:variantOut.get(p.id+'\0'+vid);
  if(!isNew&&(!pid||!b||!v)){err('Цвета и остатки',row.row,'неизвестный ID варианта или вариант удалён после выгрузки.');continue}
  try{
   const color=!isNew&&String(row.color??'').trim()===b.color?{skip:true}:parse(row.color,'text',isNew);if(!color.skip){const wanted=color.value||'Без цвета';if(isNew)v.color=wanted;else if(wanted!==b.color&&v.color!==wanted){if(v.color.trim()!==b.color)err('Цвета и остатки',row.row,'название варианта изменилось после выгрузки.');else{change(p,'Цвет / вариант',v.color,wanted);v.color=wanted}}}
   const q=parse(row.qty,'integer',isNew);if(!q.skip){const wanted=q.value,changed=isNew?wanted!==0:wanted!==b.qty;
    if(changed&&!options.stocks)ignoredStock++;
    if(changed&&options.stocks&&wanted!==v.qty){if(!isNew&&v.qty!==b.qty)err('Цвета и остатки',row.row,'остаток изменился после выгрузки. Сформируйте новый Excel.');else{const before=v.qty;stockChanges.push({productId:p.id,variantId:token,before,after:wanted,isNew});change(p,'Остаток · '+v.color,before,wanted);v.qty=wanted}}
   }
  }catch(e){err('Цвета и остатки',row.row,e.message+'.')}
  if(isNew){p.variants.push(v);newVariants.push({productId:p.id,id:token});change(p,'Новый вариант','',v.color)}
 }
 for(const p of next){
  if(newSet.has(p.id)&&!p.variants.length){const v={id:'@default',color:'Без цвета',qty:0};p.variants.push(v);newVariants.push({productId:p.id,id:v.id})}
  if(seenP.has(p.id)||changedProducts.has(p.id)){const colors=new Set();for(const v of p.variants){const n=norm(v.color);if(colors.has(n))err('Цвета и остатки','—',`у «${p.sku}» повторяется вариант «${v.color}».`);colors.add(n)}}
 }
 if(ignoredStock)warnings.push(`Остатки не будут изменены: ${ignoredStock}. Для их применения включите переключатель выше.`);
 if(next.length>LIMITS.products||next.reduce((n,p)=>n+p.variants.length,0)>LIMITS.variants)err('Товары','—','после импорта превышен лимит 10 000 товаров / 30 000 вариантов.');
 return {next,errors,changes,stockChanges,newProducts,newVariants,warnings,counts:{added:newProducts.length,updated:[...changedProducts].filter(id=>!newSet.has(id)).length,variants:newVariants.length,stocks:stockChanges.length},hasChanges:changes.length>0};
}
function materialize(plan,uid,now){
 if(plan.errors.length)throw Error('Исправьте ошибки файла.');const pmap=new Map(),vmap=new Map(),used=new Set(plan.next.flatMap(p=>[p.id,...p.variants.map(v=>v.id)]));
 const fresh=()=>{let n;do{n=uid()}while(used.has(n));used.add(n);return n};
 for(const pid of plan.newProducts)pmap.set(pid,fresh());for(const v of plan.newVariants)vmap.set(v.productId+'\0'+v.id,fresh());
 const warehouse=plan.next.map(p=>({...p,id:pmap.get(p.id)||p.id,createdAt:pmap.has(p.id)?now:p.createdAt,variants:p.variants.map(v=>({...v,id:vmap.get(p.id+'\0'+v.id)||v.id}))}));
 const movements=plan.stockChanges.map(x=>({id:fresh(),dateISO:now,type:x.isNew?'in':x.after>x.before?'adjustPlus':'adjustMinus',productId:pmap.get(x.productId)||x.productId,variantId:vmap.get(x.productId+'\0'+x.variantId)||x.variantId,qty:Math.abs(x.after-x.before),invoiceId:'',note:x.isNew?'Начальный остаток из Excel':'Инвентаризация из Excel'}));
 return {warehouse,movements};
}
root.JaanWarehouseExcel={FORMAT,CLEAR,FIELDS,PRODUCT_HEADERS,VARIANT_HEADERS,LIMITS,snapshot,plan,materialize};
})(typeof window!=='undefined'?window:globalThis);
