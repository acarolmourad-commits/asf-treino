// Local regression tests. Requires Playwright and a Chromium installation.
// No requests to external sites are made; analytics/signup services are not exercised.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const KEY = 'asf-treino-v1';

async function main() {
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(req.url === '/seed' ? '<!doctype html><title>Seed</title>' : html);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const options = { headless: true };
  if (process.env.CHROMIUM_PATH) options.executablePath = process.env.CHROMIUM_PATH;
  let browser;
  let checks = 0;
  const check = (name) => { checks++; console.log(`PASS ${name}`); };
  try {
    browser = await chromium.launch(options);
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    await context.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(origin + '/seed');
    const saved = JSON.stringify({ '0-0': true, '2-2': true, '6-1': true, extra: 'preservar' });
    await page.evaluate(([key, value]) => { localStorage.setItem(key, value); localStorage.setItem('other-app', 'keep'); }, [KEY, saved]);
    await page.goto(origin);
    assert.equal(await page.locator('#planos input').count(), 19);
    assert.equal(await page.locator('#planos input:checked').count(), 3);
    assert.equal(await page.evaluate(key => localStorage.getItem(key), KEY), saved);
    assert.equal(await page.locator('#progress').getAttribute('aria-valuenow'), '3');
    check('19 existing IDs and saved values survive first load without rewriting storage');

    const ids = await page.locator('#planos input').evaluateAll(inputs => inputs.map(i => i.dataset.id));
    assert.deepEqual(ids, ['0-0','0-1','0-2','0-3','1-0','1-1','1-2','2-0','2-1','2-2','3-0','3-1','3-2','4-0','4-1','5-0','5-1','6-0','6-1']);
    await page.locator('[data-id="0-1"]').check();
    await page.reload();
    assert.equal(await page.locator('#planos input:checked').count(), 4);
    assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).extra, KEY), 'preservar');
    check('checkbox changes persist on reload and retain unrelated saved fields');

    page.once('dialog', dialog => dialog.dismiss());
    await page.locator('.reset').click();
    assert.equal(await page.locator('#planos input:checked').count(), 4);
    page.once('dialog', dialog => dialog.accept());
    await page.locator('.reset').click();
    assert.equal(await page.locator('#planos input:checked').count(), 0);
    assert.equal(await page.evaluate(key => localStorage.getItem(key), KEY), null);
    assert.equal(await page.evaluate(() => localStorage.getItem('other-app')), 'keep');
    await page.reload();
    assert.equal(await page.locator('#planos input:checked').count(), 0);
    check('reset requires confirmation, cancel is safe, and other app storage is untouched');

    await page.clock.install({ time: new Date('2026-01-01T12:00:00Z') });
    await page.reload();
    assert.match(await page.locator('#ts-numero').textContent(), /Rotina 1 de 12/);
    await page.locator('[data-id="0-0"]').check();
    await page.clock.setFixedTime(new Date('2026-01-08T12:00:00Z'));
    await page.reload();
    assert.match(await page.locator('#ts-numero').textContent(), /Rotina 2 de 12/);
    assert.equal(await page.locator('[data-id="0-0"]').isChecked(), true);
    await page.clock.setFixedTime(new Date('2026-03-26T12:00:00Z'));
    await page.reload();
    assert.match(await page.locator('#ts-numero').textContent(), /Rotina 1 de 12/);
    assert.equal(await page.locator('[data-id="0-0"]').isChecked(), true);
    check('12-routine cycle advances and repeats without resetting checklist');

    await page.locator('.hero a[href="#plano-30-dias"]').click();
    assert.equal(new URL(page.url()).hash, '#plano-30-dias');
    await page.locator('#plano-30-dias details').nth(1).locator('summary').click();
    assert.equal(await page.locator('#plano-30-dias details').nth(1).getAttribute('open'), '');
    assert.equal(await page.locator('[data-id="0-0"]').isChecked(), true);
    check('30-day guide and anchors remain independent of checklist');

    const seo = await page.locator('script[type="application/ld+json"]').allTextContents();
    const faq = seo.map(x => JSON.parse(x)).find(x => x['@type'] === 'FAQPage');
    assert.equal(faq.mainEntity.length, 4);
    for (let i = 0; i < faq.mainEntity.length; i++) {
      const entry = faq.mainEntity[i];
      assert.equal(await page.locator('#duvidas summary').nth(i).textContent(), entry.name);
      assert.equal(await page.locator('#duvidas details p').nth(i).textContent(), entry.acceptedAnswer.text);
    }
    assert.equal(await page.locator('meta[property="og:title"]').count(), 1);
    assert.equal(await page.locator('.asf-sat-nav a').count(), 20);
    assert.equal(await page.locator('.asf-sat-nav a[aria-current="page"]').count(), 1);
    const missingAnchors = await page.locator('a[href^="#"]').evaluateAll(links => links.filter(a => !document.getElementById(a.hash.slice(1))).map(a => a.hash));
    assert.deepEqual(missingAnchors, []);
    check('FAQ matches structured data, metadata is unique, navigation anchors are valid');

    for (const width of [1440, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(() => scrollTo(0,0));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `No overflow at ${width}px`);
      if (process.env.SCREENSHOT_DIR && [1440,390].includes(width)) {
        fs.mkdirSync(process.env.SCREENSHOT_DIR, { recursive:true });
        await page.screenshot({ path:path.join(process.env.SCREENSHOT_DIR, `treino-${width}.png`), fullPage: true });
      }
    }
    check('no page-level horizontal overflow at 320, 390, 768, 1024 and 1440px');
    await page.goto(origin);
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.className), 'skip-link');
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'conteudo');
    await page.locator('[data-id="0-1"]').focus();
    await page.keyboard.press('Space');
    assert.equal(await page.locator('[data-id="0-1"]').isChecked(), true);
    assert.notEqual(await page.locator('[data-id="0-1"]').evaluate(el => getComputedStyle(el).outlineStyle), 'none');
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior), 'auto');
    assert.deepEqual(errors, []);
    check('skip link, keyboard checks, focus outline and reduced-motion preference work; no JS errors');

    // Corrupt and unsupported saved data are retained, never silently overwritten.
    for (const raw of ['{invalid-json', 'null', '[true,false]']) {
      await page.goto(origin + '/seed');
      await page.evaluate(([key, value]) => localStorage.setItem(key, value), [KEY, raw]);
      await page.goto(origin);
      assert.equal(await page.locator('#storage-status').isVisible(), true);
      await page.locator('[data-id="0-0"]').check();
      assert.equal(await page.evaluate(key => localStorage.getItem(key), KEY), raw);
    }
    check('malformed storage is preserved with a visible session-only warning');
    await context.close();

    const denied = await browser.newContext();
    await denied.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
    await denied.addInitScript(() => Object.defineProperty(window, 'localStorage', { get(){ throw new DOMException('Blocked', 'SecurityError'); } }));
    const deniedPage = await denied.newPage();
    await deniedPage.goto(origin);
    assert.equal(await deniedPage.locator('#planos input').count(), 19);
    await deniedPage.locator('[data-id="1-0"]').check();
    assert.equal(await deniedPage.locator('#progress').getAttribute('aria-valuenow'), '1');
    assert.equal(await deniedPage.locator('#storage-status').isVisible(), true);
    await denied.close();
    check('blocked localStorage does not break checklist rendering or session interaction');

    const nojs = await browser.newContext({ javaScriptEnabled:false });
    await nojs.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
    const nojsPage = await nojs.newPage();
    await nojsPage.goto(origin);
    assert.equal(await nojsPage.locator('noscript').isVisible(), true);
    assert.equal(await nojsPage.locator('#plano-30-dias details').count(), 5);
    await nojs.close();
    check('without JavaScript the guide and clear fallback remain available');
    console.log(`\n${checks} regression groups passed. External services were blocked, not validated.`);
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
