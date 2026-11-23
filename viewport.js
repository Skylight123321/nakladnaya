/* Display preferences contain no business data or unlocking material. */
(function(){
 'use strict';
 const key='calculator-display-profile-v1',profiles=[{id:'auto',label:'Авто',size:'auto'}];
 for(const generation of [13,14,15,16,17,18]){
  const variants=generation===13?['','mini','Pro','Pro Max']:generation<=15?['','Plus','Pro','Pro Max']:generation===16?['','Plus','e','Pro','Pro Max']:generation===17?['','e','Pro','Pro Max']:['Pro','Pro Max'];
  for(const variant of variants)profiles.push({id:'iphone-'+generation+(variant?'-'+variant.toLowerCase().replace(' ','-'):''),label:'iPhone '+generation+(variant==='e'?'e':variant?' '+variant:''),size:variant==='mini'?'compact':variant.includes('Max')||variant==='Plus'?'large':'standard'});
 }
 profiles.push({id:'iphone-air',label:'iPhone Air',size:'large'},{id:'iphone-duo',label:'iPhone Duo',size:'large'});
 let selected='auto';try{const saved=localStorage.getItem(key);if(profiles.some(p=>p.id===saved))selected=saved}catch{}
 const root=document.documentElement;let screenMode='calculator';
 function frame(){return document.querySelector('#appHost iframe')}
 function update(){
  const profile=profiles.find(p=>p.id===selected);root.dataset.deviceProfile=selected;root.dataset.deviceSize=profile.size;
  const visual=window.visualViewport,height=visual&&Math.abs(visual.scale-1)<.01?Math.min(window.innerHeight,visual.height):window.innerHeight;root.style.setProperty('--jaan-viewport-height',height+'px');
  const computed=getComputedStyle(root),top=parseFloat(computed.getPropertyValue('--jaan-env-top'))||0,bottom=parseFloat(computed.getPropertyValue('--jaan-env-bottom'))||0;
  const standalone=navigator.standalone||matchMedia('(display-mode: standalone)').matches,landscape=innerWidth>innerHeight;
  const screenHeight=landscape?Math.min(screen.width,screen.height):Math.max(screen.width,screen.height),missing=screenHeight-window.innerHeight;
  let safeTop=top,safeBottom=bottom;
  // Some iOS installations already reserve the status-bar band. Only
  // compensate a measured exact system inset; never use a model's pixels.
  if(standalone&&top>0&&Math.abs(missing-top)<3)safeTop=0;
  else if(standalone&&top+bottom>0&&Math.abs(missing-top-bottom)<3){safeTop=0;safeBottom=0}
  root.style.setProperty('--jaan-safe-top',safeTop+'px');root.style.setProperty('--jaan-safe-bottom',safeBottom+'px');
  const child=frame()?.contentDocument?.documentElement;if(child){child.style.setProperty('--jaan-safe-top',safeTop+'px');child.style.setProperty('--jaan-safe-bottom',safeBottom+'px');child.dataset.deviceProfile=selected;child.dataset.deviceSize=profile.size;const select=child.ownerDocument.getElementById('screenProfile');if(select)select.value=selected}
 }
 function mode(value){screenMode=value;root.dataset.screen=value;root.style.colorScheme=value==='app'?'light':'dark';const color=value==='app'?'#f6f7f9':'#000000';document.querySelector('meta[name="theme-color"]')?.setAttribute('content',color);update()}
 window.JaanViewport={profiles,get profile(){return selected},setProfile(value){if(!profiles.some(p=>p.id===value))throw Error('Выберите устройство из списка');localStorage.setItem(key,value);selected=value;update();window.dispatchEvent(new Event('jaanviewportchange'))},mode,update};
 window.addEventListener('resize',update);window.addEventListener('orientationchange',()=>requestAnimationFrame(update));window.visualViewport?.addEventListener('resize',update);window.addEventListener('pageshow',()=>mode(screenMode));mode('calculator');
})();
