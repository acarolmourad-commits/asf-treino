// Optional DOM integration tests. Requires jsdom; no external resources are fetched.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const KEY = 'asf-treino-v1';
async function open({ raw, now='2026-01-01T12:00:00Z', blocked=false, quota=false }={}) {
  const errors=[];
  const console=new VirtualConsole();
  console.on('jsdomError', e=>errors.push(e));
  let writes=0;
  const dom=new JSDOM(html,{
    url:'https://treino.asf.surf/',runScripts:'dangerously',virtualConsole:console,
    beforeParse(window){
      const NativeDate=window.Date;
      window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[now]));}};
      window.confirm=()=>false;
      if(blocked){Object.defineProperty(window,'localStorage',{get(){throw new Error('Blocked');}});return;}
      if(raw!==undefined)window.localStorage.setItem(KEY,raw);
      window.localStorage.setItem('other-app','keep');
      const set=window.Storage.prototype.setItem;
      window.Storage.prototype.setItem=function(...args){writes++;if(quota)throw new Error('quota');return set.apply(this,args);};
    }
  });
  await new Promise(resolve=>dom.window.addEventListener('load',resolve));
  const {window}=dom, doc=window.document;
  return {dom,window,doc,errors,writes:()=>writes};
}
(async()=>{
  const raw=JSON.stringify({'0-0':true,'2-2':true,'6-1':true,extra:'preservar'});
  let {dom,window,doc,errors,writes}=await open({raw});
  assert.deepEqual(errors,[]);
  assert.equal(doc.querySelectorAll('#planos input').length,19);
  assert.equal(doc.querySelectorAll('#planos input:checked').length,3);
  assert.equal(window.localStorage.getItem(KEY),raw);
  assert.equal(writes(),0);
  assert.equal(doc.querySelector('.asf-sat-nav a[aria-current=page]').textContent,'🏋️ Treino');
  assert.equal(doc.querySelectorAll('.asf-sat-nav a').length,20);
  assert.equal(doc.body.firstElementChild.className,'skip-link');
  assert.equal(doc.querySelectorAll('h1').length,1);
  assert.equal(doc.querySelectorAll('footer').length,1);
  assert.equal(doc.querySelectorAll('footer a').length,4);
  console.log('PASS real DOM: existing storage, 19 labels, ecosystem navigation, skip link and no JS exceptions');
  doc.querySelector('[data-id="0-1"]').click();
  assert.equal(doc.querySelector('#progress').getAttribute('aria-valuenow'),'4');
  assert.equal(JSON.parse(window.localStorage.getItem(KEY)).extra,'preservar');
  const unrelated=doc.createElement('input');unrelated.type='checkbox';unrelated.checked=true;doc.body.appendChild(unrelated);
  window.atualizar(true);
  assert.equal(doc.querySelector('#progress').getAttribute('aria-valuenow'),'4');
  assert.equal(doc.querySelector('#progress').getAttribute('aria-valuemax'),'19');
  assert.equal(JSON.parse(window.localStorage.getItem(KEY)).undefined,undefined);
  doc.querySelector('.reset').click();
  assert.equal(doc.querySelectorAll('#planos input:checked').length,4);
  window.confirm=()=>true;
  doc.querySelector('.reset').click();
  assert.equal(doc.querySelectorAll('#planos input:checked').length,0);
  assert.equal(unrelated.checked,true);
  assert.equal(window.localStorage.getItem('other-app'),'keep');
  assert.equal(window.localStorage.getItem(KEY),null);
  console.log('PASS real DOM: checkbox events, progress, reset confirmation and isolation from signup/app inputs');
  const schemas=[...doc.querySelectorAll('script[type="application/ld+json"]')].map(s=>JSON.parse(s.textContent));
  const faq=schemas.find(s=>s['@type']==='FAQPage');
  const visible=[...doc.querySelectorAll('#duvidas details')];
  assert.equal(visible.length,faq.mainEntity.length);
  visible.forEach((detail,i)=>{assert.equal(detail.querySelector('summary').textContent,faq.mainEntity[i].name);assert.equal(detail.querySelector('p').textContent,faq.mainEntity[i].acceptedAnswer.text);});
  assert.equal(doc.querySelectorAll('#plano-30-dias details').length,5);
  assert.equal(doc.querySelectorAll('#plano-30-dias input').length,0);
  for(const a of doc.querySelectorAll('a[href^="#"]'))assert.ok(doc.getElementById(a.hash.slice(1)));
  console.log('PASS real DOM: FAQ/schema parity, independent 30-day guide and anchor targets');
  dom.window.close();
  for(const [date, expected] of [['2026-01-01T12:00:00Z',1],['2026-01-08T12:00:00Z',2],['2026-03-26T12:00:00Z',1],['2027-01-01T12:00:00Z',1]]){
    const page=await open({raw,now:date});
    assert.match(page.doc.querySelector('#ts-numero').textContent,new RegExp(`Rotina ${expected} de 12`));
    assert.equal(page.window.localStorage.getItem(KEY),raw);
    page.dom.window.close();
  }
  for(const invalid of ['{broken','null','[true]','false']){
    const page=await open({raw:invalid});
    assert.equal(page.doc.querySelector('#storage-status').hidden,false);
    page.doc.querySelector('[data-id="0-0"]').click();
    assert.equal(page.window.localStorage.getItem(KEY),invalid);
    assert.deepEqual(page.errors,[]);
    page.dom.window.close();
  }
  for(const options of [{blocked:true},{raw,quota:true}]){
    const page=await open(options);
    page.doc.querySelector('[data-id="0-1"]').click();
    assert.equal(page.doc.querySelector('#storage-status').hidden,false);
    assert.deepEqual(page.errors,[]);
    page.dom.window.close();
  }
  console.log('PASS real DOM: date rotation and storage corruption/access/quota failure handling');
  console.log('\nAll DOM integration checks passed. This does not validate rendered layout or external integrations.');
})().catch(error=>{console.error(error);process.exitCode=1;});
