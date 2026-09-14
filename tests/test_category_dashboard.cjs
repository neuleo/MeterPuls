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
  console.log(`Starting Category Detail & Heating Season test against ${TARGET_URL}...`);
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--window-size=1440,1050']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1050 });

  try {
    // 1. Open Dashboard
    await page.goto(TARGET_URL, { waitUntil: 'networkidle0', timeout: 30000 });
    await sleep(2000);

    // 2. Click on the Gas StatCard footer link or card to navigate to Gas Detail
    console.log('Navigating to Gas Detail Dashboard...');
    const gasCardClicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const gasBtn = buttons.find(b => b.textContent.includes('Gas-Analyse öffnen') || (b.textContent.includes('Gas') && b.textContent.includes('Details')));
      if (gasBtn) {
        gasBtn.click();
        return true;
      }
      return false;
    });

    if (!gasCardClicked) {
      console.log('Using direct fallback by clicking Gas card container...');
      await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('.glass-card'));
        const gasCard = cards.find(c => c.textContent.includes('Gas') && c.textContent.includes('m³'));
        if (gasCard) {
          const btn = gasCard.querySelector('button');
          if (btn) btn.click();
          else gasCard.click();
        }
      });
    }

    await sleep(2000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'category_detail_gas.png'), fullPage: false });
    console.log('Saved category_detail_gas.png');

    // 3. Switch to Electricity category tab
    console.log('Switching to Electricity category...');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const stromBtn = buttons.find(b => b.textContent.includes('Strom'));
      if (stromBtn) stromBtn.click();
    });
    await sleep(1500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'category_detail_electricity.png'), fullPage: false });
    console.log('Saved category_detail_electricity.png');

    // 4. Switch to Water category tab
    console.log('Switching to Water category...');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const wasserBtn = buttons.find(b => b.textContent.includes('Wasser'));
      if (wasserBtn) wasserBtn.click();
    });
    await sleep(1500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'category_detail_water.png'), fullPage: false });
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
