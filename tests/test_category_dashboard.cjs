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
  console.log(`Starting Category Detail & Reading Intervals test against ${TARGET_URL}...`);
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--window-size=1440,1200']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1200 });

  try {
    // 1. Open Dashboard
    await page.goto(TARGET_URL, { waitUntil: 'networkidle0', timeout: 30000 });
    await sleep(2000);

    // 2. Click on the Electricity card to navigate to Strom Detail
    console.log('Navigating to Electricity Detail Dashboard...');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const stromBtn = buttons.find(b => b.textContent.includes('Strom-Analyse öffnen') || (b.textContent.includes('Strom') && b.textContent.includes('Details')));
      if (stromBtn) {
        stromBtn.click();
        return;
      }
      const cards = Array.from(document.querySelectorAll('.glass-card'));
      const card = cards.find(c => c.textContent.includes('Strom') && c.textContent.includes('kWh'));
      if (card) {
        const btn = card.querySelector('button');
        if (btn) btn.click();
        else card.click();
      }
    });

    await sleep(2000);

    // Take screenshot of Strom Detail (Intervals + Timeline Chart)
    console.log('Saving Strom Detail with Intervals and Timeline Points...');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'category_detail_electricity.png'), fullPage: true });

    // 3. Test Timeframe Switcher on Timeline Chart (click 'Alle')
    console.log('Clicking "Alle" timeframe on Timeline Chart...');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const alleBtn = buttons.find(b => b.textContent.trim() === 'Alle');
      if (alleBtn) alleBtn.click();
    });
    await sleep(1000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'category_detail_electricity_all_timeframe.png'), fullPage: false });

    // 4. Test Switching to Aggregated Bars View
    console.log('Switching to "Verbrauchs-Balken & Prognose" tab...');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const barsBtn = buttons.find(b => b.textContent.includes('Verbrauchs-Balken'));
      if (barsBtn) barsBtn.click();
    });
    await sleep(1000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'category_detail_electricity_bars.png'), fullPage: false });

    // Switch back to timeline mode
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const timelineBtn = buttons.find(b => b.textContent.includes('Reale Zählerpunkte'));
      if (timelineBtn) timelineBtn.click();
    });
    await sleep(800);

    // 5. Switch to Gas category tab
    console.log('Switching to Gas category...');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const gasBtn = buttons.find(b => b.textContent.includes('Gas'));
      if (gasBtn) gasBtn.click();
    });
    await sleep(1500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'category_detail_gas.png'), fullPage: true });
    console.log('Saved category_detail_gas.png');

    // 6. Switch to Water category tab
    console.log('Switching to Water category...');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const wasserBtn = buttons.find(b => b.textContent.includes('Wasser'));
      if (wasserBtn) wasserBtn.click();
    });
    await sleep(1500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'category_detail_water.png'), fullPage: true });
    console.log('Saved category_detail_water.png');

    console.log('All Category Detail Dashboard tests completed successfully!');
  } catch (err) {
    console.error('Test error:', err);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'error_category_detail.png'), fullPage: true });
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
