// Dependency-free regression checks for inline code, content and saved checklist data.
// Minimal DOM stubs test application logic, not browser layout/accessibility.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];
for (const [, attributes, code] of scripts) {
  if (attributes.includes('application/ld+json')) JSON.parse(code);
  else new vm.Script(code);
}
assert.equal((html.match(/<body>/g) || []).length, 1);
assert.equal((html.match(/<footer>/g) || []).length, 1);
assert.equal((html.match(/property="og:title"/g) || []).length, 1);
assert.equal((html.match(/name="theme-color"/g) || []).length, 1);
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
assert.equal(ids.length, new Set(ids).size);
for (const [, target] of html.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.includes(target), target);
assert.ok(!html.includes('Um treino inédito'));
assert.ok(!html.includes('garantem progressão'));
console.log('PASS HTML anchors, unique metadata/IDs, inline JS syntax and structured JSON');

class Element {
  constructor(tag = 'div') { this.tagName = tag; this.children = []; this.style = {}; this.dataset = {}; this.attrs = {}; this.listeners = {}; this.hidden = true; }
  append(...elements) { this.children.push(...elements); }
  appendChild(element) { this.children.push(element); }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  addEventListener(name, listener) { this.listeners[name] = listener; }
  querySelectorAll(selector) {
    assert.equal(selector, 'input[type=checkbox]');
    const found = [];
    function walk(el) { if (el.tagName === 'input' && el.type === 'checkbox') found.push(el); el.children.forEach(walk); }
    this.children.forEach(walk);
    return found;
  }
}
const appScripts = scripts.filter(([, , code]) => code.includes('const TREINOS') || code.includes('const plano'));
const KEY = 'asf-treino-v1';
function app({ raw, now = '2026-01-01T12:00:00Z', readBlocked = false, writeBlocked = false } = {}) {
  const elements = Object.fromEntries(ids.map(id => [id, new Element()]));
  const store = new Map([['other-app', 'keep']]);
  if (raw !== undefined) store.set(KEY, raw);
  let writes = 0;
  const localStorage = {
    getItem(key) { if (readBlocked) throw new Error('blocked'); return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { if (writeBlocked) throw new Error('quota'); writes++; store.set(key, value); },
    removeItem(key) { if (readBlocked) throw new Error('blocked'); store.delete(key); }
  };
  class ClockDate extends Date { constructor(...args) { super(...(args.length ? args : [now])); } }
  const context = vm.createContext({
    document: { getElementById: id => elements[id], createElement: tag => new Element(tag) },
    localStorage, Date: ClockDate, window: { confirm: () => context.confirmAnswer }, confirmAnswer: false
  });
  appScripts.forEach(([, , code]) => vm.runInContext(code, context));
  const inputs = elements.planos.querySelectorAll('input[type=checkbox]');
  function change(index, checked) { inputs[index].checked = checked; inputs[index].listeners.change(); }
  return { elements, inputs, store, context, change, writes: () => writes };
}
const raw = JSON.stringify({ '0-0': true, '2-2': true, '6-1': true, extra: 'preservar' });
let state = app({ raw });
assert.equal(state.inputs.length, 19);
assert.deepEqual(state.inputs.map(i => i.dataset.id), ['0-0','0-1','0-2','0-3','1-0','1-1','1-2','2-0','2-1','2-2','3-0','3-1','3-2','4-0','4-1','5-0','5-1','6-0','6-1']);
assert.equal(state.inputs.filter(i => i.checked).length, 3);
assert.equal(state.elements.progress.attrs['aria-valuenow'], '3');
assert.equal(state.store.get(KEY), raw);
assert.equal(state.writes(), 0);
state.change(1, true);
assert.equal(JSON.parse(state.store.get(KEY)).extra, 'preservar');
state = app({ raw: state.store.get(KEY) });
assert.equal(state.inputs.filter(i => i.checked).length, 4);
console.log('PASS saved key/19 IDs, checked state, unrelated fields, no startup writes and reload persistence');
vm.runInContext('resetar()', state.context);
assert.equal(state.inputs.filter(i => i.checked).length, 4);
state.context.confirmAnswer = true;
vm.runInContext('resetar()', state.context);
assert.equal(state.inputs.filter(i => i.checked).length, 0);
assert.equal(state.store.has(KEY), false);
assert.equal(state.store.get('other-app'), 'keep');
state.inputs.forEach((input, index) => state.change(index, true));
assert.equal(state.elements.pct.textContent, 100);
assert.equal(state.elements.progress.attrs['aria-valuenow'], '19');
console.log('PASS reset cancellation/confirmation, unrelated storage and 100% completion');
for (const [now, expected] of [['2026-01-01T12:00:00Z',1],['2026-01-08T12:00:00Z',2],['2026-03-26T12:00:00Z',1],['2027-01-01T12:00:00Z',1]]) {
  state = app({ raw, now });
  assert.match(state.elements['ts-numero'].textContent, new RegExp(`Rotina ${expected} de 12`));
  assert.equal(state.store.get(KEY), raw);
  assert.equal(state.elements['ts-itens'].children.length, 4);
}
assert.equal(vm.runInContext('TREINOS.length', state.context), 12);
console.log('PASS weekly cycle, 12-routine wrap, year boundary and preservation of checklist');
for (const bad of ['{invalid', 'null', '[true]', 'false']) {
  state = app({ raw: bad });
  assert.equal(state.elements['storage-status'].hidden, false);
  state.change(0, true);
  assert.equal(state.store.get(KEY), bad);
  assert.equal(state.elements.progress.attrs['aria-valuenow'], '1');
}
state = app({ readBlocked:true });
state.change(0,true);
assert.equal(state.inputs.length,19);
assert.equal(state.elements.progress.attrs['aria-valuenow'], '1');
state = app({ raw, writeBlocked:true });
state.change(1,true);
assert.equal(state.elements['storage-status'].hidden, false);
assert.equal(state.store.get(KEY), raw);
console.log('PASS invalid, unsupported, inaccessible and quota-failed storage without silent data deletion');
console.log('\nAll logic checks passed. Browser rendering and external services require separate verification.');
