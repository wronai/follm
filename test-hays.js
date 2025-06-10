const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ 
    headless: true,  // Run in headless mode for container environment
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-gpu'
    ]
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 1024 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
  });
  
  const page = await context.newPage();

  try {
    // Enable request/response logging
    page.on('response', response => {
      console.log(`<< ${response.status()} ${response.url()}`);
    });
    
    console.log('Navigating to HAYS CV upload page...');
    await page.goto('https://www.hays.de/personaldienstleister/cv-upload', { 
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    console.log('Page title:', await page.title());
    
    // Take a screenshot of the initial page
    await page.screenshot({ path: 'hays-initial.png' });
    console.log('Initial page screenshot saved as hays-initial.png');
    
    // Try to find and handle cookie consent
    try {
      const cookieButton = await page.$('button:has-text("Alle akzeptieren")');
      if (cookieButton) {
        console.log('Accepting cookies...');
        await cookieButton.click();
        await page.waitForTimeout(2000);
      }
    } catch (e) {
      console.log('No cookie banner found or could not click accept');
    }

    // Wait for the form to be visible with a longer timeout
    console.log('Looking for form elements...');
    
    // Try to find iframe first
    const frameElement = await page.$('iframe');
    if (frameElement) {
      console.log('Found iframe, switching to it...');
      const frame = await frameElement.contentFrame();
      
      // Wait for form elements inside iframe
      await frame.waitForSelector('input[name="firstname"], #firstname, [name*="firstname"]', { timeout: 15000 });
      
      // Fill the form inside iframe
      console.log('Filling form inside iframe...');
      await frame.fill('input[name="firstname"], #firstname, [name*="firstname"]', 'Max');
      await frame.fill('input[name="lastname"], #lastname, [name*="lastname"]', 'Mustermann');
      await frame.fill('input[type="email"], #email, [name*="email"]', 'max.mustermann@example.com');
      await frame.fill('input[type="tel"], #phone, [name*="phone"]', '4915112345678');
      
      // Handle file upload
      const filePath = path.join(__dirname, 'test_cv.txt');
      const fileInput = await frame.$('input[type="file"]');
      if (fileInput) {
        console.log('Uploading CV...');
        await fileInput.setInputFiles(filePath);
        await page.waitForTimeout(3000);
      }
      
      // Take a screenshot of the filled form
      await page.screenshot({ path: 'hays-form-filled.png' });
      console.log('Filled form screenshot saved as hays-form-filled.png');
      
    } else {
      // If no iframe, try direct form filling
      console.log('No iframe found, trying direct form fill...');
      
      // Wait for form elements with multiple possible selectors
      await page.waitForSelector('input[name="firstname"], #firstname, [name*="firstname"], #candidate_firstname', { 
        timeout: 10000 
      });
      
      // Fill the form
      console.log('Filling form...');
      await page.fill('input[name="firstname"], #firstname, [name*="firstname"], #candidate_firstname', 'Max');
      await page.fill('input[name="lastname"], #lastname, [name*="lastname"], #candidate_lastname', 'Mustermann');
      await page.fill('input[type="email"], #email, [name*="email"], #candidate_email', 'max.mustermann@example.com');
      await page.fill('input[type="tel"], #phone, [name*="phone"], #candidate_phone', '4915112345678');
      
      // Handle file upload
      const filePath = path.join(__dirname, 'test_cv.txt');
      const fileInput = await page.$('input[type="file"]');
      if (fileInput) {
        console.log('Uploading CV...');
        await fileInput.setInputFiles(filePath);
        await page.waitForTimeout(3000);
      }
      
      // Take a screenshot of the filled form
      await page.screenshot({ path: 'hays-form-filled.png' });
      console.log('Filled form screenshot saved as hays-form-filled.png');
    }
    
    // Uncomment to submit the form
    // await page.click('button[type="submit"], input[type="submit"], .submit-button');
    // console.log('Form submitted');
    // await page.waitForTimeout(5000);
    
  } catch (error) {
    console.error('Error:', error);
    await page.screenshot({ path: 'error.png' });
    console.log('Error screenshot saved as error.png');
    
    // Dump page content for debugging
    const content = await page.content();
    fs.writeFileSync('page-content.html', content);
    console.log('Page content saved as page-content.html');
    
  } finally {
    console.log('Keeping browser open for inspection...');
    // Keep browser open for 2 minutes for inspection
    await new Promise(resolve => setTimeout(resolve, 120000));
    await browser.close();
  }
})();
