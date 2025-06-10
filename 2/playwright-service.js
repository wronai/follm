// playwright-service.js - Dedykowany serwis browser pool
const express = require('express');
const { chromium } = require('playwright');
const { v4: uuidv4 } = require('uuid');

class PlaywrightService {
  constructor() {
    this.app = express();
    this.browsers = new Map();
    this.pages = new Map();
    this.maxBrowsers = parseInt(process.env.BROWSER_POOL_SIZE) || 5;
    this.activeBrowsers = 0;

    this.setupMiddleware();
    this.setupRoutes();
    this.setupCleanup();
  }

  setupMiddleware() {
    this.app.use(express.json({ limit: '50mb' }));

    // Request logging
    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
      next();
    });

    // Error handling
    this.app.use((error, req, res, next) => {
      console.error('Playwright service error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    });
  }

  setupRoutes() {
    // Create new browser session
    this.app.post('/sessions', async (req, res) => {
      try {
        if (this.activeBrowsers >= this.maxBrowsers) {
          return res.status(429).json({
            success: false,
            error: 'Maximum browser limit reached',
            maxBrowsers: this.maxBrowsers,
            activeBrowsers: this.activeBrowsers
          });
        }

        const sessionId = uuidv4();
        const { headless = true, viewport, userAgent, extraHTTPHeaders } = req.body;

        const browser = await chromium.launch({
          headless: headless,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
          ]
        });

        const context = await browser.newContext({
          viewport: viewport || { width: 1920, height: 1080 },
          userAgent: userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          extraHTTPHeaders: extraHTTPHeaders || {}
        });

        const page = await context.newPage();

        // Enable console logging
        page.on('console', msg => {
          console.log(`Browser console [${sessionId}]:`, msg.text());
        });

        // Handle errors
        page.on('pageerror', error => {
          console.error(`Page error [${sessionId}]:`, error);
        });

        this.browsers.set(sessionId, { browser, context });
        this.pages.set(sessionId, page);
        this.activeBrowsers++;

        res.json({
          success: true,
          sessionId,
          message: 'Browser session created',
          activeBrowsers: this.activeBrowsers
        });

      } catch (error) {
        console.error('Error creating browser session:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Navigate to URL
    this.app.post('/sessions/:sessionId/navigate', async (req, res) => {
      try {
        const { sessionId } = req.params;
        const { url, waitUntil = 'networkidle' } = req.body;

        const page = this.pages.get(sessionId);
        if (!page) {
          return res.status(404).json({
            success: false,
            error: 'Session not found'
          });
        }

        await page.goto(url, {
          waitUntil,
          timeout: 30000
        });

        // Take initial screenshot
        const screenshot = await page.screenshot({
          fullPage: true,
          path: `/app/screenshots/initial_${sessionId}.png`
        });

        res.json({
          success: true,
          url: page.url(),
          title: await page.title(),
          screenshot: `initial_${sessionId}.png`
        });

      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Get page structure
    this.app.get('/sessions/:sessionId/structure', async (req, res) => {
      try {
        const { sessionId } = req.params;
        const page = this.pages.get(sessionId);

        if (!page) {
          return res.status(404).json({
            success: false,
            error: 'Session not found'
          });
        }

        // Get form structure
        const formData = await page.evaluate(() => {
          const forms = Array.from(document.querySelectorAll('form'));
          return forms.map(form => {
            const inputs = Array.from(form.querySelectorAll('input, textarea, select'));
            return {
              action: form.action,
              method: form.method,
              fields: inputs.map(input => ({
                name: input.name,
                id: input.id,
                type: input.type,
                placeholder: input.placeholder,
                required: input.required,
                tagName: input.tagName.toLowerCase(),
                className: input.className,
                ariaLabel: input.getAttribute('aria-label'),
                dataTestId: input.getAttribute('data-testid')
              }))
            };
          });
        });

        // Get accessibility tree
        const accessibility = await page.accessibility.snapshot();

        res.json({
          success: true,
          forms: formData,
          accessibility,
          url: page.url(),
          title: await page.title()
        });

      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Fill form field
    this.app.post('/sessions/:sessionId/fill', async (req, res) => {
      try {
        const { sessionId } = req.params;
        const { selector, value, strategy = 'auto' } = req.body;

        const page = this.pages.get(sessionId);
        if (!page) {
          return res.status(404).json({
            success: false,
            error: 'Session not found'
          });
        }

        let success = false;
        let usedStrategy = '';
        let error = null;

        // Multiple filling strategies
        const strategies = [
          {
            name: 'playwright_fill',
            action: async () => {
              await page.fill(selector, value, { timeout: 5000 });
              usedStrategy = 'playwright_fill';
              success = true;
            }
          },
          {
            name: 'locator_fill',
            action: async () => {
              await page.locator(selector).fill(value, { timeout: 5000 });
              usedStrategy = 'locator_fill';
              success = true;
            }
          },
          {
            name: 'evaluate_fill',
            action: async () => {
              await page.evaluate((sel, val) => {
                const element = document.querySelector(sel);
                if (element) {
                  element.value = val;
                  element.dispatchEvent(new Event('input', { bubbles: true }));
                  element.dispatchEvent(new Event('change', { bubbles: true }));
                }
              }, selector, value);
              usedStrategy = 'evaluate_fill';
              success = true;
            }
          },
          {
            name: 'type_fill',
            action: async () => {
              await page.click(selector);
              await page.keyboard.selectAll();
              await page.type(selector, value);
              usedStrategy = 'type_fill';
              success = true;
            }
          }
        ];

        // Try strategies until one works
        for (const strategyObj of strategies) {
          try {
            await strategyObj.action();
            break;
          } catch (err) {
            error = err.message;
            continue;
          }
        }

        res.json({
          success,
          selector,
          value: success ? value : undefined,
          strategy: usedStrategy,
          error: success ? null : error
        });

      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Upload file
    this.app.post('/sessions/:sessionId/upload', async (req, res) => {
      try {
        const { sessionId } = req.params;
        const { selector, filePath } = req.body;

        const page = this.pages.get(sessionId);
        if (!page) {
          return res.status(404).json({
            success: false,
            error: 'Session not found'
          });
        }

        const fileInput = page.locator(selector);
        await fileInput.setInputFiles(filePath);

        res.json({
          success: true,
          selector,
          filePath,
          message: 'File uploaded successfully'
        });

      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Click element
    this.app.post('/sessions/:sessionId/click', async (req, res) => {
      try {
        const { sessionId } = req.params;
        const { selector, options = {} } = req.body;

        const page = this.pages.get(sessionId);
        if (!page) {
          return res.status(404).json({
            success: false,
            error: 'Session not found'
          });
        }

        await page.click(selector, {
          timeout: 5000,
          ...options
        });

        res.json({
          success: true,
          selector,
          message: 'Element clicked successfully'
        });

      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Take screenshot
    this.app.post('/sessions/:sessionId/screenshot', async (req, res) => {
      try {
        const { sessionId } = req.params;
        const { fullPage = true, path } = req.body;

        const page = this.pages.get(sessionId);
        if (!page) {
          return res.status(404).json({
            success: false,
            error: 'Session not found'
          });
        }

        const screenshotPath = path || `/app/screenshots/screenshot_${sessionId}_${Date.now()}.png`;

        await page.screenshot({
          path: screenshotPath,
          fullPage
        });

        res.json({
          success: true,
          path: screenshotPath,
          message: 'Screenshot captured'
        });

      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Execute JavaScript
    this.app.post('/sessions/:sessionId/evaluate', async (req, res) => {
      try {
        const { sessionId } = req.params;
        const { script, args = [] } = req.body;

        const page = this.pages.get(sessionId);
        if (!page) {
          return res.status(404).json({
            success: false,
            error: 'Session not found'
          });
        }

        const result = await page.evaluate(new Function('...args', script), ...args);

        res.json({
          success: true,
          result
        });

      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Wait for element
    this.app.post('/sessions/:sessionId/wait', async (req, res) => {
      try {
        const { sessionId } = req.params;
        const { selector, timeout = 10000, state = 'visible' } = req.body;

        const page = this.pages.get(sessionId);
        if (!page) {
          return res.status(404).json({
            success: false,
            error: 'Session not found'
          });
        }

        await page.waitForSelector(selector, {
          timeout,
          state
        });

        res.json({
          success: true,
          selector,
          message: `Element ${state}`
        });

      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Close session
    this.app.delete('/sessions/:sessionId', async (req, res) => {
      try {
        const { sessionId } = req.params;
        await this.closeSession(sessionId);

        res.json({
          success: true,
          message: 'Session closed',
          activeBrowsers: this.activeBrowsers
        });

      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        activeBrowsers: this.activeBrowsers,
        maxBrowsers: this.maxBrowsers,
        availableSlots: this.maxBrowsers - this.activeBrowsers,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        timestamp: new Date().toISOString()
      });
    });

    // List active sessions
    this.app.get('/sessions', (req, res) => {
      const sessions = Array.from(this.pages.keys());
      res.json({
        success: true,
        activeSessions: sessions.length,
        sessions,
        maxBrowsers: this.maxBrowsers
      });
    });
  }

  async closeSession(sessionId) {
    const browserData = this.browsers.get(sessionId);
    const page = this.pages.get(sessionId);

    if (browserData) {
      try {
        await browserData.context.close();
        await browserData.browser.close();
      } catch (error) {
        console.error(`Error closing browser ${sessionId}:`, error);
      }

      this.browsers.delete(sessionId);
      this.activeBrowsers--;
    }

    if (page) {
      this.pages.delete(sessionId);
    }
  }

  setupCleanup() {
    // Cleanup inactive sessions
    setInterval(async () => {
      const sessions = Array.from(this.pages.keys());

      for (const sessionId of sessions) {
        const page = this.pages.get(sessionId);
        if (page) {
          try {
            // Check if page is still responsive
            await page.evaluate(() => document.title);
          } catch (error) {
            console.log(`Cleaning up unresponsive session: ${sessionId}`);
            await this.closeSession(sessionId);
          }
        }
      }
    }, 60000); // Check every minute

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      console.log('Received SIGTERM, closing all browser sessions...');

      const sessions = Array.from(this.pages.keys());
      for (const sessionId of sessions) {
        await this.closeSession(sessionId);
      }

      console.log('All sessions closed, exiting...');
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      console.log('Received SIGINT, closing all browser sessions...');

      const sessions = Array.from(this.pages.keys());
      for (const sessionId of sessions) {
        await this.closeSession(sessionId);
      }

      console.log('All sessions closed, exiting...');
      process.exit(0);
    });
  }

  start() {
    const PORT = process.env.PORT || 8088;

    this.app.listen(PORT, () => {
      console.log(`🎭 Playwright Service running on port ${PORT}`);
      console.log(`📊 Max browsers: ${this.maxBrowsers}`);
      console.log(`❤️  Health: http://localhost:${PORT}/health`);
      console.log(`📋 Sessions: http://localhost:${PORT}/sessions`);
    });
  }
}

// Start the service
const service = new PlaywrightService();
service.start();

module.exports = PlaywrightService;