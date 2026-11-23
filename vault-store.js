/* A single encrypted writer. Plaintext exists only in the unlocked page realm. */
(function(root){
 'use strict';
 const C=root.JaanCrypto,DB='jaan-private-vault-v1',STORE='records',LEGACY_DB='jaan-photo-store-v1';
 const sensitive=k=>/^(jaan-|invoice-calc-)/.test(k);
 function database(name=DB,store=STORE){return new Promise((resolve,reject)=>{const req=indexedDB.open(name,1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(store))req.result.createObjectStore(store)};req.onerror=()=>reject(req.error);req.onsuccess=()=>resolve(req.result)})}
 async function readAll(name=DB,store=STORE){const db=await database(name,store);return new Promise((resolve,reject)=>{const out=new Map(),tx=db.transaction(store),req=tx.objectStore(store).openCursor();req.onsuccess=()=>{const cur=req.result;if(cur){out.set(String(cur.key),cur.value);cur.continue()}};tx.oncomplete=()=>{db.close();resolve(out)};tx.onerror=()=>{db.close();reject(tx.error)}})}
 async function commit(changes,expectedSeq){const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite'),s=tx.objectStore(STORE),r=s.get('state');let conflict=false;r.onsuccess=()=>{if(expectedSeq!==undefined&&(r.result?.seq||0)!==expectedSeq){conflict=true;tx.abort();return}for(const [k,v]of changes){if(v===undefined)s.delete(k);else s.put(v,k)}};tx.oncomplete=()=>{db.close();resolve()};tx.onabort=tx.onerror=()=>{db.close();reject(conflict?Error('База открыта в другом окне. Закройте его и повторите.'):tx.error||Error('Не удалось сохранить данные'))}})}
 async function clearLegacyStore(name,store){const db=await database(name,store);return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).clear();tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>{db.close();reject(tx.error)}})}
 class VaultStore{
  constructor(onError=()=>{}){this.onError=onError;this.kv=new Map();this.photos=new Map();this.photoChanges=new Set();this.seq=0;this.serial=Promise.resolve();this.dirty=false;this.timer=null;this.active=false;this.failed=null;this.raw=null;this.cryptoKey=null;this.header=null;this.released=null}
  static async exists(){return (await readAll()).has('header')}
  async acquire(){if(!navigator.locks)return;await new Promise((resolve,reject)=>{navigator.locks.request('jaan-private-vault-writer',{ifAvailable:true},async lock=>{if(!lock){reject(Error('Закройте другое окно калькулятора и повторите.'));return}resolve();await new Promise(done=>this.released=done)}).catch(reject)})}
  release(){this.released?.();this.released=null}
  async create(code,recoveryText){await this.acquire();try{
   if(await VaultStore.exists())throw Error('Защита уже настроена. Перезагрузите приложение.');
   this.raw=C.bytes(32);this.cryptoKey=await C.key(this.raw);this.header={format:'jaan-private-vault-v1',access:await C.access(this.raw,code,recoveryText),legacyCleanupPending:true};
   for(let i=0;i<root.localStorage.length;i++){const k=root.localStorage.key(i);if(sensitive(k))this.kv.set(k,root.localStorage.getItem(k))}
   this.kv.set('jaan-local-recovery-card-v1',recoveryText);
   this.photos=await readAll(LEGACY_DB,'photos');this.photos=new Map([...this.photos].filter(([,v])=>typeof v==='string'&&/^data:image\//.test(v)));
   const excel=await readAll('jaan-excel-safety-v1','snapshots');if(excel.has('latest'))this.kv.set('jaan-excel-safety-encrypted-v1',JSON.stringify(excel.get('latest')));
   const id=this.header.access.id,changes=[['header',this.header],['state',{seq:1,box:await C.seal(this.cryptoKey,Object.fromEntries(this.kv),'jaan-local-state-v1|'+id)}]];
   for(const [k,v]of this.photos)changes.push(['photo:'+k,await C.seal(this.cryptoKey,v,'jaan-local-photo-v1|'+id+'|'+k)]);
   await commit(changes,0);this.seq=1;
   const verify=await readAll();await C.open(this.cryptoKey,verify.get('state').box,'jaan-local-state-v1|'+id);
   for(const [k]of this.photos)await C.open(this.cryptoKey,verify.get('photo:'+k),'jaan-local-photo-v1|'+id+'|'+k);
   await this.cleanupLegacy();this.active=true;
  }catch(e){this.release();this.forget();throw e}}
  async cleanupLegacy(){if(!this.header.legacyCleanupPending)return;const keys=[];for(let i=0;i<root.localStorage.length;i++){const k=root.localStorage.key(i);if(sensitive(k))keys.push(k)}for(const k of keys)root.localStorage.removeItem(k);await clearLegacyStore(LEGACY_DB,'photos');await clearLegacyStore('jaan-excel-safety-v1','snapshots');this.header={...this.header,legacyCleanupPending:false};await commit([['header',this.header]])}
  async unlock(text,recovery=false){await this.acquire();try{const all=await readAll(),header=all.get('header');if(header?.format!=='jaan-private-vault-v1')throw Error('Защита ещё не настроена');const raw=await C.unlock(header.access,text,recovery),k=await C.key(raw),state=all.get('state');if(!state)throw Error('Зашифрованная база не найдена');const kv=await C.open(k,state.box,'jaan-local-state-v1|'+header.access.id),photos=new Map();
   for(const [name,box]of all){if(name.startsWith('photo:')){const pk=name.slice(6);photos.set(pk,await C.open(k,box,'jaan-local-photo-v1|'+header.access.id+'|'+pk))}}
   this.raw=raw;this.cryptoKey=k;this.header=header;this.seq=state.seq;this.kv=new Map(Object.entries(kv));this.photos=photos;await this.cleanupLegacy();this.active=true;
  }catch(e){this.release();this.forget();throw e}}
  assert(){if(!this.active)throw Error('Данные заблокированы')}
  changed(){this.assert();this.dirty=true;clearTimeout(this.timer);this.timer=setTimeout(()=>this.flush().catch(()=>{}),70)}
  get storage(){const self=this;return {getItem(k){self.assert();return self.kv.get(String(k))??null},setItem(k,v){self.assert();self.kv.set(String(k),String(v));self.changed()},removeItem(k){self.assert();self.kv.delete(String(k));self.changed()},key(i){self.assert();return [...self.kv.keys()][i]??null},get length(){return self.kv.size}}}
  async photoGet(k){this.assert();return this.photos.get(String(k))||''}
  async photoSet(k,v){this.assert();k=String(k);if(v)this.photos.set(k,String(v));else this.photos.delete(k);this.photoChanges.add(k);this.changed();await this.flush()}
  async prunePhotos(keep){this.assert();for(const k of this.photos.keys())if((k.startsWith('product:')||k.startsWith('cloud:')&&k.includes('/products/'))&&!keep.has(k)){this.photos.delete(k);this.photoChanges.add(k)}this.changed();await this.flush()}
  flush(){clearTimeout(this.timer);const work=async()=>{if(!this.active||!this.dirty)return;const kv=Object.fromEntries(this.kv),photos=[...this.photoChanges].map(k=>[k,this.photos.get(k)]),expected=this.seq,k=this.cryptoKey,id=this.header.access.id;this.dirty=false;this.photoChanges.clear();try{
    const changes=[['state',{seq:expected+1,box:await C.seal(k,kv,'jaan-local-state-v1|'+id)}]];for(const [pk,v]of photos)changes.push(['photo:'+pk,v?await C.seal(k,v,'jaan-local-photo-v1|'+id+'|'+pk):undefined]);await commit(changes,expected);this.seq=expected+1;this.failed=null;
   }catch(e){this.dirty=true;photos.forEach(([pk])=>this.photoChanges.add(pk));this.failed=e;this.onError(e);throw e}};
   const next=this.serial.catch(()=>{}).then(work);this.serial=next;return next;
  }
  async drain(){do{await this.flush()}while(this.dirty)}
  async changeCode(code){this.assert();await this.drain();const header={...this.header,access:await C.recode(this.header.access,this.raw,code)};this.assert();await this.drain();this.assert();const expected=this.seq,box=await C.seal(this.cryptoKey,Object.fromEntries(this.kv),'jaan-local-state-v1|'+header.access.id);this.assert();await commit([['header',header],['state',{seq:expected+1,box}]],expected);this.header=header;this.seq=expected+1}
  async changeRecovery(text){this.assert();await this.drain();const header={...this.header,access:await C.renewRecovery(this.header.access,this.raw,text)};this.assert();await this.drain();this.assert();const expected=this.seq,kv=Object.fromEntries(this.kv);kv['jaan-local-recovery-card-v1']=text;const box=await C.seal(this.cryptoKey,kv,'jaan-local-state-v1|'+header.access.id);this.assert();await commit([['header',header],['state',{seq:expected+1,box}]],expected);this.header=header;this.seq=expected+1;this.kv.set('jaan-local-recovery-card-v1',text)}
  async encryptedBackup(){this.assert();await this.drain();return {format:'jaan-encrypted-backup-v1',version:'12.1.1',records:Object.fromEntries(await readAll())}}
  async restoreBackup(data,secret,recovery=true){this.assert();if(data?.format!=='jaan-encrypted-backup-v1')throw Error('Неверный формат копии');const source=data.records,header=source?.header;if(!header?.access||!source.state)throw Error('Копия неполная');const raw=await C.unlock(header.access,secret,recovery),k=await C.key(raw),kv=await C.open(k,source.state.box,'jaan-local-state-v1|'+header.access.id),photos=new Map();for(const [name,box]of Object.entries(source))if(name.startsWith('photo:')){const pk=name.slice(6);photos.set(pk,await C.open(k,box,'jaan-local-photo-v1|'+header.access.id+'|'+pk))}
   // Preserve this device's lock credentials, re-encrypt every restored record.
   const oldKv=this.kv,oldPhotos=this.photos;this.kv=new Map(Object.entries(kv));this.kv.delete('jaan-local-recovery-card-v1');if(oldKv.has('jaan-local-recovery-card-v1'))this.kv.set('jaan-local-recovery-card-v1',oldKv.get('jaan-local-recovery-card-v1'));this.kv.set('jaan-device-id',oldKv.get('jaan-device-id')||C.b64(C.bytes(18)));if(oldKv.has('jaan-device-name'))this.kv.set('jaan-device-name',oldKv.get('jaan-device-name'));this.photos=photos;for(const pk of new Set([...oldPhotos.keys(),...photos.keys()]))this.photoChanges.add(pk);this.changed();try{await this.drain()}catch(e){this.kv=oldKv;this.photos=oldPhotos;this.dirty=true;throw e}
  }
  forget(){clearTimeout(this.timer);this.raw?.fill(0);this.raw=null;this.cryptoKey=null;this.kv.clear();this.photos.clear();this.photoChanges.clear();this.active=false;this.release()}
 }
 root.JaanVaultStore=VaultStore;
})(globalThis);
