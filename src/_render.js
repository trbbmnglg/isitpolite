// Browser Rendering wrapper — isolates @cloudflare/puppeteer so this is the
// single file to swap if the binding changes (e.g. companion Worker fallback).
// Requires the [browser] binding in wrangler.toml and Workers Paid plan.
import puppeteer from '@cloudflare/puppeteer';

// Defaults
const DEFAULT_VIEWPORT = { width: 1200, height: 800, deviceScaleFactor: 2 };

/**
 * Render an HTML string to a PNG buffer.
 * @param {*} env  — Cloudflare Workers env (needs env.BROWSER)
 * @param {string} html — self-contained HTML (inline CSS, base64 fonts)
 * @param {{ width?, height?, clip? }} [opts]
 * @returns {Promise<Uint8Array>}  PNG bytes
 */
export async function htmlToPng(env, html, opts) {
  opts = opts || {};
  const browser = await puppeteer.launch(env.BROWSER);
  try {
    const page = await browser.newPage();
    await page.setViewport({
      width: opts.width || DEFAULT_VIEWPORT.width,
      height: opts.height || DEFAULT_VIEWPORT.height,
      deviceScaleFactor: DEFAULT_VIEWPORT.deviceScaleFactor,
    });
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const clip = opts.clip || undefined;
    const screenshot = await page.screenshot({ type: 'png', fullPage: !clip, clip });
    return screenshot; // Uint8Array
  } finally {
    await browser.close();
  }
}

/**
 * Render an HTML string to a PDF buffer.
 * @param {*} env
 * @param {string} html
 * @param {{ format?, margin? }} [opts]
 * @returns {Promise<Uint8Array>}  PDF bytes
 */
export async function htmlToPdf(env, html, opts) {
  opts = opts || {};
  const browser = await puppeteer.launch(env.BROWSER);
  try {
    const page = await browser.newPage();
    await page.setViewport(DEFAULT_VIEWPORT);
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: opts.format || 'A4',
      printBackground: true,
      margin: opts.margin || { top: '20px', bottom: '20px', left: '20px', right: '20px' },
    });
    return pdf; // Uint8Array
  } finally {
    await browser.close();
  }
}

/**
 * Convert a Uint8Array to a base64 string (for email attachments).
 */
export function toBase64(bytes) {
  let binary = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
