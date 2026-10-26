/* JAAN Print: local vector PDF from the existing A4 layout. No remote service. */
(function(){
  'use strict';
  let assetsPromise=null;
  const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
  const cancelled=signal=>{if(signal?.aborted)throw new DOMException('Отменено','AbortError')};
  function script(src,globalName){
    if(window[globalName])return Promise.resolve(window[globalName]);
    return new Promise((resolve,reject)=>{const el=document.createElement('script'),timer=setTimeout(()=>finish(Error('Не удалось загрузить модуль PDF. Обновите файлы приложения.')),15000);let done=false;
      function finish(error){if(done)return;done=true;clearTimeout(timer);el.onload=el.onerror=null;if(error){el.remove();reject(error)}else resolve(window[globalName])}
      el.src=src;el.onload=()=>finish(window[globalName]?null:Error('Модуль PDF недоступен.'));el.onerror=()=>finish(Error('Не найден '+src+'. Загрузите папку vendor на GitHub.'));document.head.appendChild(el);
    });
  }
  async function bytes(src){const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),15000);try{const response=await fetch(src,{signal:ac.signal});if(!response.ok)throw Error('Не найден '+src+'. Загрузите папку fonts на GitHub.');return new Uint8Array(await response.arrayBuffer())}finally{clearTimeout(timer)}}
  function prepare(){
    if(!assetsPromise)assetsPromise=Promise.all([script('vendor/pdf-lib.min.js','PDFLib'),script('vendor/fontkit.umd.min.js','fontkit'),bytes('fonts/LiberationSans-Regular.ttf'),bytes('fonts/LiberationSans-Bold.ttf')]).then(async([lib,fontkit,regular,bold])=>{
      if(typeof FontFace==='function'){
        const faces=[new FontFace('JAAN-Catalog',regular,{weight:'400'}),new FontFace('JAAN-Catalog',bold,{weight:'700'})];
        await Promise.all(faces.map(face=>face.load().then(loaded=>document.fonts.add(loaded))));
      }
      return {lib,fontkit,regular,bold};
    }).catch(error=>{assetsPromise=null;throw error});
    return assetsPromise;
  }
  const color=value=>{const n=String(value).match(/[\d.]+/g);return n&&n.length>=3?n.slice(0,3).map(x=>Number(x)/255):[0,0,0]};
  function capturePage(element){
    const box=element.getBoundingClientRect(),px=.75,out={text:[],cells:[],images:[]};
    for(const cell of element.querySelectorAll('th,td')){const r=cell.getBoundingClientRect(),style=getComputedStyle(cell);out.cells.push({x:(r.left-box.left)*px,top:(r.top-box.top)*px,w:r.width*px,h:r.height*px,fill:cell.tagName==='TH'?color(style.backgroundColor):null,line:color(style.borderBottomColor),lineWidth:(parseFloat(style.borderBottomWidth)||0)*px})}
    const walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT),range=document.createRange();let node;
    while((node=walker.nextNode())){
      if(!node.data.trim())continue;const style=getComputedStyle(node.parentElement),size=parseFloat(style.fontSize)*px,bold=Number(style.fontWeight)>=600||style.fontWeight==='bold';let group=null,index=0;
      for(const character of node.data){range.setStart(node,index);index+=character.length;range.setEnd(node,index);const r=range.getBoundingClientRect();if(!r.width||!r.height)continue;const top=(r.top-box.top)*px;
        if(!group||Math.abs(top-group.top)>.4){group={text:'',x:(r.left-box.left)*px,top,size,bold,color:color(style.color)};out.text.push(group)}group.text+=character;
      }
    }
    range.detach?.();
    for(const image of element.querySelectorAll('img')){const r=image.getBoundingClientRect();out.images.push({src:image.src,x:(r.left-box.left)*px,top:(r.top-box.top)*px,w:r.width*px,h:r.height*px})}
    return out;
  }
  function base64(bytes){let binary='';for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(binary)}
  async function create(pages,{signal,onProgress=()=>{}}={}){
    const assets=await prepare();cancelled(signal);if(!pages.length||pages.length>200)throw Error('Для PDF выберите каталог от 1 до 200 страниц.');
    const {lib,fontkit,regular,bold}=assets,pdf=await lib.PDFDocument.create();pdf.registerFontkit(fontkit);pdf.setTitle('JAAN — Каталог товаров');pdf.setAuthor('JAAN Print');pdf.setCreator('JAAN Print');pdf.setLanguage('ru-RU');
    const fonts=[await pdf.embedFont(regular,{subset:true}),await pdf.embedFont(bold,{subset:true})],sets=fonts.map(font=>new Set(font.getCharacterSet())),images=new Map(),width=210*72/25.4,height=297*72/25.4;
    for(let i=0;i<pages.length;i++){
      cancelled(signal);const model=capturePage(pages[i]),page=pdf.addPage([width,height]);
      for(const cell of model.cells){if(cell.fill)page.drawRectangle({x:cell.x,y:height-cell.top-cell.h,width:cell.w,height:cell.h,color:lib.rgb(...cell.fill)});if(cell.lineWidth)page.drawLine({start:{x:cell.x,y:height-cell.top-cell.h},end:{x:cell.x+cell.w,y:height-cell.top-cell.h},thickness:cell.lineWidth,color:lib.rgb(...cell.line)})}
      for(const item of model.text){const n=item.bold?1:0,font=fonts[n],text=[...item.text].map(c=>sets[n].has(c.codePointAt(0))?c:'□').join('');page.drawText(text,{x:item.x,y:height-item.top-font.heightAtSize(item.size,{descender:false}),size:item.size,font,color:lib.rgb(...item.color)})}
      for(const item of model.images){let image=images.get(item.src);if(!image){image=await pdf.embedJpg(item.src);images.set(item.src,image)}const scale=Math.min(item.w/image.width,item.h/image.height),w=image.width*scale,h=image.height*scale;page.drawImage(image,{x:item.x+(item.w-w)/2,y:height-item.top-(item.h+h)/2,width:w,height:h})}
      onProgress(i+1,pages.length);await pause();
    }
    cancelled(signal);const data=await pdf.save();cancelled(signal);if(data.length>16*1024*1024)throw Error('PDF больше 16 МБ. Уменьшите выбор товаров или отключите фотографии.');
    const date=new Date(),pad=n=>String(n).padStart(2,'0'),name='JAAN_catalog_'+date.getFullYear()+'-'+pad(date.getMonth()+1)+'-'+pad(date.getDate())+'_'+pad(date.getHours())+'-'+pad(date.getMinutes())+'-'+pad(date.getSeconds())+'.pdf';
    return {bytes:data,base64:base64(data),file:new File([data],name,{type:'application/pdf'}),pageCount:pages.length};
  }
  window.JaanCataloguePdf={prepare,create};
})();
