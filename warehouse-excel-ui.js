/* JAAN Excel workflow, integrated with the existing storage and cloud queue. */
(function(){
'use strict';
const E=window.JaanWarehouseExcel,$=id=>document.getElementById(id);
let token=0,worker=null,rejectWork=null,busy=false,sharing=false,model=null,review=null,reviewState='',exportFile=null,backupFile=null,focusBefore=null,historyToken=null;
const visible=()=>$('excelModal').classList.contains('show');
const abort=()=>new DOMException('Отменено','AbortError');
function check(t){if(t!==token||!visible())throw abort()}
function state(){return JSON.stringify(warehouseForStorage())}
function status(text){$('excelStatus').textContent=text}
function controls(){
 $('excelExport').disabled=busy; $('excelChoose').disabled=busy;
 $('excelSave').hidden=!exportFile;$('excelSave').disabled=busy||sharing;
 $('excelApply').disabled=busy||!review||!!review.errors.length||!review.hasChanges;
 $('excelStocks').disabled=busy;$('excelBackup').hidden=!backupFile;$('excelBackup').disabled=busy||sharing;
}
function stop(){worker?.terminate();worker=null;if(rejectWork){const reject=rejectWork;rejectWork=null;reject(abort())}}
function close(fromHistory=false){
 if(!visible())return;token++;stop();busy=false;model=null;review=null;exportFile=null;backupFile=null;sharing=false;
 $('excelModal').classList.remove('show');$('excelModal').setAttribute('aria-hidden','true');$('excelPreview').replaceChildren();
 if(!fromHistory&&window.history.state?.jaanExcel===historyToken)window.history.back();historyToken=null;focusBefore?.focus?.();
}
async function open(){
 token++;const t=token;focusBefore=document.activeElement;busy=true;model=null;review=null;exportFile=null;backupFile=null;
 $('excelStocks').checked=false;$('excelFile').value='';$('excelPreview').replaceChildren();
 $('excelModal').classList.add('show');$('excelModal').setAttribute('aria-hidden','false');
 historyToken='xl-'+Date.now();try{window.history.pushState({...window.history.state,jaanExcel:historyToken},'')}catch{historyToken=null}
 status('Подготовка склада…');controls();$('closeExcel').focus();
 try{await window.jaanStartupReady;check(t);status('Выгрузите склад или выберите изменённый файл XLSX.');const backup=await backupStore('get');check(t);if(backup)backupFile=makeBackupFile(backup)}catch(e){if(e.name!=='AbortError')status('Не удалось прочитать данные: '+e.message)}finally{if(t===token){busy=false;controls()}}
}
function run(action,data){
 return new Promise((resolve,reject)=>{
  let done=false;const finish=(error,result)=>{if(done)return;done=true;clearTimeout(timer);worker?.terminate();worker=null;rejectWork=null;error?reject(error):resolve(result)};
  const timer=setTimeout(()=>finish(Error('Обработка заняла слишком много времени. Уменьшите книгу и повторите.')),90000);
  rejectWork=error=>finish(error);
  try{worker=new Worker('warehouse-excel-worker.js');worker.onerror=()=>finish(Error('Не удалось загрузить модуль Excel. Обновите приложение при подключённом интернете.'));worker.onmessage=e=>{const r=e.data;r.ok?finish(null,r):finish(Error(r.error))};worker.postMessage({action,...data},data.bytes?[data.bytes]:[])}catch(e){finish(e)}
 });
}
async function cloudCheck(){
 if(cloudSaving||cloudReceiving||productSaving||historySaveBusy)throw Error('Дождитесь завершения сохранения или синхронизации и повторите.');
 if(cloudConflictState)throw Error('Сначала разрешите конфликт в окне облачной синхронизации.');
 if(cloudUser()&&navigator.onLine){if(!cloudReady)throw Error('Сначала завершите подключение к облаку.');const remote=await cloudGetRemote(true);if(Number(remote?.revision||0)!==cloudRevision)throw Error('В облаке есть другая версия склада. Закройте Excel, синхронизируйте приложение и повторите.');}
 if(cloudSaving||cloudReceiving)throw Error('Дождитесь завершения синхронизации и повторите.');
}
async function exportExcel(){
 if(busy)return;const t=token;busy=true;exportFile=null;controls();status('Формирование Excel…');
 try{await cloudCheck();check(t);const now=new Date(),snapshot=E.snapshot(warehouse,now.toISOString(),crypto.randomUUID?.()||uid());const r=await run('encode',{snapshot});check(t);
  const name='JAAN_warehouse_'+localDay(now)+'_'+[now.getHours(),now.getMinutes(),now.getSeconds()].map(n=>String(n).padStart(2,'0')).join('-')+'.xlsx';
  exportFile=new File([r.bytes],name,{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});status('Excel готов. Нажмите «Сохранить Excel».');
 }catch(e){if(e.name!=='AbortError')status(e.message)}finally{if(t===token){busy=false;controls()}}
}
function saveFile(file){
 if(!file||sharing||busy)return;const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);let canShare=false;
 try{canShare=ios&&typeof navigator.share==='function'&&navigator.canShare?.({files:[file]})}catch{}
 if(canShare){sharing=true;controls();let promise;try{promise=navigator.share({files:[file],title:file.name})}catch(e){sharing=false;controls();status(e.message);return}
  const t=token;Promise.resolve(promise).then(()=>{if(t===token)status('Файл передан в выбранное приложение.')}).catch(e=>{if(t===token&&e.name!=='AbortError')status('Не удалось передать файл: '+e.message)}).finally(()=>{if(t===token){sharing=false;controls()}});return;
 }
 const url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download=file.name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);status('Файл передан на скачивание.');
}
async function importExcel(file){
 if(busy||!file)return;const t=token;busy=true;model=null;review=null;exportFile=null;$('excelPreview').replaceChildren();controls();status('Чтение и проверка Excel…');
 try{if(!/\.xlsx$/i.test(file.name)||file.size>E.LIMITS.file)throw Error('Выберите файл .xlsx размером не более 8 МБ.');const bytes=await file.arrayBuffer();check(t);const r=await run('decode',{bytes});check(t);model=r.model;buildReview();}
 catch(e){if(e.name!=='AbortError')status('Excel не загружен: '+e.message)}finally{if(t===token){busy=false;controls()}}
}
function line(text,kind){const p=document.createElement('p');p.className=kind||'';p.textContent=text;return p}
function buildReview(){
 const box=$('excelPreview');box.replaceChildren();review=null;
 try{review=E.plan(model,warehouse,{stocks:$('excelStocks').checked});reviewState=state();const c=review.counts;
  box.append(line(`Новых товаров: ${c.added} · Изменённых: ${c.updated} · Новых цветов: ${c.variants} · Остатков: ${c.stocks}`,'excel-summary'));
  for(const w of review.warnings)box.append(line(w,'excel-warning'));
  if(review.errors.length){box.append(line('Ошибки: '+review.errors.length+(review.errors.length===200?' или больше':''),'excel-error'));for(const e of review.errors)box.append(line(e,'excel-error'));status('Исправьте ошибки в Excel и загрузите файл заново. Ничего не изменено.');}
  else status(review.hasChanges?'Проверьте изменения ниже. Перед применением будет создана копия данных.':'Изменений для применения нет.');
  const display=value=>typeof value==='number'?value.toLocaleString('ru-RU',{maximumFractionDigits:6}):String(value??'—');
  for(const x of review.changes.slice(0,100)){const item=document.createElement('div');item.className='excel-change';const title=document.createElement('strong');title.textContent=x.sku+' · '+x.name;item.append(title,line(x.field+': '+display(x.before)+' → '+display(x.after)));box.append(item)}
  if(review.changes.length>100)box.append(line('Ещё изменений: '+(review.changes.length-100)+'.'));
 }catch(e){status('Ошибка проверки: '+e.message)}controls();
}
function backupStore(action,data){
 return new Promise((resolve,reject)=>{
  let db=null,tx=null,done=false;
  const finish=(error,result)=>{if(done)return;done=true;clearTimeout(timer);db?.close();error?reject(error):resolve(result)};
  const timer=setTimeout(()=>{try{tx?.abort()}catch{}finish(Error('Хранилище копии не отвечает. Закройте другие окна приложения и повторите.'))},15000);
  let req;try{req=indexedDB.open('jaan-excel-safety-v1',1)}catch(e){finish(Error('Резервное хранилище недоступно.'));return}
  req.onupgradeneeded=()=>{req.result.createObjectStore('snapshots')};req.onerror=()=>finish(Error('Не удалось открыть хранилище резервной копии.'));
  req.onsuccess=()=>{db=req.result;if(done){db.close();return}try{let result=null;tx=db.transaction('snapshots',action==='put'?'readwrite':'readonly');const store=tx.objectStore('snapshots'),r=action==='put'?store.put(data,'latest'):store.get('latest');r.onsuccess=()=>{result=r.result};tx.oncomplete=()=>finish(null,action==='put'?data:result);tx.onabort=tx.onerror=()=>finish(Error('Не удалось сохранить резервную копию. Проверьте свободное место на iPhone.'));}catch(e){finish(Error('Не удалось сохранить резервную копию. Проверьте свободное место на iPhone.'))}};
 });
}
function makeBackupFile(data){
 let output=data;
 if(data.photoMode==='current-on-download'){
  const products=new Map(warehouse.map(p=>[p.id,p])),clients=new Map(customers.map(c=>[c.id,c]));
  const withPhoto=(saved,current)=>({...saved,photo:current?.photo||'',localPhotoKey:'',cloudPhotoPath:current?.cloudPhotoPath||'',photoFingerprint:current?.photoFingerprint||''});
  output={...data,warehouse:data.warehouse.map(p=>withPhoto(p,products.get(p.id))),customers:data.customers.map(c=>withPhoto(c,clients.get(c.id)))};delete output.photoMode;
 }
 return new File([JSON.stringify(output)],'JAAN_before_excel_'+String(data.createdAt).replace(/[:.]/g,'-')+'.json',{type:'application/json'});
}
async function applyExcel(){
 if(busy||!review||review.errors.length||!review.hasChanges)return;
 if(window.jaanExcelWriting){status('Дождитесь завершения предыдущей операции.');return}
 const lock={};window.jaanExcelWriting=lock;const t=token;busy=true;controls();status('Проверка склада и сохранение резервной копии…');
 try{
  await cloudCheck();check(t);if(state()!==reviewState){buildReview();throw Error('Склад изменился. Предпросмотр обновлён — проверьте его и нажмите «Применить изменения» ещё раз.');}
  const seq=cloudChangeSeq;let plan=E.plan(model,warehouse,{stocks:$('excelStocks').checked});if(plan.errors.length)throw Error('Появились расхождения склада. Загрузите файл заново.');
  await Promise.all([hydrateCustomerPhotos(true),hydrateAndMigrateProductPhotos(true)]);check(t);
  if(seq!==cloudChangeSeq||state()!==reviewState)throw Error('Данные изменились во время подготовки. Загрузите файл ещё раз.');
  // Hydration may fill photo bytes without changing the persisted business state.
  // Merge again so the committed products keep those newly loaded photographs.
  plan=E.plan(model,warehouse,{stocks:$('excelStocks').checked});
  const backup={format:'jaan-backup-v1',createdAt:new Date().toISOString(),version:APP_VERSION+'-before-excel',warehouse:JSON.parse(JSON.stringify(warehouse.map(p=>({...p,photo:''})))),movements:JSON.parse(JSON.stringify(movements)),history:JSON.parse(JSON.stringify(history)),customers:JSON.parse(JSON.stringify(customers.map(c=>({...c,photo:''}))))};
  // Excel never changes images. Keep only business data in the durable snapshot:
  // otherwise a later AI replacement would leave an archived original here.
  // A downloaded JSON receives the photographs currently held by the app.
  const stripPhoto=entity=>({...entity,photo:''});
  const storedBackup={...backup,photoMode:'current-on-download',warehouse:backup.warehouse.map(stripPhoto),customers:backup.customers.map(stripPhoto)};
  await backupStore('put',storedBackup);check(t);backupFile=makeBackupFile(storedBackup);
  if(seq!==cloudChangeSeq||state()!==reviewState)throw Error('Данные изменились во время создания копии. Загрузите файл ещё раз.');
  const result=E.materialize(plan,uid,new Date().toISOString()),beforeWarehouse=warehouse,beforeMovements=movements;
  warehouse=result.warehouse;movements=[...result.movements.reverse(),...movements];
  if(!persistCoreState()){warehouse=beforeWarehouse;movements=beforeMovements;throw Error('Не удалось сохранить импорт. Все изменения отменены.');}
  const c=plan.counts;model=null;review=null;exportFile=null;$('excelPreview').replaceChildren();renderWarehouse();renderWarehouseAnalytics();renderMovements();render();
  status(`Готово. Добавлено товаров: ${c.added}, обновлено: ${c.updated}. Копия до импорта доступна кнопкой ниже.`);toast('Склад обновлён из Excel');
 }catch(e){if(e.name!=='AbortError')status(e.message)}finally{if(window.jaanExcelWriting===lock){window.jaanExcelWriting=null;if(cloudDirty&&cloudReady)setTimeout(()=>cloudPushLocal(false),0)}if(t===token){busy=false;controls()}}
}
$('excelBtn').onclick=open;$('closeExcel').onclick=()=>close();$('excelExport').onclick=exportExcel;$('excelSave').onclick=()=>saveFile(exportFile);$('excelBackup').onclick=()=>saveFile(backupFile);
$('excelChoose').onclick=()=>$('excelFile').click();$('excelFile').onchange=e=>{const file=e.target.files?.[0];e.target.value='';if(file)importExcel(file)};
$('excelStocks').onchange=()=>{if(model)buildReview()};$('excelApply').onclick=applyExcel;
$('excelModal').addEventListener('click',e=>{if(e.target===$('excelModal'))close()});
document.addEventListener('keydown',e=>{if(!visible())return;if(e.key==='Escape'){e.preventDefault();close()}else if(e.key==='Tab'){const all=[...$('excelModal').querySelectorAll('button:not(:disabled),input:not(:disabled)')].filter(x=>!x.hidden&&x.getClientRects().length);const i=all.indexOf(document.activeElement);if(e.shiftKey&&i<=0){e.preventDefault();all[all.length-1]?.focus()}else if(!e.shiftKey&&(i<0||i===all.length-1)){e.preventDefault();all[0]?.focus()}}});
window.addEventListener('popstate',e=>{if(visible()&&e.state?.jaanExcel!==historyToken)close(true)});
window.JaanExcelUI={open,close,importExcel,exportExcel,applyExcel,backupStore};
})();
