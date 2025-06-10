// agents/FormFillingAgent.js
class FormFillingAgent {
  constructor(browserService) {
    this.browserService = browserService;
  }

  async fillForm(sessionId, formAnalysis, userData, files) {
    const page = await this.browserService.getPage(sessionId);
    const results = [];

    try {
      // Fill regular fields
      for (const field of formAnalysis.fields) {
        const value = userData[field.name];
        if (value !== undefined) {
          const result = await this.fillField(page, field, value);
          results.push(result);
        }
      }

      // Handle file uploads
      for (const fileField of formAnalysis.fileUploads) {
        const file = files[fileField.name];
        if (file) {
          const result = await this.uploadFile(page, fileField, file);
          results.push(result);
        }
      }

      // Take screenshot before submit
      await page.screenshot({
        path: `screenshots/filled_${sessionId}.png`,
        fullPage: true
      });

      return {
        success: true,
        results,
        screenshot: `filled_${sessionId}.png`
      };

    } catch (error) {
      console.error('Form filling error:', error);
      return {
        success: false,
        error: error.message,
        results
      };
    }
  }

  async fillField(page, field, value) {
    const strategies = [
      () => page.fill(field.selector, value),
      () => page.locator(field.selector).fill(value),
      () => page.evaluate((sel, val) => {
        const el = document.querySelector(sel);
        if (el) {
          el.value = val;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, field.selector, value)
    ];

    for (const strategy of strategies) {
      try {
        await strategy();
        return { field: field.name, success: true, strategy: strategy.name };
      } catch (error) {
        continue;
      }
    }

    return { field: field.name, success: false, error: 'All strategies failed' };
  }

  async uploadFile(page, fileField, filePath) {
    try {
      const fileInput = page.locator(fileField.selector);
      await fileInput.setInputFiles(filePath);

      return {
        field: fileField.name,
        success: true,
        file: filePath
      };
    } catch (error) {
      return {
        field: fileField.name,
        success: false,
        error: error.message
      };
    }
  }

  async submitForm(sessionId, formAnalysis) {
    const page = await this.browserService.getPage(sessionId);

    try {
      await page.click(formAnalysis.submitButton.selector);
      await page.waitForTimeout(2000); // Wait for response

      await page.screenshot({
        path: `screenshots/submitted_${sessionId}.png`,
        fullPage: true
      });

      return {
        success: true,
        screenshot: `submitted_${sessionId}.png`,
        url: page.url()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = FormFillingAgent;