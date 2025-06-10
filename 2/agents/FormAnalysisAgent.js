// agents/FormAnalysisAgent.js
class FormAnalysisAgent {
  constructor(ollamaUrl) {
    this.ollamaUrl = ollamaUrl;
  }

  async analyzeForm(html, screenshot) {
    const prompt = `As a form analysis expert, analyze this form structure:

HTML Structure:
${html}

Identify:
1. All input fields with their types and requirements
2. File upload fields and accepted formats
3. Submit button location
4. Validation rules
5. Field relationships and dependencies

Return JSON structure:
{
  "fields": [{"name": "", "type": "", "required": true, "selector": ""}],
  "fileUploads": [{"name": "", "accept": "", "selector": ""}],
  "submitButton": {"selector": "", "text": ""},
  "validationRules": [],
  "strategy": "accessibility|visual|hybrid"
}`;

    try {
      const response = await axios.post(`${this.ollamaUrl}/api/generate`, {
        model: 'mistral:7b',
        prompt: prompt,
        stream: false,
        format: 'json'
      });

      return JSON.parse(response.data.response);
    } catch (error) {
      console.error('Form analysis error:', error);
      return this.fallbackAnalysis(html);
    }
  }

  fallbackAnalysis(html) {
    const cheerio = require('cheerio');
    const $ = cheerio.load(html);

    const fields = [];
    const fileUploads = [];

    $('input, textarea, select').each((i, el) => {
      const $el = $(el);
      const field = {
        name: $el.attr('name') || $el.attr('id') || `field_${i}`,
        type: $el.attr('type') || $el.prop('tagName').toLowerCase(),
        required: $el.attr('required') !== undefined,
        selector: this.generateSelector($el, $)
      };

      if (field.type === 'file') {
        fileUploads.push({
          name: field.name,
          accept: $el.attr('accept') || '*',
          selector: field.selector
        });
      } else {
        fields.push(field);
      }
    });

    return {
      fields,
      fileUploads,
      submitButton: { selector: 'button[type="submit"], input[type="submit"]' },
      validationRules: [],
      strategy: 'accessibility'
    };
  }

  generateSelector(element, $) {
    const tag = element.tagName.toLowerCase();
    const id = $(element).attr('id');
    const name = $(element).attr('name');
    const className = $(element).attr('class');

    if (id) return `#${id}`;
    if (name) return `[name="${name}"]`;
    if (className) return `${tag}.${className.split(' ')[0]}`;
    return tag;
  }
}

module.exports = FormAnalysisAgent;