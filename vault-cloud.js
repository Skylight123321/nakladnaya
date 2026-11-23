/* Cloud recovery is independent of the local calculator code. All saved key
   material goes through the encrypted vault, never browser localStorage. */
(function(root){
 'use strict';
 const C=root.JaanCrypto,RING='jaan-e2ee-cloud-keys-v1',INTERNAL='_jaanRecovery';
 class CloudKeys{
  constructor(store,code,request){this.store=store;this.code=code;this.request=request}
  assert(){this.store.assert()}
  owner(owner){if(!/^[a-f0-9-]{20,}$/.test(owner))throw Error('Некорректный облачный аккаунт')}
  ring(){this.assert();try{return JSON.parse(this.store.storage.getItem(RING)||'{}')}catch{throw Error('Не удалось прочитать сохранённое подключение к облаку. Сохраните резервную копию.')}}
  async save(owner,entry){this.assert();const ring=this.ring();ring[owner]=entry;const value=JSON.stringify(ring);if(this.store.storage.getItem(RING)!==value)this.store.storage.setItem(RING,value);await this.store.drain();this.assert()}
  async entry(owner){this.owner(owner);let entry=this.ring()[owner];if(!entry){const raw=C.bytes(32);try{const secret=C.recovery(),access={...await C.access(raw,C.b64(C.bytes(32)),secret),policy:'cloud-recovery-v1'};this.assert();entry={raw:C.b64(raw),access,secret,encryptedSeen:false};await this.save(owner,entry)}finally{raw.fill(0)}}return entry}
  info(owner){this.owner(owner);const entry=this.ring()[owner];return {connected:!!entry?.encryptedSeen,key:entry?.secret||'',keyId:entry?.access.id||''}}
  async matchingSecret(access,raw,candidates){for(const secret of candidates.filter(Boolean)){let candidate;try{candidate=await C.unlock(access,secret,true);this.assert();if(C.b64(candidate)===C.b64(raw))return secret}catch(e){if(!this.store.active)throw e}finally{candidate?.fill(0)}}return ''}
  async read(owner,envelope){
   this.owner(owner);this.assert();let entry=this.ring()[owner];
   if(envelope?.format!=='jaan-encrypted-state-v1'){if(entry?.encryptedSeen)throw Error('Облако вернуло старый незашифрованный формат. Синхронизация остановлена.');return envelope}
   if(envelope.cryptoVersion!==1||envelope.keyId!==envelope.keyAccess?.id)throw Error('Неподдерживаемый зашифрованный формат облака');
   const context='jaan-cloud-state-v1|'+owner+'|'+envelope.keyId;let raw,state,entered='';
   try{
    if(entry){try{raw=C.unb64(entry.raw,32);state=await C.open(await C.key(raw),envelope.payload,context)}catch{raw?.fill(0);raw=null;if(entry.access.id===envelope.keyId)throw Error('Сохранённый ключ не смог расшифровать облачную базу. Сохраните локальную копию и не заменяйте облако.')}}
    if(!raw){
     if(envelope.keyAccess.policy!=='cloud-recovery-v1'){try{raw=await C.unlock(envelope.keyAccess,this.code())}catch{}}
     if(!raw){const answer=await this.request(envelope.keyAccess);raw=answer.raw;entered=answer.secret||''}
     this.assert();try{state=await C.open(await C.key(raw),envelope.payload,context)}catch{throw Error('Ключ принят, но содержимое облачной базы не удалось расшифровать. Сохраните локальную копию и не заменяйте облако.')}
    }
    this.assert();const internal=state?.[INTERNAL],pending=entry?.pendingRecovery;
    const secret=await this.matchingSecret(envelope.keyAccess,raw,[entered,internal?.id===envelope.keyId?internal.secret:'',pending?.access.id===envelope.keyId?pending.secret:'',entry?.access.id===envelope.keyId?entry.secret:'']);
    this.assert();entry={raw:C.b64(raw),access:envelope.keyAccess,encryptedSeen:true,...(secret?{secret}:{}),...(pending&&pending.access.id!==envelope.keyId?{pendingRecovery:pending}:{})};
    await this.save(owner,entry);const clean={...state};delete clean[INTERNAL];return clean;
   }finally{raw?.fill(0)}
  }
  async seal(owner,state){const entry=await this.entry(owner);this.assert();const data={...state};if(entry.secret)data[INTERNAL]={id:entry.access.id,secret:entry.secret};return {format:'jaan-encrypted-state-v1',cryptoVersion:1,keyId:entry.access.id,keyAccess:entry.access,payload:await C.seal(await C.key(entry.raw),data,'jaan-cloud-state-v1|'+owner+'|'+entry.access.id)}}
  async photoSeal(owner,path,photo){const entry=await this.entry(owner);this.assert();return {format:'jaan-encrypted-photo-v1',payload:await C.seal(await C.key(entry.raw),photo,'jaan-cloud-photo-v1|'+owner+'|'+path)}}
  async photoOpen(owner,path,data){const entry=await this.entry(owner);this.assert();if(data?.format!=='jaan-encrypted-photo-v1')throw Error('Неверный формат фото');const photo=await C.open(await C.key(entry.raw),data.payload,'jaan-cloud-photo-v1|'+owner+'|'+path);this.assert();return photo}
  async markSaved(owner){const entry=this.ring()[owner];if(entry){entry.encryptedSeen=true;await this.save(owner,entry)}}
  async prepareRecovery(owner,envelope,secret){
   const state=await this.read(owner,envelope),entry=this.ring()[owner];if(!entry?.encryptedSeen)throw Error('Сначала подключите существующую облачную базу');
   const raw=C.unb64(entry.raw,32);try{
    const access={...await C.access(raw,C.b64(C.bytes(32)),secret),policy:'cloud-recovery-v1'};this.assert();
    const payload=await C.seal(await C.key(raw),{...state,[INTERNAL]:{id:access.id,secret}},'jaan-cloud-state-v1|'+owner+'|'+access.id);this.assert();
    // Retain the acknowledged new key before the network mutation. If its
    // response is lost, reading the committed envelope safely reconciles it.
    await this.save(owner,{...entry,pendingRecovery:{baseId:envelope.keyId,access,secret}});
    return {format:'jaan-encrypted-state-v1',cryptoVersion:1,keyId:access.id,keyAccess:access,payload};
   }finally{raw.fill(0)}
  }
 }
 root.JaanCloudKeys=CloudKeys;
})(globalThis);
