const puppeteer = require('puppeteer-core');
const fs = require('fs');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--headless=new']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 950 });
  await page.goto('http://meterpulse-frontend:80', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1500));

  // Open Scan Modal
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Zähler scannen'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  // Upload the 2 real photos from the shared /app/data volume
  const fileInputs = await page.$$('input[type="file"]');
  if (fileInputs.length > 0) {
    await fileInputs[0].uploadFile(
      '/app/data/uploads/scan_a8940f1176a94c11b7af7ccddf7c2e63.jpg',
      '/app/data/uploads/scan_7913d62b48fc4e57b139062738464549.jpg'
    );
    console.log('Uploaded 2 real meter photos into UI file input');
  }

  // Wait for AI recognition to complete for all items (up to 45s)
  console.log('Waiting for all AI analysis to complete in UI...');
  await page.waitForFunction(() => {
    return !document.body.innerText.includes('KI liest ab');
  }, { timeout: 45000 }).catch(e => console.log('Timeout waiting for completion:', e.message));

  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: '/screenshots/real_ai_scan_success.png' });
  console.log('Saved /screenshots/real_ai_scan_success.png successfully!');

  await browser.close();
})();
