let puppeteer;
try {
  puppeteer = require('puppeteer-core');
} catch (e) {
  puppeteer = require('puppeteer');
}
const fs = require('fs');
const path = require('path');

const TARGET_URL = process.env.TARGET_URL || 'http://meterpulse-frontend:80';
const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR || '/screenshots';
const CHROME_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser';

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

(async () => {
  console.log(`Starting Export Modal & AI Prompt / CSV test against ${TARGET_URL}...`);
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--window-size=1440,1100']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1100 });

  try {
    // 1. Open Dashboard
    console.log('Navigating to Dashboard...');
    await page.goto(TARGET_URL, { waitUntil: 'networkidle0', timeout: 30000 });
    await sleep(2000);

    // Capture dashboard showing the export button
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'dashboard_with_export_button.png'), fullPage: false });
    console.log('Saved dashboard_with_export_button.png');

    // 2. Click "KI-Export & CSV" in Navbar
    console.log('Clicking "KI-Export & CSV" button in Navbar...');
    const clickedNavExport = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find(b => b.textContent.includes('KI-Export & CSV') || b.textContent.includes('Export'));
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });

    if (!clickedNavExport) {
      throw new Error('Could not find KI-Export button in Navbar');
    }

    // 3. Wait for modal to render and fetch data
    console.log('Waiting for ExportModal to load...');
    await sleep(2500);

    // 4. Click "Prompt kopieren" to verify feedback
    console.log('Clicking "Prompt kopieren"...');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const copyBtn = buttons.find(b => b.textContent.includes('Prompt kopieren'));
      if (copyBtn) copyBtn.click();
    });
    await sleep(500);

    // Take screenshot of AI tab with copied state
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'export_modal_ai_prompt.png'), fullPage: false });
    console.log('Saved export_modal_ai_prompt.png');

    // 5. Switch to CSV Tab
    console.log('Switching to CSV Tab...');
    await page.evaluate(() => {
      const csvTab = document.querySelector('button[data-testid="tab-csv-download"]');
      if (csvTab) csvTab.click();
    });
    await sleep(1500);

    // Take screenshot of CSV tab
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'export_modal_csv_download.png'), fullPage: false });
    console.log('Saved export_modal_csv_download.png');

    console.log('All export modal tests completed successfully!');
  } catch (err) {
    console.error('Test failed with error:', err);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'error_export_modal.png'), fullPage: true });
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
