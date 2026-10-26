/* Self-hosted XLSX codec. Work is isolated from the PWA interface. */
'use strict';
importScripts('vendor/xlsx.mini.min.js','warehouse-excel.js');
const E=JaanWarehouseExcel,META='JAAN_служебная';
function checkZip(buffer){
 const b=new Uint8Array(buffer),d=new DataView(b.buffer,b.byteOffset,b.byteLength);
 if(b.length>E.LIMITS.file||b.length<22)throw Error('Размер Excel должен быть не более 8 МБ.');
 let end=-1;for(let i=b.length-22;i>=Math.max(0,b.length-65557);i--)if(d.getUint32(i,true)===0x06054b50&&i+22+d.getUint16(i+20,true)===b.length){end=i;break}
 if(end<0||d.getUint16(end+4,true)||d.getUint16(end+6,true))throw Error('Файл не является обычной книгой XLSX.');
 const n=d.getUint16(end+10,true),size=d.getUint32(end+12,true),start=d.getUint32(end+16,true);
 if(n>512||n===65535||start+size!==end)throw Error('Неподдерживаемая или слишком сложная книга Excel.');
 let pos=start,total=0;const names=new Set();
 for(let i=0;i<n;i++){
  if(pos+46>end||d.getUint32(pos,true)!==0x02014b50)throw Error('Повреждён архив XLSX.');
  const flags=d.getUint16(pos+8,true),method=d.getUint16(pos+10,true),packed=d.getUint32(pos+20,true),unpacked=d.getUint32(pos+24,true),nl=d.getUint16(pos+28,true),el=d.getUint16(pos+30,true),cl=d.getUint16(pos+32,true);
  if(pos+46+nl+el+cl>end)throw Error('Повреждена структура XLSX.');
  const name=new TextDecoder().decode(b.subarray(pos+46,pos+46+nl));
  if(names.has(name)||name.includes('..')||name.startsWith('/')||name.includes('\\')||name.includes('\0')||flags&1||![0,8].includes(method)||packed>E.LIMITS.file||unpacked>32*1024*1024)throw Error('Неподдерживаемая структура Excel или защищённый файл.');
  if(/vbaProject|externalLinks\//i.test(name))throw Error('Сохраните копию XLSX без макросов и внешних связей.');
  names.add(name);total+=unpacked;if(total>E.LIMITS.expanded)throw Error('Распакованная книга слишком велика (лимит 64 МБ).');pos+=46+nl+el+cl;
 }
 if(pos!==end||!names.has('xl/workbook.xml')||!names.has('[Content_Types].xml'))throw Error('Выберите файл XLSX, сформированный JAAN Print.');
}
function sheet(rows,widths){const s=XLSX.utils.aoa_to_sheet(rows);s['!cols']=widths.map(wch=>({wch}));if(rows.length>1)s['!autofilter']={ref:XLSX.utils.encode_range({r:0,c:0},{r:rows.length-1,c:rows[0].length-1})};return s}
function encode(snapshot){
 const w=XLSX.utils.book_new(),pmap=new Map(snapshot.products.map(p=>[p.id,p]));
 const prows=[E.PRODUCT_HEADERS,...snapshot.products.map(p=>[...E.FIELDS.map(([key])=>p.fields[key]??''),p.id])];
 const ps=sheet(prows,[20,38,23,23,19,19,17,17,19,23,20,16,30,42,22]);ps['!cols'][14].hidden=true;
 const vrows=[E.VARIANT_HEADERS,...snapshot.variants.map(v=>[pmap.get(v.productId).fields.sku,v.color,v.qty,v.productId,v.id])];
 const vs=sheet(vrows,[20,28,18,22,22]);vs['!cols'][3].hidden=true;vs['!cols'][4].hidden=true;
 for(let r=1;r<prows.length;r++){for(const c of [4,6,7,8]){const cell=ps[XLSX.utils.encode_cell({r,c})];if(cell?.t==='n')cell.z=c===7?'0.000':'0.00'}const sku=ps['A'+(r+1)];if(sku)sku.z='@'}
 for(let r=1;r<vrows.length;r++)vs['A'+(r+1)].z='@';
 XLSX.utils.book_append_sheet(w,ps,'Товары');XLSX.utils.book_append_sheet(w,vs,'Цвета и остатки');
 const notes=[['JAAN Print — редактирование склада в Excel'],['Сформировано',snapshot.createdAt],
  ['Товары отсортированы по категориям и подкатегориям. Для отбора используйте фильтры первой строки.'],
  ['Редактируйте данные в двух первых вкладках. Заголовки и служебные вкладки должны сохраниться.'],
  ['Новый товар: добавьте строку на вкладке «Товары»; заполните артикул и название. Скрытый ID оставьте пустым.'],
  ['Цвета нового товара добавьте на вкладке «Цвета и остатки», укажите тот же артикул; оба ID оставьте пустыми.'],
  ['Если цвет не указан, новый товар получит вариант «Без цвета» с нулевым остатком.'],
  ['Существующий товар / цвет: редактируйте его строку, сохранив скрытые ID. Для копии товара нужны пустые ID и новый артикул.'],
  ['Удалённая строка не удаляет товар или цвет из приложения.'],
  ['Пустая ячейка существующей позиции означает «не изменять». Нулевая цена / остаток задаётся числом 0.'],
  ['Чтобы очистить необязательное текстовое поле или цену «Опт USD», впишите [очистить].'],
  ['Количество применяется только с переключателем «Обновить остатки» в приложении; начальные остатки новых товаров тоже.'],
  ['Цены: закупка в указанной валюте RUB/BYN; опт BYN, опт USD и розница BYN — отдельные цены.'],
  ['Артикулы — текст. Сохраняйте ведущие нули. Не преобразовывайте колонку артикулов в числа.'],
  ['Формулы цен и количеств принимаются по рассчитанному значению, сохранённому Excel. Пересчитайте книгу перед сохранением.'],
  ['Фотографии в Excel не входят и при загрузке сохраняются.'],
  ['Сохраните книгу как .xlsx. В приложении проверьте предпросмотр и нажмите «Применить изменения».'],
  ['Изменения, сделанные на складе после выгрузки, проверяются перед применением. При конфликте сформируйте свежий файл.'],
  ['Лимиты: 10 000 товаров, 30 000 вариантов, файл до 8 МБ.']];
 const ns=sheet(notes,[115,30]);delete ns['!autofilter'];XLSX.utils.book_append_sheet(w,ns,'Инструкция');
 const meta=[[E.FORMAT,snapshot.exportId,snapshot.createdAt],...snapshot.products.map(p=>['P',p.id,JSON.stringify(p.fields)]),...snapshot.variants.map(v=>['V',v.id,JSON.stringify(v)])];
 XLSX.utils.book_append_sheet(w,XLSX.utils.aoa_to_sheet(meta),META);
 w.Workbook={Sheets:[{name:'Товары',Hidden:0},{name:'Цвета и остатки',Hidden:0},{name:'Инструкция',Hidden:0},{name:META,Hidden:2}]};
 w.Props={Title:'JAAN — Склад',Subject:'Товары, цвета и остатки',Author:'JAAN Print',CreatedDate:new Date(snapshot.createdAt)};
 const bytes=XLSX.write(w,{type:'array',bookType:'xlsx',compression:true});if(bytes.byteLength>E.LIMITS.file)throw Error('Полученный Excel больше 8 МБ.');return bytes;
}
function grid(sheet,limit){
 if(!sheet)throw Error('В книге отсутствует обязательная вкладка.');
 const range=XLSX.utils.decode_range(sheet['!ref']||'A1');if(range.e.r>limit||range.e.c>30)throw Error('Превышено число строк или колонок Excel.');return range;
}
function editable(sheet,headers,limit){
 const range=grid(sheet,limit),columns=new Map();
 for(let c=0;c<=range.e.c;c++){const v=sheet[XLSX.utils.encode_cell({r:0,c})]?.v;if(v!=null){const name=String(v).trim();if(columns.has(name))throw Error('Заголовок «'+name+'» повторяется.');columns.set(name,c)}}
 for(const name of headers)if(!columns.has(name))throw Error('Не найдена колонка «'+name+'». Сохраните заголовки выгрузки.');
 const rows=[];
 for(let r=1;r<=range.e.r;r++){
  const row=headers.map(h=>{const cell=sheet[XLSX.utils.encode_cell({r,c:columns.get(h)})];if(cell?.t==='e')throw Error(`Строка ${r+1}: исправьте ошибку Excel в колонке «${h}».`);if(cell?.f&&(cell.v==null||cell.t!=='n'))throw Error(`Строка ${r+1}: замените формулу в «${h}» рассчитанным числом.`);if(cell?.t==='d')throw Error(`Строка ${r+1}: дата вместо значения в «${h}».`);return cell?.v??null});
  if(row.some(v=>v!=null&&String(v).trim()!==''))rows.push({row:r+1,cells:row});
 }
 return rows;
}
function decode(bytes){
 checkZip(bytes);const w=XLSX.read(bytes,{type:'array',cellFormula:true,cellDates:true,cellHTML:false,cellStyles:false,bookVBA:false,sheetRows:E.LIMITS.products+E.LIMITS.variants+2});
 if(w.SheetNames.length>10)throw Error('Слишком много вкладок.');
 const m=w.Sheets[META];grid(m,E.LIMITS.products+E.LIMITS.variants);
 const data=XLSX.utils.sheet_to_json(m,{header:1,raw:true,defval:null});
 if(data[0]?.[0]!==E.FORMAT)throw Error('Служебная вкладка отсутствует или повреждена. Выгрузите новый Excel.');
 const model={format:E.FORMAT,exportId:data[0][1],createdAt:data[0][2],products:[],variants:[]};
 for(const row of data.slice(1)){if(row[0]==='P')model.products.push({id:row[1],fields:JSON.parse(row[2])});else if(row[0]==='V'){const v=JSON.parse(row[2]);if(v.id!==row[1])throw Error('Повреждён ID исходного варианта.');model.variants.push(v)}else if(row.some(x=>x!=null))throw Error('Неизвестная служебная запись.');}
 model.productRows=editable(w.Sheets['Товары'],E.PRODUCT_HEADERS,E.LIMITS.products).map(({row,cells})=>({row,id:cells[14],values:Object.fromEntries(E.FIELDS.map(([key],i)=>[key,cells[i]]))}));
 model.variantRows=editable(w.Sheets['Цвета и остатки'],E.VARIANT_HEADERS,E.LIMITS.variants).map(({row,cells})=>({row,sku:cells[0],color:cells[1],qty:cells[2],productId:cells[3],id:cells[4]}));
 return model;
}
self.onmessage=e=>{try{if(e.data.action==='encode'){const bytes=encode(e.data.snapshot);self.postMessage({ok:true,bytes},[bytes])}else if(e.data.action==='decode'){self.postMessage({ok:true,model:decode(e.data.bytes)})}else throw Error('Неизвестная операция.')}catch(error){self.postMessage({ok:false,error:error.message||'Не удалось прочитать Excel.'})}};
