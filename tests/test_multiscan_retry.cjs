const puppeteer = require('puppeteer-core');
const fs = require('fs');

const BASE_URL = process.env.TARGET_URL || 'http://meterpulse-frontend:80';
const fakeJpg = Buffer.from([
  0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
  0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
  0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11,
  0x00, 0xFF, 0xC4, 0x00, 0x14, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x09, 0xFF, 0xDA,
  0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F, 0x00, 0x7F, 0x00, 0xFF, 0xD9
]);

function check(condition, message) {
  if (!condition) throw new Error(`Ergebnisprüfung fehlgeschlagen: ${message}`);
  console.log(`OK: ${message}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.writeFileSync('/tmp/mp_a.jpg', fakeJpg);
  fs.writeFileSync('/tmp/mp_b.jpg', fakeJpg);
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--headless=new']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle0' });
    await sleep(1200);

    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('Zähler scannen'));
      if (btn) btn.click();
    });
    await sleep(600);
    const fileInput = await page.$('input[type="file"]');
    check(!!fileInput, 'Mehrfach-Upload-Eingabe vorhanden');
    await fileInput.uploadFile('/tmp/mp_a.jpg', '/tmp/mp_b.jpg');
    await sleep(2500);

    const selects = await page.$$('select');
    for (const select of selects) {
      await select.evaluate((el) => {
        const option = Array.from(el.options).find((o) => o.value && o.value !== '0');
        if (option) {
          el.value = option.value;
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    }

    const token = String(Date.now());
    const numbers = await page.$$('input[type="number"]');
    check(numbers.length >= 2, 'Zwei Zählerstände können eingegeben werden');
    for (let i = 0; i < 2; i++) {
      await numbers[i].evaluate((el, value) => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(el, value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }, String(1000 + i));
    }
    const notesInputs = await page.$$('input[placeholder*="Monatsablesung"]');
    for (let i = 0; i < Math.min(2, notesInputs.length); i++) {
      await notesInputs[i].evaluate((el, value) => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(el, value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }, `${token}-${i}`);
    }

    let uploadCount = 0;
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (req.url().includes('/api/readings/upload-and-create')) {
        uploadCount += 1;
        if (uploadCount === 2) {
          req.abort('failed');
          return;
        }
      }
      req.continue();
    });

    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('Zählerstände speichern'));
      if (btn) btn.click();
    });
    await sleep(2500);
    check(await page.evaluate(() => document.body.innerText.includes('konnten nicht gespeichert werden')), 'Fehlgeschlagener Upload wird angezeigt');
    check(await page.evaluate(() => document.body.innerText.includes('Erneut senden')), 'Nur fehlgeschlagener Eintrag kann erneut gesendet werden');

    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('Erneut senden'));
      if (btn) btn.click();
    });
    await sleep(3000);
    const savedCount = await page.evaluate(() => (document.body.innerText.match(/Gespeichert/g) || []).length);
    check(savedCount >= 2, 'Beide Fotos sind nach dem Wiederholen gespeichert');

    const readings = await page.evaluate(async () => {
      const r = await fetch('/api/readings?limit=200');
      return r.json();
    });
    for (let i = 0; i < 2; i++) {
      const matches = readings.filter((x) => x.notes === `${token}-${i}`);
      check(matches.length === 1, `Genau eine Ablesung je Foto (${i + 1}) – kein Duplikat`);
    }

    console.log('Mehrfachscan-Retry-Test erfolgreich.');
  } finally {
    await browser.close();
  }
})();
