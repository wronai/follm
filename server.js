const express = require('express');
const multer = require('multer');
const path = require('path');
const { chromium } = require('playwright');
const chalk = require('chalk');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Configure multer for file uploads
const upload = multer({ 
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API endpoint to fill a form
app.post('/api/fill', upload.single('file'), async (req, res) => {
  const { url, data } = req.body;
  const filePath = req.file ? req.file.path : null;
  
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }
  
  try {
    const userData = data ? JSON.parse(data) : {};
    const browser = await chromium.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const context = await browser.newContext();
    const page = await context.newPage();
    
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    
    // Handle cookies if needed
    try {
      const cookieButton = await page.$('button:has-text("Accept All"), button:has-text("Alle akzeptieren"), button:has-text("Accept")');
      if (cookieButton) {
        await cookieButton.click();
        await page.waitForTimeout(1000);
      }
    } catch (e) {
      console.log('No cookie banner found');
    }
    
    // Fill form fields
    for (const [key, value] of Object.entries(userData)) {
      try {
        await page.fill(`[name="${key}"], #${key}`, value);
      } catch (e) {
        console.log(`Could not fill field ${key}`);
      }
    }
    
    // Handle file upload if provided
    if (filePath) {
      try {
        const fileInput = await page.$('input[type="file"]');
        if (fileInput) {
          await fileInput.setInputFiles(filePath);
        }
      } catch (e) {
        console.log('Error uploading file:', e.message);
      }
    }
    
    // Take a screenshot
    const screenshotPath = path.join('public', 'screenshot.png');
    await page.screenshot({ path: screenshotPath });
    
    await browser.close();
    
    res.json({
      success: true,
      screenshot: '/screenshot.png',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Serve the frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
if (require.main === module) {
  app.listen(port, () => {
    console.log(chalk.green(`🚀 Server running at http://localhost:${port}`));
  });
}

module.exports = app;
