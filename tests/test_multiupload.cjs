const puppeteer = require('puppeteer-core');
const fs = require('fs');

(async () => {
  const fakeJpg = Buffer.from([
    0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
    0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
    0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11,
    0x00, 0xFF, 0xC4, 0x00, 0x14, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x09, 0xFF, 0xDA,
    0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F, 0x00, 0x7F, 0x00, 0xFF, 0xD9
  ]);
  fs.writeFileSync('/tmp/strom.jpg', fakeJpg);
  fs.writeFileSync('/tmp/gas.jpg', fakeJpg);
  fs.writeFileSync('/tmp/wasser.jpg', fakeJpg);

  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--headless=new']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto('http://meterpulse-frontend:80', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 2000));

  // Open Scan Modal
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Zähler scannen'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  // Upload all 3 files at once
  const fileInputs = await page.$$('input[type="file"]');
  console.log(`Found ${fileInputs.length} file inputs`);
  if (fileInputs.length > 0) {
    await fileInputs[0].uploadFile('/tmp/strom.jpg', '/tmp/gas.jpg', '/tmp/wasser.jpg');
    console.log('Uploaded 3 files to multiple file input!');
  }

  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: '/screenshots/modal_multi_upload_review.png' });
  console.log('Saved modal_multi_upload_review.png');

  await browser.close();
})();
