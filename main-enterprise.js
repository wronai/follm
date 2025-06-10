// main-enterprise.js
const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const prometheus = require('prom-client');

const OrchestrationService = require('./services/OrchestrationService');
const MultiModalAgent = require('./agents/MultiModalAgent');
const SelfHealingAgent = require('./agents/SelfHealingAgent');

class EnterpriseFormAutomation {
  constructor() {
    this.app = express();
    this.setupMetrics();
    this.setupMiddleware();
    this.setupServices();
    this.setupRoutes();
  }

  setupMetrics() {
    // Prometheus metrics
    this.metrics = {
      totalRequests: new prometheus.Counter({
        name: 'form_automation_requests_total',
        help: 'Total number of form automation requests',
        labelNames: ['method', 'route', 'status']
      }),
      requestDuration: new prometheus.Histogram({
        name: 'form_automation_request_duration_seconds',
        help: 'Duration of form automation requests',
        labelNames: ['method', 'route']
      }),
      activeJobs: new prometheus.Gauge({
        name: 'form_automation_active_jobs',
        help: 'Number of currently active automation jobs'
      }),
      successRate: new prometheus.Gauge({
        name: 'form_automation_success_rate',
        help: 'Success rate of form automation jobs'
      })
    };

    // Collect default metrics
    prometheus.collectDefaultMetrics();
  }

  setupMiddleware() {
    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));

    // Request logging and metrics
    this.app.use((req, res, next) => {
      const start = Date.now();

      res.on('finish', () => {
        const duration = (Date.now() - start) / 1000;

        this.metrics.totalRequests
          .labels(req.method, req.route?.path || req.path, res.statusCode)
          .inc();

        this.metrics.requestDuration
          .labels(req.method, req.route?.path || req.path)
          .observe(duration);
      });

      next();
    });

    // File upload handling
    this.upload = multer({
      dest: '/app/uploads/',
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
        files: 10
      }
    });
  }

  async setupServices() {
    // Initialize orchestration service
    this.orchestration = new OrchestrationService({
      postgres: {
        host: process.env.POSTGRES_HOST || 'postgres-service',
        port: process.env.POSTGRES_PORT || 5432,
        database: process.env.POSTGRES_DB || 'formdb',
        user: process.env.POSTGRES_USER || 'formuser',
        password: process.env.POSTGRES_PASSWORD || 'formpass'
      },
      redis: {
        url: process.env.REDIS_URL || 'redis://redis-service:6379'
      },
      maxConcurrentJobs: parseInt(process.env.MAX_CONCURRENT_SESSIONS) || 50
    });

    await this.orchestration.initialize();

    // Initialize AI agents
    this.multiModalAgent = new MultiModalAgent(process.env.OLLAMA_URL);
    this.selfHealingAgent = new SelfHealingAgent(
      this.orchestration.db.options,
      process.env.OLLAMA_URL
    );

    // Start self-healing optimization
    setInterval(() => {
      this.selfHealingAgent.optimize();
    }, 30 * 60 * 1000); // Every 30 minutes

    // Update metrics periodically
    setInterval(async () => {
      const metrics = await this.orchestration.getMetrics();
      this.metrics.successRate.set(parseFloat(metrics.successRate) / 100);
    }, 60000); // Every minute
  }

  setupRoutes() {
    // Main automation endpoint
    this.app.post('/v2/automate-form',
      this.upload.fields([
        { name: 'cv', maxCount: 1 },
        { name: 'coverLetter', maxCount: 1 },
        { name: 'portfolio', maxCount: 1 },
        { name: 'documents', maxCount: 5 }
      ]),
      async (req, res) => {
        try {
          const jobId = await this.handleFormAutomation(req);

          res.json({
            success: true,
            jobId,
            status: 'submitted',
            estimatedDuration: '30-120 seconds',
            statusUrl: `/v2/jobs/${jobId}/status`,
            resultsUrl: `/v2/jobs/${jobId}/results`
          });

        } catch (error) {
          console.error('Automation submission error:', error);
          res.status(500).json({
            success: false,
            error: error.message,
            code: 'AUTOMATION_SUBMISSION_FAILED'
          });
        }
      }
    );

    // Job status endpoint
    this.app.get('/v2/jobs/:jobId/status', async (req, res) => {
      try {
        const job = await this.orchestration.getJobStatus(req.params.jobId);

        if (!job) {
          return res.status(404).json({
            success: false,
            error: 'Job not found'
          });
        }

        res.json({
          success: true,
          job: {
            id: job.id,
            status: job.status,
            progress: this.calculateProgress(job),
            createdAt: job.created_at,
            startedAt: job.started_at,
            completedAt: job.completed_at,
            estimatedTimeRemaining: this.estimateTimeRemaining(job)
          }
        });

      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Job results endpoint
    this.app.get('/v2/jobs/:jobId/results', async (req, res) => {
      try {
        const job = await this.orchestration.getJobStatus(req.params.jobId);

        if (!job) {
          return res.status(404).json({
            success: false,
            error: 'Job not found'
          });
        }

        if (job.status !== 'completed' && job.status !== 'failed') {
          return res.status(202).json({
            success: false,
            error: 'Job not yet completed',
            status: job.status
          });
        }

        res.json({
          success: job.status === 'completed',
          job: {
            id: job.id,
            status: job.status,
            results: job.results,
            error: job.error_message,
            interactions: job.interactions,
            duration: job.completed_at && job.started_at ?
              new Date(job.completed_at) - new Date(job.started_at) : null
          }
        });

      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Batch automation endpoint
    this.app.post('/v2/batch-automate',
      this.upload.array('files', 50),
      async (req, res) => {
        try {
          const { jobs } = req.body;
          const jobIds = [];

          for (const jobData of JSON.parse(jobs)) {
            const jobId = await this.orchestration.submitJob(jobData);
            jobIds.push(jobId);
          }

          res.json({
            success: true,
            batchId: uuidv4(),
            jobIds,
            statusUrl: `/v2/batch/${jobIds[0]}/status` // Simplified for demo
          });

        } catch (error) {
          res.status(500).json({
            success: false,
            error: error.message
          });
        }
      }
    );

    // Metrics endpoint
    this.app.get('/metrics', async (req, res) => {
      res.set('Content-Type', prometheus.register.contentType);
      const metrics = await prometheus.register.metrics();
      res.send(metrics);
    });

    // Health check endpoints
    this.app.get('/health', async (req, res) => {
      try {
        const metrics = await this.orchestration.getMetrics();

        res.json({
          status: 'healthy',
          timestamp: new Date().toISOString(),
          services: {
            database: 'connected',
            redis: 'connected',
            ollama: 'connected',
            browser_pool: 'ready'
          },
          metrics
        });
      } catch (error) {
        res.status(503).json({
          status: 'unhealthy',
          error: error.message
        });
      }
    });

    this.app.get('/ready', async (req, res) => {
      try {
        // Verify all services are ready
        await this.orchestration.redis.ping();
        await this.orchestration.db.query('SELECT 1');

        res.json({ status: 'ready' });
      } catch (error) {
        res.status(503).json({
          status: 'not_ready',
          error: error.message
        });
      }
    });

    // Advanced demo form
    this.app.get('/enterprise-demo', (req, res) => {
      res.send(this.generateEnterpriseDemo());
    });
  }

  async handleFormAutomation(req) {
    const { url, autoSubmit = false, config = {}, ...userData } = req.body;
    const files = this.processUploadedFiles(req.files);

    // Submit job to orchestration service
    const jobId = await this.orchestration.submitJob({
      url,
      userData,
      files,
      config: {
        autoSubmit: autoSubmit === 'true',
        strategy: config.strategy || 'adaptive',
        maxRetries: parseInt(config.maxRetries) || 3,
        timeout: parseInt(config.timeout) || 120000,
        selfHealing: config.selfHealing !== 'false',
        visualVerification: config.visualVerification !== 'false',
        ...config
      }
    });

    return jobId;
  }

  processUploadedFiles(files) {
    const processedFiles = {};

    if (files) {
      Object.keys(files).forEach(fieldName => {
        const fileArray = files[fieldName];
        if (fileArray && fileArray.length > 0) {
          processedFiles[fieldName] = fileArray.map(file => ({
            originalName: file.originalname,
            path: file.path,
            size: file.size,
            mimetype: file.mimetype
          }));
        }
      });
    }

    return processedFiles;
  }

  calculateProgress(job) {
    if (job.status === 'pending') return 0;
    if (job.status === 'completed') return 100;
    if (job.status === 'failed') return 100;

    // Calculate based on interactions
    const totalExpectedSteps = 10; // Estimate
    const completedSteps = job.interactions ? job.interactions.length : 0;

    return Math.min(90, (completedSteps / totalExpectedSteps) * 100);
  }

  estimateTimeRemaining(job) {
    if (job.status === 'completed' || job.status === 'failed') {
      return 0;
    }

    if (job.status === 'pending') {
      return 60; // 60 seconds estimate
    }

    // Calculate based on elapsed time
    const elapsed = new Date() - new Date(job.started_at);
    const averageJobTime = 45000; // 45 seconds average

    return Math.max(0, averageJobTime - elapsed) / 1000;
  }

  generateEnterpriseDemo() {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Enterprise Form Automation Demo</title>
        <style>
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                max-width: 800px;
                margin: 0 auto;
                padding: 20px;
                background: #f5f5f5;
            }
            .container {
                background: white;
                padding: 30px;
                border-radius: 10px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            .form-group {
                margin-bottom: 20px;
            }
            label {
                display: block;
                margin-bottom: 8px;
                font-weight: 600;
                color: #333;
            }
            input, textarea, select {
                width: 100%;
                padding: 12px;
                border: 2px solid #e1e1e1;
                border-radius: 6px;
                font-size: 14px;
                transition: border-color 0.3s;
            }
            input:focus, textarea:focus, select:focus {
                border-color: #007bff;
                outline: none;
            }
            button {
                background: linear-gradient(135deg, #007bff, #0056b3);
                color: white;
                padding: 12px 30px;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-size: 16px;
                font-weight: 600;
                transition: transform 0.2s;
            }
            button:hover {
                transform: translateY(-2px);
            }
            .required { color: #dc3545; }
            .demo-section {
                background: #f8f9fa;
                padding: 20px;
                margin: 30px 0;
                border-radius: 8px;
                border-left: 4px solid #007bff;
            }
            .api-example {
                background: #2d3748;
                color: #e2e8f0;
                padding: 20px;
                border-radius: 8px;
                overflow-x: auto;
                font-family: 'Courier New', monospace;
                font-size: 13px;
                line-height: 1.5;
            }
            .step {
                display: flex;
                align-items: center;
                margin: 10px 0;
            }
            .step-number {
                background: #007bff;
                color: white;
                width: 30px;
                height: 30px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                margin-right: 15px;
                font-weight: bold;
            }
            .multi-column {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 20px;
            }
            @media (max-width: 768px) {
                .multi-column {
                    grid-template-columns: 1fr;
                }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🚀 Enterprise AI Form Automation Demo</h1>
            <p>Advanced multi-modal form automation with self-healing capabilities</p>

            <form method="post" enctype="multipart/form-data" action="/submit">
                <div class="multi-column">
                    <div>
                        <div class="form-group">
                            <label for="firstName">First Name <span class="required">*</span></label>
                            <input type="text" id="firstName" name="firstName" required
                                   data-testid="first-name" aria-label="First Name">
                        </div>

                        <div class="form-group">
                            <label for="lastName">Last Name <span class="required">*</span></label>
                            <input type="text" id="lastName" name="lastName" required
                                   data-testid="last-name" aria-label="Last Name">
                        </div>

                        <div class="form-group">
                            <label for="email">Email Address <span class="required">*</span></label>
                            <input type="email" id="email" name="email" required
                                   data-testid="email" aria-label="Email Address">
                        </div>

                        <div class="form-group">
                            <label for="phone">Phone Number</label>
                            <input type="tel" id="phone" name="phone"
                                   data-testid="phone" aria-label="Phone Number">
                        </div>

                        <div class="form-group">
                            <label for="company">Company</label>
                            <input type="text" id="company" name="company"
                                   data-testid="company" aria-label="Company Name">
                        </div>
                    </div>

                    <div>
                        <div class="form-group">
                            <label for="position">Position <span class="required">*</span></label>
                            <select id="position" name="position" required
                                    data-testid="position" aria-label="Position">
                                <option value="">Select Position</option>
                                <option value="senior-developer">Senior Developer</option>
                                <option value="tech-lead">Tech Lead</option>
                                <option value="architect">Software Architect</option>
                                <option value="manager">Engineering Manager</option>
                                <option value="director">Director of Engineering</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <label for="experience">Years of Experience</label>
                            <input type="number" id="experience" name="experience"
                                   min="0" max="50" data-testid="experience">
                        </div>

                        <div class="form-group">
                            <label for="salary">Expected Salary Range</label>
                            <select id="salary" name="salary" data-testid="salary">
                                <option value="">Prefer not to say</option>
                                <option value="50k-75k">$50k - $75k</option>
                                <option value="75k-100k">$75k - $100k</option>
                                <option value="100k-150k">$100k - $150k</option>
                                <option value="150k+">$150k+</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <label for="startDate">Available Start Date</label>
                            <input type="date" id="startDate" name="startDate"
                                   data-testid="start-date">
                        </div>

                        <div class="form-group">
                            <label for="remote">Remote Work Preference</label>
                            <select id="remote" name="remote" data-testid="remote">
                                <option value="hybrid">Hybrid</option>
                                <option value="full-remote">Full Remote</option>
                                <option value="on-site">On-site</option>
                                <option value="flexible">Flexible</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div class="form-group">
                    <label for="skills">Technical Skills <span class="required">*</span></label>
                    <textarea id="skills" name="skills" rows="3" required
                              data-testid="skills" aria-label="Technical Skills"
                              placeholder="e.g., JavaScript, Python, React, Docker, Kubernetes, AWS..."></textarea>
                </div>

                <div class="form-group">
                    <label for="cv">Resume/CV <span class="required">*</span></label>
                    <input type="file" id="cv" name="cv" accept=".pdf,.doc,.docx" required
                           data-testid="cv-upload" aria-label="Resume Upload">
                </div>

                <div class="form-group">
                    <label for="coverLetter">Cover Letter</label>
                    <input type="file" id="coverLetter" name="coverLetter" accept=".pdf,.doc,.docx"
                           data-testid="cover-letter-upload" aria-label="Cover Letter Upload">
                </div>

                <div class="form-group">
                    <label for="portfolio">Portfolio/Website</label>
                    <input type="url" id="portfolio" name="portfolio"
                           data-testid="portfolio" aria-label="Portfolio URL"
                           placeholder="https://yourportfolio.com">
                </div>

                <div class="form-group">
                    <label for="github">GitHub Profile</label>
                    <input type="url" id="github" name="github"
                           data-testid="github" aria-label="GitHub Profile"
                           placeholder="https://github.com/yourusername">
                </div>

                <div class="form-group">
                    <label for="linkedin">LinkedIn Profile</label>
                    <input type="url" id="linkedin" name="linkedin"
                           data-testid="linkedin" aria-label="LinkedIn Profile"
                           placeholder="https://linkedin.com/in/yourprofile">
                </div>

                <div class="form-group">
                    <label for="motivation">Why are you interested in this role?</label>
                    <textarea id="motivation" name="motivation" rows="4"
                              data-testid="motivation" aria-label="Motivation"
                              placeholder="Tell us about your interest in this position..."></textarea>
                </div>

                <div class="form-group">
                    <label>
                        <input type="checkbox" name="terms" required data-testid="terms">
                        I agree to the terms and conditions <span class="required">*</span>
                    </label>
                </div>

                <div class="form-group">
                    <label>
                        <input type="checkbox" name="newsletter" data-testid="newsletter">
                        Subscribe to job alerts and company updates
                    </label>
                </div>

                <button type="submit" data-testid="submit-button">Submit Application</button>
            </form>

            <div class="demo-section">
                <h2>🎯 Enterprise Automation Testing</h2>

                <div class="step">
                    <div class="step-number">1</div>
                    <div><strong>Basic Automation:</strong> Simple form filling with error handling</div>
                </div>

                <div class="step">
                    <div class="step-number">2</div>
                    <div><strong>Advanced Multi-Modal:</strong> Visual + DOM analysis with self-healing</div>
                </div>

                <div class="step">
                    <div class="step-number">3</div>
                    <div><strong>Production Monitoring:</strong> Real-time metrics and performance tracking</div>
                </div>

                <h3>API Usage Examples:</h3>

                <h4>🔸 Basic Automation:</h4>
                <div class="api-example">
curl -X POST http://localhost:3000/v2/automate-form \\
  -F "url=http://localhost:3000/enterprise-demo" \\
  -F "firstName=Sarah" \\
  -F "lastName=Chen" \\
  -F "email=sarah.chen@techcorp.com" \\
  -F "phone=+1-555-0123" \\
  -F "company=TechCorp Inc" \\
  -F "position=senior-developer" \\
  -F "experience=8" \\
  -F "salary=100k-150k" \\
  -F "startDate=2025-03-01" \\
  -F "remote=hybrid" \\
  -F "skills=JavaScript, TypeScript, React, Node.js, Docker, Kubernetes, AWS" \\
  -F "portfolio=https://sarahchen.dev" \\
  -F "github=https://github.com/sarahchen" \\
  -F "linkedin=https://linkedin.com/in/sarahchen" \\
  -F "motivation=I am excited about this role because..." \\
  -F "cv=@senior-dev-resume.pdf" \\
  -F "coverLetter=@cover-letter.pdf" \\
  -F "config.strategy=adaptive" \\
  -F "config.selfHealing=true" \\
  -F "config.visualVerification=true" \\
  -F "autoSubmit=false"
                </div>

                <h4>🔸 Monitoring Job Progress:</h4>
                <div class="api-example">
# Get job status
curl http://localhost:3000/v2/jobs/{jobId}/status

# Get detailed results
curl http://localhost:3000/v2/jobs/{jobId}/results

# View system metrics
curl http://localhost:3000/metrics
                </div>

                <h4>🔸 Batch Processing:</h4>
                <div class="api-example">
curl -X POST http://localhost:3000/v2/batch-automate \\
  -F 'jobs=[
    {
      "url": "https://company1.com/careers/apply",
      "userData": {"firstName": "John", "lastName": "Doe", ...},
      "config": {"strategy": "adaptive"}
    },
    {
      "url": "https://company2.com/jobs/apply",
      "userData": {"firstName": "John", "lastName": "Doe", ...},
      "config": {"strategy": "visual"}
    }
  ]' \\
  -F "cv=@resume.pdf"
                </div>
            </div>

            <div class="demo-section">
                <h2>📊 Enterprise Features</h2>
                <ul>
                    <li><strong>Self-Healing Automation:</strong> Automatically adapts to form changes</li>
                    <li><strong>Multi-Modal Analysis:</strong> Combines visual AI + DOM parsing</li>
                    <li><strong>Production Monitoring:</strong> Prometheus metrics + health checks</li>
                    <li><strong>Horizontal Scaling:</strong> Kubernetes-ready with load balancing</li>
                    <li><strong>Advanced Error Recovery:</strong> Multiple fallback strategies</li>
                    <li><strong>Batch Processing:</strong> Handle multiple applications simultaneously</li>
                    <li><strong>Performance Analytics:</strong> Detailed execution metrics</li>
                    <li><strong>Enterprise Security:</strong> Data encryption + audit logging</li>
                </ul>
            </div>
        </div>
    </body>
    </html>
    `;
  }

  async start() {
    const PORT = process.env.PORT || 3000;

    this.app.listen(PORT, () => {
      console.log(`🚀 Enterprise Form Automation running on port ${PORT}`);
      console.log(`📊 Metrics: http://localhost:${PORT}/metrics`);
      console.log(`🎯 Demo: http://localhost:${PORT}/enterprise-demo`);
      console.log(`❤️  Health: http://localhost:${PORT}/health`);
    });
  }
}

// Start the enterprise application
const app = new EnterpriseFormAutomation();
app.start();

module.exports = EnterpriseFormAutomation;