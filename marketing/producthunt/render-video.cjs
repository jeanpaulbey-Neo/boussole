/* Génère la vidéo promo (WebM 1080p) à partir de slideshow.html + les PNG.
   Prérequis : Node + playwright (avec Chromium). Régénère d'abord les PNG via render.cjs.
   Usage : node marketing/producthunt/render-video.cjs
   Sortie : marketing/producthunt/optiboussole-promo.webm
   (Pour un MP4 : convertir la WebM, ou l'uploader sur YouTube pour le lien Product Hunt.) */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const dir = __dirname;

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir, size: { width: 1920, height: 1080 } },
  });
  const page = await ctx.newPage();
  await page.goto('file://' + path.join(dir, 'slideshow.html'), { waitUntil: 'load' });
  try { await page.evaluate(() => document.fonts.ready); } catch (e) {}
  await page.waitForTimeout(21500); // 5 slides x ~4.2 s
  await page.close();
  await ctx.close(); // finalise la vidéo
  await browser.close();
  const tmp = fs.readdirSync(dir).find(f => f.endsWith('.webm') && f !== 'optiboussole-promo.webm');
  if (tmp) fs.renameSync(path.join(dir, tmp), path.join(dir, 'optiboussole-promo.webm'));
  console.log('OK optiboussole-promo.webm');
})().catch(e => { console.error(e); process.exit(1); });
