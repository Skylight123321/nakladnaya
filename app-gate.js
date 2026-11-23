'use strict';
if(window.parent===window||!window.parent.JaanVault?.isUnlocked()){
 location.replace('./');
 throw new Error('Откройте калькулятор');
}
const JaanVault=window.parent.JaanVault;
const JaanCrypto=window.parent.JaanCrypto;
const localStorage=JaanVault.storage;
document.documentElement.style.visibility='visible';
const originalFetch=window.fetch.bind(window);
window.fetch=(...args)=>{if(!JaanVault.isUnlocked())return Promise.reject(new Error('Данные заблокированы'));return originalFetch(...args)};
