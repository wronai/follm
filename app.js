#!/usr/bin/env node

const { Command } = require('commander');
const chalk = require('chalk');
const inquirer = require('inquirer');
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
require('dotenv').config();

const logger = {
  info: (...args) => console.log(`[INFO] ${new Date().toISOString()}`, ...args),
  warn: (...args) => console.warn(`[WARN] ${new Date().toISOString()}`, ...args),
  error: (...args) => console.error(`[ERROR] ${new Date().toISOString()}`, ...args),
  debug: (...args) => {
    if (process.env.DEBUG) {
      console.debug(`[DEBUG] ${new Date().toISOString()}`, ...args);
    }
  }
};

const program = new Command();

// Package version
const { version } = require('./package.json');

// Main function to fill a form
async function fillForm(url, options = {}) {
  logger.info(`Starting form filler for: ${url}`);
  
  const userData = options.data ? JSON.parse(options.data) : {};
  const headless = options.headless || false;
  const timeout = options.timeout ? parseInt(options.timeout) : 30000;
  
  // Auto-detect data files if not provided
  if (!options.data) {
    const dataFiles = [
      'form-data.json',
      'application-data.json',
      'user-data.json',
      'data.json'
    ];
    
    for (const file of dataFiles) {
      const filePath = path.resolve(process.cwd(), file);
      if (fs.existsSync(filePath)) {
        try {
          userData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          logger.info(`Using form data from: ${file}`);
          break;
        } catch (e) {
          logger.warn(`Error reading ${file}: ${e.message}`);
        }
      }
    }
    
    // If still no data, try OCR extraction
    if (Object.keys(userData).length === 0) {
      const inFolder = path.resolve(process.cwd(), 'in');
      if (fs.existsSync(inFolder)) {
        try {
          const { processFolder } = require('./extract-data');
          const extractedData = await processFolder(inFolder);
          
          if (Object.keys(extractedData).length > 0) {
            // Save extracted data
            const outputPath = path.resolve(process.cwd(), 'extracted-data.json');
            fs.writeFileSync(outputPath, JSON.stringify(extractedData, null, 2));
            
            userData = extractedData;
            logger.info(`Using ${Object.keys(extractedData).length} documents from in/ folder`);
            logger.info(`Extracted data saved to: ${outputPath}`);
          }
        } catch (e) {
          logger.warn('OCR extraction failed:', e.message);
        }
      }
    }
  }

  // Auto-detect resume file if not provided
  if (!options.file) {
    const resumeFiles = [
      'resume.pdf',
      'cv.pdf',
      'my-resume.pdf',
      'document.pdf'
    ];
    
    for (const file of resumeFiles) {
      const filePath = path.resolve(process.cwd(), file);
      if (fs.existsSync(filePath)) {
        options.file = file;
        logger.info(`Using resume file: ${file}`);
        break;
      }
    }
  }
  
  const browser = await chromium.launch({ 
    headless: headless,
    logger: {
      isEnabled: () => true,
      log: (name, severity, message) => {
        if (severity === 'error') logger.error(`[PLAYWRIGHT] ${message}`);
        else logger.debug(`[PLAYWRIGHT] ${message}`);
      }
    },
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
    viewport: { width: 1280, height: 1024 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    acceptDownloads: true
  });
  
  const page = await context.newPage();
  
  try {
    logger.info('Navigating to the page...');
    await page.goto(url, { 
      waitUntil: 'domcontentloaded',
      timeout
    });
    
    logger.info(`Loaded page: ${await page.title()}`);
    
    // CAPTCHA detection and handling
    async function handleCaptcha(page) {
      const captchaSelectors = [
        '.g-recaptcha',
        '.recaptcha',
        '#recaptcha',
        '#captcha',
        '.h-captcha',
        'iframe[src*="recaptcha"]',
        'iframe[src*="hcaptcha"]'
      ];
      
      for (const selector of captchaSelectors) {
        if (await page.$(selector)) {
          logger.warn('⚠️ CAPTCHA detected! Manual intervention required');
          
          // Take screenshot
          await page.screenshot({ path: 'captcha-detected.png' });
          logger.info('📸 CAPTCHA screenshot saved to captcha-detected.png');
          
          // Pause for manual completion
          logger.warn('⏳ Pausing for CAPTCHA completion. Complete it in the browser then press Enter in terminal...');
          process.stdin.resume();
          await new Promise(resolve => {
            process.stdin.once('data', () => resolve());
          });
          
          logger.info('✅ CAPTCHA completed. Resuming automation...');
          return true;
        }
      }
      
      return false;
    }

    // Check for CAPTCHA before filling
    const hasCaptcha = await handleCaptcha(page);
    if (hasCaptcha) {
      logger.info('Resuming form filling after CAPTCHA...');
    }
    
    // Handle cookies if needed
    try {
      const cookieButton = await page.$('button:has-text("Accept All"), button:has-text("Alle akzeptieren"), button:has-text("Accept")');
      if (cookieButton) {
        logger.info('Accepting cookies...');
        await cookieButton.click();
        await page.waitForTimeout(2000);
      }
    } catch (e) {
      logger.warn('No cookie banner found or could not click accept');
    }
    
    // Take a screenshot
    const screenshotPath = path.join(process.cwd(), 'form-screenshot.png');
    await page.screenshot({ path: screenshotPath });
    logger.info(`Screenshot saved to: ${screenshotPath}`);
    
    // Smart field mapping function
    async function mapFields(page, userData) {
      const fieldMap = {};
      
      // Get all interactive elements
      const elements = await page.$$('input, textarea, select');
      
      for (const element of elements) {
        try {
          const tagName = await element.evaluate(el => el.tagName.toLowerCase());
          const inputType = await element.getAttribute('type') || 'text';
          const name = await element.getAttribute('name') || '';
          const id = await element.getAttribute('id') || '';
          const placeholder = await element.getAttribute('placeholder') || '';
          
          // Skip buttons and hidden fields
          if (['button', 'submit', 'hidden', 'image'].includes(inputType)) continue;
          
          // Try to find matching data
          let dataKey = null;
          let dataValue = null;
          
          // Strategy 1: Exact name match
          if (name && userData[name]) {
            dataKey = name;
            dataValue = userData[name];
          }
          // Strategy 2: Partial name match
          else if (name) {
            const partialMatches = Object.keys(userData).filter(key => 
              name.toLowerCase().includes(key.toLowerCase()) ||
              key.toLowerCase().includes(name.toLowerCase())
            );
            
            if (partialMatches.length > 0) {
              dataKey = partialMatches[0];
              dataValue = userData[partialMatches[0]];
            }
          }
          // Strategy 3: ID match
          if (!dataKey && id && userData[id]) {
            dataKey = id;
            dataValue = userData[id];
          }
          // Strategy 4: Placeholder match
          if (!dataKey && placeholder) {
            const placeholderKey = placeholder.toLowerCase().replace(/[^a-z0-9]/g, '_');
            if (userData[placeholderKey]) {
              dataKey = placeholderKey;
              dataValue = userData[placeholderKey];
            }
          }
          
          if (dataKey) {
            fieldMap[dataKey] = {
              element,
              value: dataValue,
              type: inputType,
              tagName
            };
            logger.info(`Mapped ${dataKey} to field: ${name || id || placeholder}`);
          }
        } catch (e) {
          logger.debug(`Field mapping error: ${e.message}`);
        }
      }
      
      return fieldMap;
    }

    // Skip interactive mode if data is available
    if (Object.keys(userData).length === 0) {
      logger.info('\nNo form data provided. Please fill in the form fields:');
      
      // Get all form inputs
      const inputs = await page.$$('input, textarea, select');
      
      for (const input of inputs) {
        const inputId = await input.getAttribute('id') || await input.getAttribute('name') || 'field';
        const inputType = await input.getAttribute('type') || 'text';
        const isRequired = await input.getAttribute('required') !== null;
        
        // Skip hidden inputs
        if (inputType === 'hidden') continue;
        
        // Skip file inputs for now
        if (inputType === 'file') {
          logger.warn(`File upload field detected: ${inputId}`);
          continue;
        }
        
        const answer = await inquirer.prompt([{
          type: 'input',
          name: 'value',
          message: `Enter value for ${inputId}${isRequired ? ' (required)' : ''}:`,
          validate: input => isRequired ? input.length > 0 || 'This field is required' : true
        }]);
        
        if (answer.value) {
          await input.fill(answer.value);
          userData[inputId] = answer.value;
        }
      }
    } else {
      logger.info('\nFilling form with provided data...');
      
      // Map fields dynamically
      const fieldMap = await mapFields(page, userData);
      
      // Fill mapped fields with retry
      for (const [key, fieldInfo] of Object.entries(fieldMap)) {
        const MAX_RETRIES = 2;
        let success = false;
        
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
          try {
            const { element, value, type } = fieldInfo;
            
            if (type === 'checkbox' || type === 'radio') {
              await element.check();
            } else if (type === 'select-one') {
              await element.selectOption(value);
            } else {
              await element.fill(String(value));
            }
            
            logger.info(`Filled ${key} (attempt ${attempt})`);
            success = true;
            break;
          } catch (e) {
            logger.warn(`Attempt ${attempt} failed for ${key}: ${e.message}`);
            
            if (attempt < MAX_RETRIES) {
              await page.waitForTimeout(500);
            }
          }
        }
        
        if (!success) {
          logger.error(`Failed to fill ${key} after ${MAX_RETRIES} attempts`);
        }
      }
    }
    
    // Enhanced file upload function
    async function handleFileUpload(page, filePath) {
      const fileName = path.basename(filePath);
      
      // Method 1: Standard file input
      try {
        await page.setInputFiles('input[type="file"]', filePath);
        logger.info(`Uploaded via standard input: ${fileName}`);
        return;
      } catch (e) {
        logger.debug(`Standard input failed: ${e.message}`);
      }
      
      // Method 2: Click-based upload
      try {
        const fileInput = await page.$('input[type="file"]');
        if (fileInput) {
          await fileInput.click();
          await page.waitForTimeout(1000);
          
          // Handle native file dialog
          const [fileChooser] = await Promise.all([
            page.waitForEvent('filechooser'),
            fileInput.click()
          ]);
          await fileChooser.setFiles(filePath);
          logger.info(`Uploaded via click handler: ${fileName}`);
          return;
        }
      } catch (e) {
        logger.debug(`Click-based upload failed: ${e.message}`);
      }
      
      // Method 3: Drag and drop simulation
      try {
        const dropArea = await page.$('.drop-area, .upload-area, [data-upload]');
        if (dropArea) {
          const fileInput = await dropArea.$('input[type="file"]');
          if (fileInput) {
            await fileInput.setInputFiles(filePath);
            logger.info(`Uploaded via drop area: ${fileName}`);
            return;
          }
          
          // Simulate drag and drop
          const dataTransfer = await page.evaluateHandle(() => {
            const dt = new DataTransfer();
            dt.items.add(new File(['test'], 'test.txt', { type: 'text/plain' }));
            return dt;
          });
          
          await dropArea.dispatchEvent('drop', { dataTransfer });
          logger.info(`Simulated drag and drop: ${fileName}`);
          return;
        }
      } catch (e) {
        logger.debug(`Drag and drop failed: ${e.message}`);
      }
      
      // Method 4: Custom upload button
      try {
        const uploadButton = await page.$('.upload-button, .btn-upload, [data-upload-button]');
        if (uploadButton) {
          await uploadButton.click();
          await page.waitForTimeout(1000);
          
          // Handle native file dialog
          const [fileChooser] = await Promise.all([
            page.waitForEvent('filechooser'),
            uploadButton.click()
          ]);
          await fileChooser.setFiles(filePath);
          logger.info(`Uploaded via custom button: ${fileName}`);
          return;
        }
      } catch (e) {
        logger.debug(`Custom button upload failed: ${e.message}`);
      }
      
      logger.warn(`All file upload methods failed for ${fileName}`);
    }
    
    // Handle file upload if specified
    if (options.file) {
      const filePath = path.resolve(process.cwd(), options.file);
      
      if (!fs.existsSync(filePath)) {
        logger.error(`File not found: ${filePath}`);
        logger.info('Skipping file upload');
      } else {
        try {
          await handleFileUpload(page, filePath);
        } catch (e) {
          logger.error(`Error uploading file: ${e.message}`);
        }
      }
    }
    
    // Take final screenshot
    const filledScreenshotPath = path.join(process.cwd(), 'form-filled.png');
    await page.screenshot({ path: filledScreenshotPath });
    logger.info(`Filled form screenshot saved to: ${filledScreenshotPath}`);
    
    // Submit form if requested
    if (options.submit) {
      logger.info('\nSubmitting form...');
      try {
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle', timeout }),
          page.click('button[type="submit"], input[type="submit"], [type="submit"]')
        ]);
        logger.info('Form submitted successfully!');
      } catch (e) {
        logger.warn('Could not submit form automatically');
      }
    }
    
  } catch (error) {
    logger.error(`Error: ${error.message}`);
    
    // Save error screenshot
    const errorPath = path.join(process.cwd(), 'error.png');
    await page.screenshot({ path: errorPath });
    logger.error(`Error screenshot saved to: ${errorPath}`);
    
    process.exit(1);
  } finally {
    if (!options.keepOpen) {
      await browser.close();
      logger.info('\nBrowser closed. Have a great day!\n');
    } else {
      logger.info('\nBrowser kept open as requested. Press Ctrl+C to exit.\n');
    }
  }
}

// Set up CLI commands
program
  .name('follm')
  .description('AI-powered form filler using Playwright')
  .version(version, '-v, --version', 'output the current version')
  .option('-d, --debug', 'output extra debugging')
  .option('-t, --timeout <ms>', 'navigation timeout in milliseconds', '30000');

program
  .command('fill')
  .description('Fill a web form')
  .requiredOption('-u, --url <url>', 'URL of the form to fill')
  .option('-d, --data <data>', 'JSON string with form data')
  .option('-f, --file <file>', 'Path to file to upload')
  .option('-s, --submit', 'Submit the form after filling')
  .option('--show-browser', 'Show the browser during execution')
  .option('--headless', 'Run browser in headless mode (no visible window)')
  .option('--keep-open', 'Keep browser open after execution')
  .action(async (options) => {
    try {
      await fillForm(options.url, {
        data: options.data,
        file: options.file,
        submit: options.submit,
        showBrowser: options.showBrowser,
        headless: options.headless,
        keepOpen: options.keepOpen
      });
    } catch (error) {
      logger.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

// Show help if no arguments
if (process.argv.length <= 2) {
  program.help();
}

// Parse arguments
program.parse(process.argv);
