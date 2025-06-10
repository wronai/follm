// app.js - Main orchestrator
const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const Redis = require('redis');

const FormAnalysisAgent = require('./agents/FormAnalysisAgent');
const FormFillingAgent = require('./agents/FormFillingAgent');
const BrowserService = require('./services/BrowserService');

const app = express();
const upload = multer({ dest: 'uploads/' });

// Services
const redis = Redis.createClient({ url: process.env.REDIS_URL });
const browserService = new BrowserService();
const formAnalysisAgent = new FormAnalysisAgent(process.env.OLLAMA_URL);
const formFillingAgent = new FormFillingAgent(browserService);

app.use(express.json());

// Main API endpoint
app.post('/automate-form', upload.fields([
  { name: 'cv', maxCount: 1 },
  { name: 'coverLetter', maxCount: 1 },
  { name: 'documents', maxCount: 5 }
]), async (req, res) => {
  const sessionId = uuidv4();

  try {
    const { url, ...userData } = req.body;
    const files = req.files || {};

    console.log(`Starting automation session: ${sessionId}`);

    // 1. Create browser session
    await browserService.createSession(sessionId);
    await browserService.navigateTo(sessionId, url);

    // 2. Analyze form structure
    const { html, accessibility } = await browserService.getFormStructure(sessionId);
    const formAnalysis = await formAnalysisAgent.analyzeForm(html);

    console.log('Form analysis:', formAnalysis);

    // 3. Fill form
    const fillResult = await formFillingAgent.fillForm(
      sessionId,
      formAnalysis,
      userData,
      files
    );

    // 4. Submit (optional)
    let submitResult = null;
    if (req.body.autoSubmit === 'true') {
      submitResult = await formFillingAgent.submitForm(sessionId, formAnalysis);
    }

    // 5. Cache results
    await redis.setEx(`session:${sessionId}`, 3600, JSON.stringify({
      formAnalysis,
      fillResult,
      submitResult,
      timestamp: new Date().toISOString()
    }));

    res.json({
      sessionId,
      success: fillResult.success,
      formAnalysis,
      fillResult,
      submitResult,
      screenshots: {
        initial: `initial_${sessionId}.png`,
        filled: `filled_${sessionId}.png`,
        submitted: submitResult?.screenshot
      }
    });

  } catch (error) {
    console.error('Automation error:', error);
    res.status(500).json({
      sessionId,
      success: false,
      error: error.message
    });
  } finally {
    // Cleanup session after delay
    setTimeout(async () => {
      await browserService.closeSession(sessionId);
    }, 30000);
  }
});

// Get session results
app.get('/session/:sessionId', async (req, res) => {
  try {
    const result = await redis.get(`session:${req.params.sessionId}`);
    if (!result) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json(JSON.parse(result));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', async (req, res) => {
  try {
    await redis.ping();
    res.json({
      status: 'healthy',
      services: {
        redis: 'connected',
        ollama: process.env.OLLAMA_URL,
        browser: 'ready'
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

// Demo form
app.get('/demo', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Demo Job Application Form</title>
        <style>
            body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
            .form-group { margin-bottom: 15px; }
            label { display: block; margin-bottom: 5px; font-weight: bold; }
            input, textarea, select { width: 100%; padding: 8px; margin-bottom: 5px; }
            button { background: #007bff; color: white; padding: 10px 20px; border: none; cursor: pointer; }
            .required { color: red; }
        </style>
    </head>
    <body>
        <h1>Job Application Form</h1>
        <form method="post" enctype="multipart/form-data" action="/submit">
            <div class="form-group">
                <label for="firstName">First Name <span class="required">*</span></label>
                <input type="text" id="firstName" name="firstName" required>
            </div>

            <div class="form-group">
                <label for="lastName">Last Name <span class="required">*</span></label>
                <input type="text" id="lastName" name="lastName" required>
            </div>

            <div class="form-group">
                <label for="email">Email <span class="required">*</span></label>
                <input type="email" id="email" name="email" required>
            </div>

            <div class="form-group">
                <label for="phone">Phone Number</label>
                <input type="tel" id="phone" name="phone">
            </div>

            <div class="form-group">
                <label for="position">Position Applied For <span class="required">*</span></label>
                <select id="position" name="position" required>
                    <option value="">Select Position</option>
                    <option value="frontend">Frontend Developer</option>
                    <option value="backend">Backend Developer</option>
                    <option value="fullstack">Full Stack Developer</option>
                    <option value="devops">DevOps Engineer</option>
                </select>
            </div>

            <div class="form-group">
                <label for="experience">Years of Experience</label>
                <input type="number" id="experience" name="experience" min="0" max="50">
            </div>

            <div class="form-group">
                <label for="cv">CV/Resume <span class="required">*</span></label>
                <input type="file" id="cv" name="cv" accept=".pdf,.doc,.docx" required>
            </div>

            <div class="form-group">
                <label for="coverLetter">Cover Letter</label>
                <input type="file" id="coverLetter" name="coverLetter" accept=".pdf,.doc,.docx">
            </div>

            <div class="form-group">
                <label for="portfolio">Portfolio URL</label>
                <input type="url" id="portfolio" name="portfolio" placeholder="https://yourportfolio.com">
            </div>

            <div class="form-group">
                <label for="linkedin">LinkedIn Profile</label>
                <input type="url" id="linkedin" name="linkedin" placeholder="https://linkedin.com/in/yourprofile">
            </div>

            <div class="form-group">
                <label for="skills">Technical Skills</label>
                <textarea id="skills" name="skills" rows="3" placeholder="List your technical skills..."></textarea>
            </div>

            <div class="form-group">
                <label for="motivation">Why do you want to work here?</label>
                <textarea id="motivation" name="motivation" rows="4" placeholder="Tell us about your motivation..."></textarea>
            </div>

            <div class="form-group">
                <label for="availability">Available Start Date</label>
                <input type="date" id="availability" name="availability">
            </div>

            <div class="form-group">
                <label for="salary">Expected Salary (optional)</label>
                <input type="number" id="salary" name="salary" placeholder="Expected salary in PLN">
            </div>

            <div class="form-group">
                <label>
                    <input type="checkbox" name="terms" required>
                    I agree to the terms and conditions <span class="required">*</span>
                </label>
            </div>

            <div class="form-group">
                <label>
                    <input type="checkbox" name="newsletter">
                    I want to receive job alerts via email
                </label>
            </div>

            <button type="submit">Submit Application</button>
        </form>

        <hr style="margin: 40px 0;">

        <h2>Test Automation</h2>
        <p>Use this curl command to test the automation:</p>
        <pre style="background: #f4f4f4; padding: 10px; overflow-x: auto;">
curl -X POST http://localhost:3000/automate-form \\
  -F "url=http://localhost:3000/demo" \\
  -F "firstName=Jan" \\
  -F "lastName=Kowalski" \\
  -F "email=jan.kowalski@example.com" \\
  -F "phone=+48123456789" \\
  -F "position=fullstack" \\
  -F "experience=5" \\
  -F "portfolio=https://jankowalski.dev" \\
  -F "linkedin=https://linkedin.com/in/jankowalski" \\
  -F "skills=JavaScript, Node.js, React, Docker, Kubernetes" \\
  -F "motivation=I am passionate about building scalable applications..." \\
  -F "availability=2025-02-01" \\
  -F "salary=15000" \\
  -F "cv=@cv.pdf" \\
  -F "coverLetter=@cover-letter.pdf" \\
  -F "autoSubmit=false"
        </pre>
    </body>
    </html>
  `);
});

// Form submission handler (for demo)
app.post('/submit', upload.fields([
  { name: 'cv', maxCount: 1 },
  { name: 'coverLetter', maxCount: 1 }
]), (req, res) => {
  res.json({
    success: true,
    message: 'Application submitted successfully!',
    data: req.body,
    files: Object.keys(req.files || {})
  });
});

const PORT = process.env.PORT || 3000;

async function start() {
  try {
    await redis.connect();
    console.log('Connected to Redis');

    app.listen(PORT, () => {
      console.log(`Production Form Automation running on port ${PORT}`);
      console.log(`Demo form: http://localhost:${PORT}/demo`);
      console.log(`Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error('Failed to start application:', error);
    process.exit(1);
  }
}

start();