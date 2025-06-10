const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ 
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage'
    ]
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 1024 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
  });
  
  const page = await context.newPage();

  try {
    console.log('Navigating to HAYS CV upload page...');
    await page.goto('https://www.hays.de/personaldienstleister/cv-upload', { 
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    console.log('Page title:', await page.title());
    
    // Handle cookie consent if it appears
    try {
      await page.click('button:has-text("Alle akzeptieren")', { timeout: 5000 });
      console.log('Accepted cookies');
      await page.waitForTimeout(2000);
    } catch (e) {
      console.log('No cookie banner found or could not click accept');
    }

    console.log('Waiting for form to be interactive...');
    await page.waitForTimeout(5000); // Wait for any dynamic content to load

    // Find all forms on the page
    const forms = await page.$$('form');
    console.log(`\nFound ${forms.length} forms on the page`);

    for (let i = 0; i < forms.length; i++) {
      console.log(`\nForm #${i + 1}:`);
      
      // Get form attributes
      const formId = await forms[i].getAttribute('id') || 'no-id';
      const formClass = await forms[i].getAttribute('class') || 'no-class';
      const formAction = await forms[i].getAttribute('action') || 'no-action';
      
      console.log(`  ID: ${formId}`);
      console.log(`  Classes: ${formClass}`);
      console.log(`  Action: ${formAction}`);
      
      // Find all input fields in the form
      const inputs = await forms[i].$$('input, select, textarea, button');
      console.log(`  Contains ${inputs.length} form elements:`);
      
      for (const input of inputs) {
        const inputType = await input.getAttribute('type') || await input.tagName().then(t => t.toLowerCase());
        const inputName = await input.getAttribute('name') || 'no-name';
        const inputId = await input.getAttribute('id') || 'no-id';
        const inputPlaceholder = await input.getAttribute('placeholder') || '';
        
        console.log(`    - ${inputType.toUpperCase()}: name="${inputName}", id="${inputId}" ${inputPlaceholder ? `, placeholder="${inputPlaceholder}"` : ''}`);
      }
    }

    // Take a screenshot of the page
    await page.screenshot({ path: 'hays-form-analysis.png' });
    console.log('\nScreenshot saved as hays-form-analysis.png');
    
    console.log('\nTo interact with this form, you can use the following Playwright code:');
    console.log(`
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  try {
    await page.goto('https://www.hays.de/personaldienstleister/cv-upload');
    
    // Handle cookies if needed
    try {
      await page.click('button:has-text("Alle akzeptieren")');
      await page.waitForTimeout(2000);
    } catch {}
    
    // Wait for form to be ready
    await page.waitForTimeout(5000);
    
    // TODO: Add your form interaction code here
    // Example:
    // await page.fill('input[name="firstname"]', 'Max');
    // await page.fill('input[name="lastname"]', 'Mustermann');
    // await page.setInputFiles('input[type="file"]', 'path/to/your/cv.pdf');
    
    // Keep browser open for inspection
    await page.waitForTimeout(30000);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    // await browser.close();
  }
})();`);

  } catch (error) {
    console.error('Error:', error);
    await page.screenshot({ path: 'hays-error.png' });
    console.log('Error screenshot saved as hays-error.png');
  } finally {
    console.log('\nKeeping browser open for inspection...');
    // Keep browser open for manual inspection
    await new Promise(() => {});
  }
})();
