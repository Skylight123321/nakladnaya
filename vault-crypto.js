/* Versioned authenticated envelopes. No application data or keys are logged. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.JaanCrypto=api})(globalThis,()=>{
 'use strict';
 const ITERATIONS=600000,encoder=new TextEncoder(),decoder=new TextDecoder();
 const subtle=()=>globalThis.crypto.subtle;
 function bytes(n){return crypto.getRandomValues(new Uint8Array(n))}
 function b64(data){let s='';const a=new Uint8Array(data);for(let i=0;i<a.length;i+=16384)s+=String.fromCharCode(...a.subarray(i,i+16384));return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
 function unb64(s,max=100*1024*1024){if(typeof s!=='string'||s.length>max*1.4||!/^[A-Za-z0-9_-]*$/.test(s))throw Error('Некорректный зашифрованный файл');const raw=atob(s.replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(raw,x=>x.charCodeAt(0))}
 async function key(raw){if(!(raw instanceof Uint8Array))raw=unb64(raw,32);if(raw.byteLength!==32)throw Error('Некорректный ключ');return subtle().importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt'])}
 async function passwordKey(password,salt,iterations=ITERATIONS){if(iterations<ITERATIONS||iterations>2000000||unb64(salt,32).length!==16)throw Error('Неподдерживаемые параметры шифрования');const base=await subtle().importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveKey']);return subtle().deriveKey({name:'PBKDF2',hash:'SHA-256',salt:unb64(salt),iterations},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt'])}
 async function seal(k,value,context){const iv=bytes(12),json=encoder.encode(JSON.stringify(value));const data=await subtle().encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(context),tagLength:128},k,json);return {v:1,iv:b64(iv),ct:b64(data)}}
 async function open(k,box,context){if(box?.v!==1||unb64(box.iv,12).length!==12)throw Error('Неподдерживаемый формат шифрования');const data=await subtle().decrypt({name:'AES-GCM',iv:unb64(box.iv,12),additionalData:encoder.encode(context),tagLength:128},k,unb64(box.ct));return JSON.parse(decoder.decode(data))}
 function recovery(){return Array.from(bytes(32),x=>x.toString(16).padStart(2,'0')).join('').match(/.{8}/g).join('-')}
 async function recoveryKey(text){const s=String(text).replace(/[-\s]/g,'').toLowerCase();if(!/^[a-f0-9]{64}$/.test(s))throw Error('Проверьте ключ восстановления');return key(Uint8Array.from(s.match(/../g),x=>parseInt(x,16)))}
 async function access(raw,code,recoveryText,id=crypto.randomUUID()){
  const salt=b64(bytes(16)),codeKey=await passwordKey(code,salt),rk=await recoveryKey(recoveryText);
  return {id,kdf:{salt,iterations:ITERATIONS},code:await seal(codeKey,b64(raw),'jaan-wrap-code-v1|'+id),recovery:await seal(rk,b64(raw),'jaan-wrap-recovery-v1|'+id)};
 }
 async function unlock(meta,text,useRecovery=false){if(!meta||typeof meta.id!=='string'||meta.id.length>100)throw Error('Некорректные параметры ключа');const k=useRecovery?await recoveryKey(text):await passwordKey(text,meta.kdf.salt,meta.kdf.iterations);return unb64(await open(k,useRecovery?meta.recovery:meta.code,(useRecovery?'jaan-wrap-recovery-v1|':'jaan-wrap-code-v1|')+meta.id),32)}
 async function recode(meta,raw,code){const salt=b64(bytes(16));return {...meta,kdf:{salt,iterations:ITERATIONS},code:await seal(await passwordKey(code,salt),b64(raw),'jaan-wrap-code-v1|'+meta.id)}}
 async function renewRecovery(meta,raw,text){return {...meta,recovery:await seal(await recoveryKey(text),b64(raw),'jaan-wrap-recovery-v1|'+meta.id)}}
 return {ITERATIONS,bytes,b64,unb64,key,passwordKey,seal,open,recovery,recoveryKey,access,unlock,recode,renewRecovery};
});
