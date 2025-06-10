// app.js - Minimalne rozwiązanie
const express = require('express');
const playwright = require('playwright');
const axios = require('axios');
const multer = require('multer');
const path = require('path');

const app = express();
const upload = multer({ dest: 'uploads/' });

// Mistral API via Ollama
async function generateFormCode(formHtml, userData) {
  const prompt = `Analyze this form and generate Playwright code to fill it:
HTML: ${formHtml}
User Data: ${JSON.stringify(userData)}

Generate only the filling code:`;

  try {
    const response = await axios.post('http://localhost:11434/api/generate', {
      model: 'mistral:7b',
      prompt: prompt,
      stream: false
    });

    return response.data.response;
  } catch (error) {
    console.error('Mistral API error:', error);
    return null;
  }
}

// Główna funkcja wypełniania formularza
async function fillForm(url, userData, filePath) {
  const browser = await playwright.chromium.launch({ headless: false });
  const page = await browser.newPage();

  try {
    await page.goto(url);

    // Pobierz struktura formularza
    const formHtml = await page.evaluate(() => {
      const forms = document.querySelectorAll('form');
      return forms.length > 0 ? forms[0].outerHTML : '';
    });

    // Generuj kod wypełniania
    const fillCode = await generateFormCode(formHtml, userData);

    if (fillCode) {
      // Wykonaj wygenerowany kod (uproszczone)
      await executeGeneratedCode(page, fillCode, userData, filePath);
    } else {
      // Fallback - proste wypełnianie
      await simpleFillForm(page, userData, filePath);
    }

    await page.screenshot({ path: 'result.png' });
    return { success: true, screenshot: 'result.png' };

  } catch (error) {
    console.error('Form filling error:', error);
    return { success: false, error: error.message };
  } finally {
    await browser.close();
  }
}

// Fallback - proste wypełnianie bez AI
async function simpleFillForm(page, userData, filePath) {
  // Wypełnij pola tekstowe
  for (const [key, value] of Object.entries(userData)) {
    const selectors = [
      `input[name="${key}"]`,
      `input[id="${key}"]`,
      `input[placeholder*="${key}"]`,
      `textarea[name="${key}"]`
    ];

    for (const selector of selectors) {
      try {
        await page.fill(selector, value, { timeout: 1000 });
        break;
      } catch (e) { continue; }
    }
  }

  // Upload pliku
  if (filePath) {
    const fileInput = await page.locator('input[type="file"]').first();
    if (await fileInput.count() > 0) {
      await fileInput.setInputFiles(filePath);
    }
  }
}

// API endpoint
app.post('/fill-form', upload.single('file'), async (req, res) => {
  const { url, ...userData } = req.body;
  const filePath = req.file ? req.file.path : null;

  const result = await fillForm(url, userData, filePath);
  res.json(result);
});

// Test form
app.get('/test', (req, res) => {
  res.send(`
    <form method="post" enctype="multipart/form-data">
      <input name="firstName" placeholder="First Name" required>
      <input name="lastName" placeholder="Last Name" required>
      <input name="email" type="email" placeholder="Email" required>
      <input name="phone" placeholder="Phone">
      <textarea name="message" placeholder="Message"></textarea>
      <input type="file" name="cv" accept=".pdf,.doc,.docx">
      <button type="submit">Submit</button>
    </form>
  `);
});

app.listen(3000, () => {
  console.log('Minimal Form Filler running on port 3000');
  console.log('Test form: http://localhost:3000/test');
});