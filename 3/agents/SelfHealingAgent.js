// agents/SelfHealingAgent.js
const { Pool } = require('pg');

class SelfHealingAgent {
  constructor(dbConfig, ollamaUrl) {
    this.db = new Pool(dbConfig);
    this.ollamaUrl = ollamaUrl;
    this.learningDatabase = new Map();
  }

  async recordInteraction(sessionId, action, element, success, error = null, screenshot = null) {
    const query = `
      INSERT INTO form_interactions
      (session_id, action, element_selector, element_type, success, error_message, screenshot_path, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    `;

    try {
      await this.db.query(query, [
        sessionId,
        action,
        element.selector,
        element.type,
        success,
        error,
        screenshot
      ]);
    } catch (dbError) {
      console.error('Failed to record interaction:', dbError);
    }
  }

  async learnFromFailure(element, error, context) {
    const prompt = `Analyze this automation failure and suggest adaptive solutions:

    Element: ${JSON.stringify(element)}
    Error: ${error}
    Context: ${JSON.stringify(context)}

    Based on the error, suggest:
    1. Alternative selectors
    2. Different interaction strategies
    3. Timing adjustments
    4. Preprocessing steps needed

    Return JSON:
    {
      "diagnosis": "element_not_found|timing_issue|interaction_blocked|other",
      "alternativeSelectors": ["selector1", "selector2"],
      "strategies": ["strategy1", "strategy2"],
      "confidence": 0.8,
      "suggestions": []
    }`;

    try {
      const response = await axios.post(`${this.ollamaUrl}/api/generate`, {
        model: 'mistral:7b',
        prompt: prompt,
        stream: false,
        format: 'json'
      });

      const analysis = JSON.parse(response.data.response);

      // Store learning for future use
      const learningKey = `${element.type}_${analysis.diagnosis}`;
      this.learningDatabase.set(learningKey, analysis);

      return analysis;
    } catch (analysisError) {
      console.error('Learning analysis error:', analysisError);
      return this.getDefaultRecoveryStrategy(element, error);
    }
  }

  async adaptiveElementFinding(page, originalElement, userData) {
    // Try original selector first
    try {
      const element = await page.locator(originalElement.selector).first();
      if (await element.isVisible({ timeout: 2000 })) {
        return { element, strategy: 'original' };
      }
    } catch (error) {
      console.log('Original selector failed, trying adaptive strategies...');
    }

    // Strategy 1: Accessibility-based finding
    try {
      const accessibilityElement = await this.findByAccessibility(page, originalElement);
      if (accessibilityElement) {
        return { element: accessibilityElement, strategy: 'accessibility' };
      }
    } catch (error) {
      console.log('Accessibility strategy failed');
    }

    // Strategy 2: Text-based finding
    try {
      const textElement = await this.findByText(page, originalElement, userData);
      if (textElement) {
        return { element: textElement, strategy: 'text' };
      }
    } catch (error) {
      console.log('Text strategy failed');
    }

    // Strategy 3: Position-based finding
    try {
      const positionElement = await this.findByPosition(page, originalElement);
      if (positionElement) {
        return { element: positionElement, strategy: 'position' };
      }
    } catch (error) {
      console.log('Position strategy failed');
    }

    // Strategy 4: AI-powered visual finding
    try {
      const visualElement = await this.findByVisualAI(page, originalElement);
      if (visualElement) {
        return { element: visualElement, strategy: 'visual_ai' };
      }
    } catch (error) {
      console.log('Visual AI strategy failed');
    }

    throw new Error(`Could not find element using any strategy: ${originalElement.selector}`);
  }

  async findByAccessibility(page, originalElement) {
    const accessibilitySelectors = [
      `[role="${originalElement.type}"]`,
      `[aria-label*="${originalElement.name}"]`,
      `[aria-labelledby*="${originalElement.name}"]`,
      `input[name="${originalElement.name}"]`,
      `*[data-testid*="${originalElement.name}"]`
    ];

    for (const selector of accessibilitySelectors) {
      try {
        const element = page.locator(selector).first();
        if (await element.isVisible({ timeout: 1000 })) {
          return element;
        }
      } catch (error) {
        continue;
      }
    }

    return null;
  }

  async findByText(page, originalElement, userData) {
    const possibleTexts = [
      originalElement.name,
      originalElement.label,
      originalElement.placeholder,
      originalElement.name.replace(/([A-Z])/g, ' $1').trim()
    ].filter(Boolean);

    for (const text of possibleTexts) {
      try {
        // Find by label text
        const labelElement = page.locator(`label:has-text("${text}")`);
        if (await labelElement.count() > 0) {
          const forAttr = await labelElement.getAttribute('for');
          if (forAttr) {
            const targetElement = page.locator(`#${forAttr}`);
            if (await targetElement.isVisible({ timeout: 1000 })) {
              return targetElement;
            }
          }
        }

        // Find by placeholder
        const placeholderElement = page.locator(`input[placeholder*="${text}"], textarea[placeholder*="${text}"]`);
        if (await placeholderElement.isVisible({ timeout: 1000 })) {
          return placeholderElement;
        }
      } catch (error) {
        continue;
      }
    }

    return null;
  }

  async findByPosition(page, originalElement) {
    if (!originalElement.position) return null;

    const { x, y } = originalElement.position;

    try {
      // Click at position and see what element gets focus
      await page.mouse.click(x, y);
      await page.waitForTimeout(100);

      const focusedElement = page.locator(':focus');
      if (await focusedElement.count() > 0) {
        return focusedElement;
      }
    } catch (error) {
      console.log('Position-based finding failed:', error);
    }

    return null;
  }

  async findByVisualAI(page, originalElement) {
    try {
      // Take screenshot
      const screenshot = await page.screenshot({ fullPage: true });
      const screenshotPath = `/tmp/element_finding_${Date.now()}.png`;
      await fs.writeFile(screenshotPath, screenshot);

      // Use AI to find element
      const prompt = `Find the form element in this screenshot:

      Looking for: ${JSON.stringify(originalElement)}

      Return the coordinates where this element should be:
      {"found": true, "x": 100, "y": 200, "confidence": 0.9}`;

      const imageBuffer = await fs.readFile(screenshotPath);
      const base64Image = imageBuffer.toString('base64');

      const response = await axios.post(`${this.ollamaUrl}/api/generate`, {
        model: 'llava:7b',
        prompt: prompt,
        images: [base64Image],
        stream: false,
        format: 'json'
      });

      const result = JSON.parse(response.data.response);

      // Cleanup
      await fs.unlink(screenshotPath).catch(() => {});

      if (result.found && result.confidence > 0.7) {
        // Create locator at found position
        const element = page.locator(`xpath=//html`).evaluate((html, x, y) => {
          return document.elementFromPoint(x, y);
        }, result.x, result.y);

        return element;
      }
    } catch (error) {
      console.error('Visual AI finding error:', error);
    }

    return null;
  }

  getDefaultRecoveryStrategy(element, error) {
    return {
      diagnosis: "unknown",
      alternativeSelectors: [
        `input[name="${element.name}"]`,
        `#${element.name}`,
        `[data-testid="${element.name}"]`,
        `[placeholder*="${element.name}"]`
      ],
      strategies: ["wait_and_retry", "scroll_into_view", "force_click"],
      confidence: 0.3,
      suggestions: ["Try waiting longer", "Check if element is in viewport", "Verify page is fully loaded"]
    };
  }

  async getSuccessPatterns(elementType, action) {
    const query = `
      SELECT element_selector, COUNT(*) as success_count,
             AVG(CASE WHEN success THEN 1 ELSE 0 END) as success_rate
      FROM form_interactions
      WHERE element_type = $1 AND action = $2 AND success = true
      GROUP BY element_selector
      ORDER BY success_rate DESC, success_count DESC
      LIMIT 10
    `;

    try {
      const result = await this.db.query(query, [elementType, action]);
      return result.rows;
    } catch (error) {
      console.error('Error fetching success patterns:', error);
      return [];
    }
  }

  async optimize() {
    console.log('Running self-healing optimization...');

    // Analyze recent failures
    const recentFailures = await this.db.query(`
      SELECT element_type, action, error_message, COUNT(*) as failure_count
      FROM form_interactions
      WHERE success = false AND created_at > NOW() - INTERVAL '24 hours'
      GROUP BY element_type, action, error_message
      ORDER BY failure_count DESC
    `);

    // Update strategies based on patterns
    for (const failure of recentFailures.rows) {
      const successPatterns = await this.getSuccessPatterns(failure.element_type, failure.action);

      if (successPatterns.length > 0) {
        console.log(`Optimizing strategy for ${failure.element_type} ${failure.action}`);
        // Update internal strategy database
        this.learningDatabase.set(
          `${failure.element_type}_${failure.action}`,
          {
            preferredSelectors: successPatterns.map(p => p.element_selector),
            lastUpdated: new Date()
          }
        );
      }
    }

    console.log('Self-healing optimization completed');
  }
}

module.exports = SelfHealingAgent;