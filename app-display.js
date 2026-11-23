(function(){
 'use strict';
 const viewport = parent.JaanViewport;
 if (viewport) {
  history.scrollRestoration = 'manual';
  document.addEventListener('focusin', viewport.update);
  document.addEventListener('focusout', () => requestAnimationFrame(viewport.update));
  viewport.update();
 }
 window.jaanCloudKeyAccount=()=>cloudUser()?{owner:cloudUser().id,email:cloudUser().email||''}:null;
 window.jaanRenewCloudRecovery=async secret=>{
  const user=cloudUser();if(!user)throw Error('Сначала войдите в облачный аккаунт');if(!navigator.onLine)throw Error('Для активации ключа облачной базы нужен интернет');
  if(cloudSaving||cloudReceiving||cloudRefreshPromise)throw Error('Дождитесь завершения синхронизации и повторите');
  if(cloudDirty||cloudConflictState)throw Error('Перед сменой ключа завершите синхронизацию и разрешите конфликт данных');
  cloudReceiving=true;let prepared=null,baseRevision=0;const seq=cloudChangeSeq;
  const fetchRecord=async()=>{const r=await cloudApi('/rest/v1/jaan_state?select=revision,state,device_name,updated_at&limit=1',{headers:{Accept:'application/json'}});return (await r.json())[0]||null};
  const accept=async(record,knownRevision=false)=>{await JaanVault.readCloud(user.id,record.state);if(knownRevision&&cloudRevision===baseRevision)cloudRememberRevision(record.revision);cloudSetStatus('online','Ключ облачной базы обновлён','Сохраните новый ключ отдельно от устройства.');return true};
  try{
   const record=await fetchRecord();if(!record||record.state?.format!=='jaan-encrypted-state-v1')throw Error('Сначала подключите и синхронизируйте зашифрованную облачную базу');
   baseRevision=Number(record.revision)||0;if(cloudRevision!==baseRevision)throw Error('В облаке есть новые изменения. Получите их на телефон перед сменой ключа');
   prepared=await JaanVault.prepareCloudRecovery(user.id,record.state,secret);if(seq!==cloudChangeSeq||cloudDirty)throw Error('Данные на телефоне изменились. Сначала синхронизируйте их и повторите');
   const r=await cloudApi('/rest/v1/rpc/jaan_save_state',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({p_expected_revision:baseRevision,p_state:prepared,p_device_name:record.device_name||'Зашифрованное устройство'})}),result=(await r.json())[0];
   if(!result?.saved)throw Error('База изменилась на другом устройстве. Новый ключ не активирован; получите свежие данные и повторите');
   return await accept({revision:result.new_revision,state:prepared},true);
  }catch(error){
   // A lost response must not strand an already committed recovery key.
   if(prepared&&JaanVault.isUnlocked())try{const current=await fetchRecord();if(current?.state?.keyId===prepared.keyId)return await accept(current,Number(current.revision)===baseRevision+1)}catch{}
   throw error;
  }finally{cloudReceiving=false}
 };
})();
