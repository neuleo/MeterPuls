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

function check(condition, message) {
  if (!condition) {
    throw new Error(`Ergebnisprüfung fehlgeschlagen: ${message}`);
  }
  console.log(`OK: ${message}`);
}

async function clickByText(page, text) {
  const clicked = await page.evaluate((needle) => {
    const buttons = Array.from(document.querySelectorAll('button, a'));
    const btn = buttons.find(b => b.textContent && b.textContent.includes(needle));
    if (btn) { btn.click(); return true; }
    return false;
  }, text);
  if (!clicked) throw new Error(`Kein Element mit Text "${text}" gefunden`);
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
    check(title.includes('MeterPulse'), 'Seitentitel enthält MeterPulse');

    const viewport = await page.$eval('meta[name="viewport"]', el => el.content);
    check(!viewport.includes('maximum-scale') && !viewport.includes('user-scalable=no'), 'Zoomsperre ist entfernt');

    const overview = await page.evaluate(() => /auf einen blick/i.test(document.body.innerText));
    check(overview, 'Overview zeigt verdichtete Zeilen (Auf einen Blick)');
    const nav = await page.$('button[aria-label="Zähler scannen"]');
    check(!!nav, 'Untere Navigation mit Scan-Aktion vorhanden');

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

    // URL routing: category detail is addressable, browser back returns to overview
    await clickByText(page, 'Strom');
    await sleep(1200);
    check(page.url().endsWith('/category/electricity'), 'Kategoriedetail ist über URL erreichbar');
    await page.goBack({ waitUntil: 'networkidle0' });
    await sleep(1000);
    check(new URL(page.url()).pathname === '/', 'Browser-Zurück führt vom Detail zur Übersicht');

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

    // Manual capture without photo: available at 390 px and usable at 360 px
    check(await page.evaluate(() => document.body.innerText.includes('Manuell eingeben')), 'Manuelle Erfassung ohne Foto angeboten');
    await clickByText(page, 'Manuell eingeben');
    await sleep(800);
    check(await page.$('[role="dialog"]') !== null, 'Manuelles Formular als beschrifteter Dialog geöffnet');
    await clickByText(page, 'Ablesung erfassen');
    await sleep(500);
    check(await page.$('input[type="number"]') !== null, 'Manuelles Eingabefeld erreichbar');

    const testValue = String(900000 + (Date.now() % 100000));
    await page.$eval('input[type="number"]', (el, value) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, testValue);
    await clickByText(page, 'Ablesung eintragen');
    await sleep(1500);
    const saved = await page.evaluate(async (value) => {
      const response = await fetch('/api/readings?limit=50');
      const items = await response.json();
      return items.some((item) => Math.abs(item.reading_value - Number(value)) < 0.001);
    }, testValue);
    check(saved, 'Zählerstand ohne Foto gespeichert (API-Historie)');

    await page.setViewport({ width: 360, height: 780, isMobile: true, hasTouch: true });
    await sleep(800);
    const narrowNav = await page.$('button[aria-label="Zähler scannen"]');
    check(!!narrowNav, 'Navigation bei 360 px weiterhin bedienbar');
    const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2);
    check(noOverflow, 'Kein horizontaler Überlauf bei 360 px');

    console.log('All tests passed! Timeframe, persistence, URLs and mobile capture verified.');
  } catch (err) {
    console.error('Puppeteer test failed:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

runTests();
