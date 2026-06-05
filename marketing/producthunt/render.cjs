/* Rendu des visuels Product Hunt : SVG -> PNG (2x), polices + emoji inclus.
   Prérequis : Node + playwright (avec Chromium).
   Usage : node marketing/producthunt/render.cjs */
const { chromium } = require('playwright');
const path = require('path');

const dir = __dirname;
const jobs = [
  ['ph-01-thumbnail', 240, 240],
  ['ph-02-hero', 1270, 760],
  ['ph-03-bilan', 1270, 760],
  ['ph-04-impots', 1270, 760],
  ['ph-05-droits', 1270, 760],
  ['ph-06-privacy', 1270, 760],
];

(async () => {
  const browser = await chromium.launch();
  for (const [name, w, h] of jobs) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
    await page.goto('file://' + path.join(dir, name + '.svg'), { waitUntil: 'load' });
    try { await page.evaluate(() => document.fonts.ready); } catch (e) {}
    await page.waitForTimeout(800); // marge chargement Google Fonts + emoji
    await page.screenshot({ path: path.join(dir, name + '.png'), clip: { x: 0, y: 0, width: w, height: h } });
    await page.close();
    console.log('OK ' + name + '.png (' + (w * 2) + 'x' + (h * 2) + ')');
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
