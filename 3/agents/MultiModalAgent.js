// agents/MultiModalAgent.js
const axios = require('axios');
const sharp = require('sharp');
const fs = require('fs').promises;

class MultiModalAgent {
  constructor(ollamaUrl) {
    this.ollamaUrl = ollamaUrl;
  }

  async analyzeFormVisually(screenshotPath, html) {
    try {
      // Preprocess screenshot for better AI analysis
      const processedImage = await this.preprocessImage(screenshotPath);

      // Convert image to base64
      const imageBuffer = await fs.readFile(processedImage);
      const base64Image = imageBuffer.toString('base64');

      const prompt = `Analyze this web form screenshot and HTML structure.

      HTML Structure:
      ${html}

      Based on the visual layout and HTML, provide a comprehensive analysis:

      1. Identify all form elements with their visual positions
      2. Detect any elements that might not be in the HTML (dynamic content)
      3. Analyze the form's visual hierarchy and user flow
      4. Identify potential accessibility issues
      5. Suggest the best strategy for automation

      Return JSON:
      {
        "visualElements": [{"type": "", "position": {"x": 0, "y": 0}, "text": "", "selector": ""}],
        "formFlow": ["step1", "step2"],
        "complexity": "simple|medium|complex",
        "recommendedStrategy": "dom|visual|hybrid",
        "confidenceScore": 0.95,
        "potentialIssues": []
      }`;

      const response = await axios.post(`${this.ollamaUrl}/api/generate`, {
        model: 'llava:7b',
        prompt: prompt,
        images: [base64Image],
        stream: false,
        format: 'json'
      });

      return JSON.parse(response.data.response);
    } catch (error) {
      console.error('Visual analysis error:', error);
      return this.fallbackVisualAnalysis();
    }
  }

  async preprocessImage(imagePath) {
    const outputPath = imagePath.replace('.png', '_processed.png');

    await sharp(imagePath)
      .resize(1920, 1080, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .normalize()
      .sharpen()
      .png({ quality: 90 })
      .toFile(outputPath);

    return outputPath;
  }

  async generateAdaptiveCode(formAnalysis, visualAnalysis, userData) {
    const prompt = `Generate robust Playwright code for form automation.

    Form Analysis: ${JSON.stringify(formAnalysis)}
    Visual Analysis: ${JSON.stringify(visualAnalysis)}
    User Data: ${JSON.stringify(userData)}

    Requirements:
    1. Include multiple fallback strategies for each element
    2. Add error handling and retry logic
    3. Implement visual verification after each action
    4. Include accessibility tree navigation as primary strategy
    5. Add screenshot verification points

    Generate complete TypeScript code with proper typing:`;

    try {
      const response = await axios.post(`${this.ollamaUrl}/api/generate`, {
        model: 'codestral:22b',
        prompt: prompt,
        stream: false
      });

      return response.data.response;
    } catch (error) {
      console.error('Code generation error:', error);
      return this.generateFallbackCode(formAnalysis, userData);
    }
  }

  async verifyFormState(page, expectedState) {
    const screenshot = await page.screenshot({ fullPage: true });
    const screenshotPath = `/tmp/verification_${Date.now()}.png`;
    await fs.writeFile(screenshotPath, screenshot);

    const verification = await this.analyzeFormCompletion(screenshotPath, expectedState);

    // Cleanup
    await fs.unlink(screenshotPath).catch(() => {});

    return verification;
  }

  async analyzeFormCompletion(screenshotPath, expectedState) {
    try {
      const imageBuffer = await fs.readFile(screenshotPath);
      const base64Image = imageBuffer.toString('base64');

      const prompt = `Analyze this form screenshot to verify completion state.

      Expected State: ${JSON.stringify(expectedState)}

      Check:
      1. Are all required fields filled?
      2. Are file uploads completed?
      3. Are there any validation errors visible?
      4. Is the form ready for submission?

      Return JSON:
      {
        "completed": true/false,
        "fieldsStatus": {"fieldName": "filled|empty|error"},
        "validationErrors": [],
        "readyForSubmission": true/false,
        "confidenceScore": 0.95
      }`;

      const response = await axios.post(`${this.ollamaUrl}/api/generate`, {
        model: 'llava:7b',
        prompt: prompt,
        images: [base64Image],
        stream: false,
        format: 'json'
      });

      return JSON.parse(response.data.response);
    } catch (error) {
      console.error('Form completion analysis error:', error);
      return { completed: false, confidenceScore: 0.0 };
    }
  }

  fallbackVisualAnalysis() {
    return {
      visualElements: [],
      formFlow: ["analysis", "filling", "submission"],
      complexity: "medium",
      recommendedStrategy: "hybrid",
      confidenceScore: 0.5,
      potentialIssues: ["Visual analysis unavailable"]
    };
  }

  generateFallbackCode(formAnalysis, userData) {
    let code = `
// Fallback automation code
async function fillForm(page, userData, files) {
  const results = [];

  try {`;

    for (const field of formAnalysis.fields || []) {
      code += `
    // Fill ${field.name}
    try {
      await page.fill('${field.selector}', userData['${field.name}'] || '');
      results.push({ field: '${field.name}', success: true });
    } catch (error) {
      results.push({ field: '${field.name}', success: false, error: error.message });
    }`;
    }

    code += `

    return { success: true, results };
  } catch (error) {
    return { success: false, error: error.message, results };
  }
}`;

    return code;
  }
}

module.exports = MultiModalAgent;