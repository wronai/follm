#!/usr/bin/env node

const { Command } = require('commander');
const chalk = require('chalk');
const inquirer = require('inquirer');
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
require('dotenv').config();

const program = new Command();

// Package version
const { version } = require('./package.json');

// Main function to fill a form
async function fillForm(url, options = {}) {
  console.log(chalk.blue(`\n🚀 Starting form filler for: ${url}`));
  
  const userData = options.data ? JSON.parse(options.data) : {};
  const headless = !options.showBrowser;
  const timeout = options.timeout ? parseInt(options.timeout) : 30000;
  
  const browser = await chromium.launch({ 
    headless,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage'
    ]
  });
  
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1024 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    acceptDownloads: true
  });
  
  const page = await context.newPage();
  
  try {
    console.log(chalk.blue('🌐 Navigating to the page...'));
    await page.goto(url, { 
      waitUntil: 'domcontentloaded',
      timeout
    });
    
    console.log(chalk.green(`✅ Loaded page: ${await page.title()}`));
    
    // Handle cookies if needed
    try {
      const cookieButton = await page.$('button:has-text("Accept All"), button:has-text("Alle akzeptieren"), button:has-text("Accept")');
      if (cookieButton) {
        console.log(chalk.blue('🍪 Accepting cookies...'));
        await cookieButton.click();
        await page.waitForTimeout(2000);
      }
    } catch (e) {
      console.log(chalk.yellow('ℹ️ No cookie banner found or could not click accept'));
    }
    
    // Take a screenshot
    const screenshotPath = path.join(process.cwd(), 'form-screenshot.png');
    await page.screenshot({ path: screenshotPath });
    console.log(chalk.green(`📸 Screenshot saved to: ${screenshotPath}`));
    
    // Get form data interactively if not provided
    if (Object.keys(userData).length === 0) {
      console.log(chalk.blue('\n🔍 No form data provided. Please fill in the form fields:'));
      
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
          console.log(chalk.yellow(`ℹ️ File upload field detected: ${inputId}`));
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
      // Fill form with provided data
      console.log(chalk.blue('\n📝 Filling form with provided data...'));
      
      for (const [key, value] of Object.entries(userData)) {
        try {
          await page.fill(`[name="${key}"], #${key}`, value);
          console.log(chalk.green(`✓ Filled ${key}`));
        } catch (e) {
          console.log(chalk.yellow(`⚠️ Could not fill field ${key}`));
        }
      }
    }
    
    // Handle file upload if specified
    if (options.file) {
      try {
        const filePath = path.resolve(process.cwd(), options.file);
        if (fs.existsSync(filePath)) {
          const fileInput = await page.$('input[type="file"]');
          if (fileInput) {
            await fileInput.setInputFiles(filePath);
            console.log(chalk.green(`📎 Uploaded file: ${filePath}`));
          } else {
            console.log(chalk.yellow('⚠️ No file input found on the page'));
          }
        } else {
          console.log(chalk.red(`❌ File not found: ${filePath}`));
        }
      } catch (e) {
        console.log(chalk.red(`❌ Error uploading file: ${e.message}`));
      }
    }
    
    // Take final screenshot
    const filledScreenshotPath = path.join(process.cwd(), 'form-filled.png');
    await page.screenshot({ path: filledScreenshotPath });
    console.log(chalk.green(`📸 Filled form screenshot saved to: ${filledScreenshotPath}`));
    
    // Submit form if requested
    if (options.submit) {
      console.log(chalk.blue('\n🚀 Submitting form...'));
      try {
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle', timeout }),
          page.click('button[type="submit"], input[type="submit"], [type="submit"]')
        ]);
        console.log(chalk.green('✅ Form submitted successfully!'));
      } catch (e) {
        console.log(chalk.yellow('⚠️ Could not submit form automatically'));
      }
    }
    
  } catch (error) {
    console.error(chalk.red(`❌ Error: ${error.message}`));
    
    // Save error screenshot
    const errorPath = path.join(process.cwd(), 'error.png');
    await page.screenshot({ path: errorPath });
    console.log(chalk.red(`📸 Error screenshot saved to: ${errorPath}`));
    
    process.exit(1);
  } finally {
    if (!options.keepOpen) {
      await browser.close();
      console.log(chalk.blue('\n👋 Browser closed. Have a great day!\n'));
    } else {
      console.log(chalk.blue('\n🛑 Browser kept open as requested. Press Ctrl+C to exit.\n'));
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
  .command('fill <url>')
  .description('Fill a form on the specified URL')
  .option('-d, --data <json>', 'form data as JSON string')
  .option('-f, --file <path>', 'path to file to upload')
  .option('-s, --submit', 'submit the form after filling')
  .option('--show-browser', 'show the browser window', false)
  .option('--keep-open', 'keep the browser open after completion', false)
  .action(async (url, options) => {
    try {
      await fillForm(url, {
        ...options,
        timeout: program.opts().timeout,
        debug: program.opts().debug
      });
    } catch (error) {
      console.error(chalk.red(`❌ Error: ${error.message}`));
      process.exit(1);
    }
  });

// Show help if no arguments
if (process.argv.length <= 2) {
  program.help();
}

// Parse arguments
program.parse(process.argv);
