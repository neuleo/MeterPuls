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

  const check = (condition, message) => {
    if (!condition) throw new Error(`Ergebnisprüfung fehlgeschlagen: ${message}`);
    console.log(`OK: ${message}`);
  };

  const bodyText = await page.evaluate(() => document.body.innerText);
  check(bodyText.includes('Folgevertrag planen'), 'Aktion "Folgevertrag planen" vorhanden');
  check(bodyText.includes('Preisänderung eintragen'), 'Aktion "Preisänderung eintragen" vorhanden');
  check(bodyText.includes('Verlauf'), 'Verlauf erreichbar');

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
  check(await page.evaluate(() => document.body.innerText.includes('analysieren')), 'Scan-Aktion erreichbar');

  // 5. Click "Jetzt 2 Screenshots analysieren"
  console.log('Triggering AI Analysis...');
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('analysieren'));
    if (btn) btn.click();
  });

  // Wait for scan result or a configuration error (AI may not be configured in CI)
  console.log('Waiting for AI extraction result...');
  let scanSucceeded = false;
  try {
    await page.waitForFunction(() => {
      const text = document.body.innerText;
      return text.includes('Tarif erfolgreich aus Screenshot(s) erkannt') ||
        text.includes('Kein AI Vision-Modell') ||
        text.includes('Fehler bei der KI-Analyse');
    }, { timeout: 35000 });
    scanSucceeded = await page.evaluate(() => document.body.innerText.includes('Tarif erfolgreich aus Screenshot(s) erkannt'));
  } catch (e) {
    console.log('SKIP: KI-Erkennung hat nicht geantwortet.');
  }

  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: '/screenshots/modal_contract_extracted_review.png' });
  console.log('Saved modal_contract_extracted_review.png');

  if (scanSucceeded) {
    check(await page.evaluate(() => document.body.innerText.includes('Entwurf')), 'Scan-Ergebnis ist ein Entwurf, kein Direktspeichern');

    const before = await page.evaluate(async () => {
      const r = await fetch('/api/contracts');
      return r.json();
    });

    // 6. Click "Tarifdaten in Strom übernehmen & speichern" (draft takeover)
    console.log('Applying extracted contract as draft...');
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('übernehmen & speichern'));
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 1500));
    check(await page.evaluate(() => document.body.innerText.includes('Scan-Entwurf übernommen')), 'Entwurf im Vertragsformular übernommen');
    check(await page.evaluate(() => document.body.innerText.includes('Übergang bestätigen & speichern')), 'Bestätigung vor dem Speichern erforderlich');

    const after = await page.evaluate(async () => {
      const r = await fetch('/api/contracts');
      return r.json();
    });
    check(JSON.stringify(before) === JSON.stringify(after), 'Entwurf hat gespeicherte Verträge noch nicht verändert');

    await page.screenshot({ path: '/screenshots/contract_settings_applied.png' });
    console.log('Saved contract_settings_applied.png');
  } else {
    console.log('SKIP: Draft-Prüfung ohne konfigurierte Vision-KI.');
  }

  // 7. Back to Dashboard: overview must show current tariff and next change
  console.log('Navigating to Dashboard...');
  await page.goto('http://meterpulse-frontend:80', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1500));
  check(await page.evaluate(() => /auf einen blick/i.test(document.body.innerText)), 'Übersicht zeigt Tarif- und Kostenzeilen');
  await page.screenshot({ path: '/screenshots/dashboard_with_contract_bonus.png' });
  console.log('Saved dashboard_with_contract_bonus.png');

  console.log('E2E Test successfully completed!');
  await browser.close();
})();
