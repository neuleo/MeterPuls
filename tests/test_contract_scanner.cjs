const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

(async () => {
  console.log('Starting Contract Scanner & Bonus E2E Test...');
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--headless=new']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 900 });

  // 1. Open App
  await page.goto('http://meterpulse-frontend:80', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1500));

  // 2. Navigate to "Verträge"
  console.log('Navigating to Verträge...');
  await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a, button'));
    const contractLink = links.find(el => el.textContent.includes('Verträge'));
    if (contractLink) contractLink.click();
  });
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: '/screenshots/contract_settings_initial.png' });
  console.log('Saved contract_settings_initial.png');

  // 3. Open "Tarif-Screenshots per KI scannen" Modal
  console.log('Opening ScanContractModal...');
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Tarif-Screenshots per KI scannen'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  // 4. Upload 2 screenshots
  const fileInput = await page.$('input[type="file"]');
  if (fileInput) {
    const file1 = path.resolve('/app/test_contract_p1.png');
    const file2 = path.resolve('/app/test_contract_p2.png');
    await fileInput.uploadFile(file1, file2);
    console.log('Uploaded 2 screenshots to ScanContractModal!');
  } else {
    console.error('File input not found!');
  }
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: '/screenshots/modal_contract_files_selected.png' });
  console.log('Saved modal_contract_files_selected.png');

  // 5. Click "Jetzt 2 Screenshots analysieren"
  console.log('Triggering AI Analysis...');
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('analysieren'));
    if (btn) btn.click();
  });

  // Wait for scan to complete (AI call)
  console.log('Waiting for AI extraction to complete...');
  await page.waitForFunction(() => {
    return document.body.innerText.includes('Tarif erfolgreich aus Screenshot(s) erkannt');
  }, { timeout: 35000 });

  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: '/screenshots/modal_contract_extracted_review.png' });
  console.log('Saved modal_contract_extracted_review.png');

  // 6. Click "Tarifdaten in Strom übernehmen & speichern"
  console.log('Applying extracted contract to Strom...');
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('übernehmen & speichern'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 2500));
  await page.screenshot({ path: '/screenshots/contract_settings_applied.png' });
  console.log('Saved contract_settings_applied.png');

  // 7. Navigate back to Dashboard to see updated calculations & bonus badge
  console.log('Navigating to Dashboard...');
  await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a, button'));
    const dashLink = links.find(el => el.textContent.includes('Dashboard'));
    if (dashLink) dashLink.click();
  });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: '/screenshots/dashboard_with_contract_bonus.png' });
  console.log('Saved dashboard_with_contract_bonus.png');

  console.log('E2E Test successfully completed!');
  await browser.close();
})();
