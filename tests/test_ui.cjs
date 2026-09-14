let puppeteer;
try {
  puppeteer = require('puppeteer-core');
} catch (e) {
  puppeteer = require('puppeteer');
}
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.TARGET_URL || 'http://meterpulse-frontend:80';
const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR || '/screenshots';
const CHROME_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser';

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
  console.log(`Starting MeterPulse Puppeteer UI Verification against ${BASE_URL}...`);
  console.log(`Using Chrome binary: ${CHROME_PATH}`);

  const launchOptions = {
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--no-first-run',
      '--headless=new'
    ]
  };

  if (fs.existsSync(CHROME_PATH)) {
    launchOptions.executablePath = CHROME_PATH;
  }

  const browser = await puppeteer.launch(launchOptions);

  try {
    const page = await browser.newPage();

    // 1. Desktop Test (1280x800)
    console.log('--- Testing Desktop Viewport (1280x800) ---');
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(BASE_URL, { waitUntil: 'networkidle0', timeout: 30000 });
    await sleep(2000);

    // Verify Title
    const title = await page.title();
    console.log(`Page title: "${title}"`);

    // Screenshot initial 30d Dashboard
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'desktop_dashboard_30d.png'), fullPage: false });
    console.log('Saved screenshot: desktop_dashboard_30d.png');

    // 2. Test Timeframe Switching to "Jahr 2026"
    console.log('Testing click on "Jahr 2026" / "Jahr"...');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find(b => b.textContent.includes('Jahr'));
      if (btn) btn.click();
    });
    await sleep(2000);

    // Verify that the view changed and shows year data
    const pageContent = await page.content();
    const hasYearBadge = pageContent.includes('Jahr 2026');
    console.log(`Year badge displayed on StatCards: ${hasYearBadge}`);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'desktop_dashboard_year.png'), fullPage: false });
    console.log('Saved screenshot: desktop_dashboard_year.png');

    // 3. Test Persistence across Page Reload
    console.log('Testing localStorage persistence across page reload...');
    await page.reload({ waitUntil: 'networkidle0', timeout: 30000 });
    await sleep(2000);

    const reloadedContent = await page.content();
    const persistedYear = reloadedContent.includes('Jahr 2026');
    console.log(`Persisted Year 2026 after reload: ${persistedYear}`);
    if (!persistedYear) {
      throw new Error('Persistence test failed: Year view was not restored after reload!');
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'desktop_dashboard_persisted.png'), fullPage: false });
    console.log('Saved screenshot: desktop_dashboard_persisted.png');

    // 4. Test Tab Navigation & Tab Persistence
    console.log('Navigating to "Zähler"...');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find(b => b.textContent.includes('Zähler'));
      if (btn) btn.click();
    });
    await sleep(1500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'desktop_meters.png'), fullPage: false });
    console.log('Saved screenshot: desktop_meters.png');

    // Reload while on "Zähler" tab to verify tab persistence
    await page.reload({ waitUntil: 'networkidle0', timeout: 30000 });
    await sleep(1500);
    const zählerPersisted = (await page.content()).includes('Zähler-Verwaltung');
    console.log(`Persisted "Zähler" tab after reload: ${zählerPersisted}`);
    if (!zählerPersisted) {
      throw new Error('Persistence test failed: Zähler tab was not restored after reload!');
    }

    // Navigate to "Tarife & Verträge"
    console.log('Navigating to "Tarife & Verträge"...');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find(b => b.textContent.includes('Tarife'));
      if (btn) btn.click();
    });
    await sleep(1500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'desktop_contracts.png'), fullPage: false });
    console.log('Saved screenshot: desktop_contracts.png');

    // Navigate to "KI-Settings"
    console.log('Navigating to "KI-Settings"...');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find(b => b.textContent.includes('KI-Settings') || b.textContent.includes('KI'));
      if (btn) btn.click();
    });
    await sleep(1500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'desktop_ai_settings.png'), fullPage: false });
    console.log('Saved screenshot: desktop_ai_settings.png');

    // 5. Mobile Test (390x844)
    console.log('--- Testing Mobile Viewport (390x844) ---');
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

    // Go back to Dashboard
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find(b => b.textContent.includes('Dashboard'));
      if (btn) btn.click();
    });
    await sleep(1500);

    // Switch to 90 Tage on mobile
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find(b => b.textContent.includes('90 Tage'));
      if (btn) btn.click();
    });
    await sleep(1500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'mobile_dashboard_90d.png'), fullPage: false });
    console.log('Saved screenshot: mobile_dashboard_90d.png');

    // Open Scan Modal via Camera FAB
    console.log('Clicking Camera FAB on mobile...');
    await page.evaluate(() => {
      const fab = document.querySelector('button[aria-label="Zähler scannen"]');
      if (fab) fab.click();
    });
    await sleep(1500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'mobile_scan_modal.png'), fullPage: false });
    console.log('Saved screenshot: mobile_scan_modal.png');

    console.log('All tests passed! Timeframe switching & localStorage persistence verified successfully.');
  } catch (err) {
    console.error('Puppeteer test failed:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

runTests();
