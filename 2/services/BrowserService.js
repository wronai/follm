// services/BrowserService.js
const { chromium } = require('playwright');

class BrowserService {
  constructor() {
    this.browsers = new Map();
    this.pages = new Map();
  }

  async createSession(sessionId) {
    const browser = await chromium.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    // Enable accessibility tree
    await page.setExtraHTTPHeaders({
      'User-Agent': 'FormAutomation/1.0'
    });

    this.browsers.set(sessionId, browser);
    this.pages.set(sessionId, page);

    return sessionId;
  }

  async getPage(sessionId) {
    return this.pages.get(sessionId);
  }

  async closeSession(sessionId) {
    const browser = this.browsers.get(sessionId);
    if (browser) {
      await browser.close();
      this.browsers.delete(sessionId);
      this.pages.delete(sessionId);
    }
  }

  async navigateTo(sessionId, url) {
    const page = this.pages.get(sessionId);
    if (!page) throw new Error('Session not found');

    await page.goto(url, { waitUntil: 'networkidle' });

    // Take initial screenshot
    await page.screenshot({
      path: `screenshots/initial_${sessionId}.png`,
      fullPage: true
    });

    return page.url();
  }

  async getFormStructure(sessionId) {
    const page = this.pages.get(sessionId);
    if (!page) throw new Error('Session not found');

    // Get accessibility tree
    const accessibility = await page.accessibility.snapshot();

    // Get HTML structure
    const html = await page.evaluate(() => {
      const forms = document.querySelectorAll('form');
      return Array.from(forms).map(form => form.outerHTML).join('\n');
    });

    return { html, accessibility };
  }
}

module.exports = BrowserService;