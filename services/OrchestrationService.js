// services/OrchestrationService.js
const { EventEmitter } = require('events');
const { Pool } = require('pg');
const Redis = require('redis');

class OrchestrationService extends EventEmitter {
  constructor(config) {
    super();
    this.db = new Pool(config.postgres);
    this.redis = Redis.createClient({ url: config.redis.url });
    this.activeJobs = new Map();
    this.maxConcurrentJobs = config.maxConcurrentJobs || 50;
  }

  async initialize() {
    await this.redis.connect();
    await this.setupDatabase();
    this.startHealthChecks();
    this.startJobProcessor();
  }

  async setupDatabase() {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS automation_jobs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        status VARCHAR(20) DEFAULT 'pending',
        url TEXT NOT NULL,
        user_data JSONB,
        files JSONB,
        config JSONB,
        results JSONB,
        error_message TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        started_at TIMESTAMP,
        completed_at TIMESTAMP,
        session_id VARCHAR(255)
      );

      CREATE TABLE IF NOT EXISTS form_interactions (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(255),
        job_id UUID REFERENCES automation_jobs(id),
        action VARCHAR(50),
        element_selector TEXT,
        element_type VARCHAR(50),
        success BOOLEAN,
        error_message TEXT,
        screenshot_path TEXT,
        execution_time_ms INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS performance_metrics (
        id SERIAL PRIMARY KEY,
        job_id UUID REFERENCES automation_jobs(id),
        metric_name VARCHAR(100),
        metric_value NUMERIC,
        metric_unit VARCHAR(20),
        recorded_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_jobs_status ON automation_jobs(status);
      CREATE INDEX IF NOT EXISTS idx_interactions_session ON form_interactions(session_id);
      CREATE INDEX IF NOT EXISTS idx_metrics_job ON performance_metrics(job_id);
    `);
  }

  async submitJob(jobData) {
    const query = `
      INSERT INTO automation_jobs (url, user_data, files, config)
      VALUES ($1, $2, $3, $4)
      RETURNING id
    `;

    try {
      const result = await this.db.query(query, [
        jobData.url,
        JSON.stringify(jobData.userData),
        JSON.stringify(jobData.files),
        JSON.stringify(jobData.config || {})
      ]);

      const jobId = result.rows[0].id;

      // Queue job for processing
      await this.redis.lpush('job_queue', jobId);

      this.emit('job_submitted', { jobId, ...jobData });

      return jobId;
    } catch (error) {
      console.error('Error submitting job:', error);
      throw error;
    }
  }

  async startJobProcessor() {
    console.log('Starting job processor...');

    const processJobs = async () => {
      while (true) {
        try {
          if (this.activeJobs.size >= this.maxConcurrentJobs) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            continue;
          }

          const jobId = await this.redis.brpop('job_queue', 5);
          if (!jobId) continue;

          const actualJobId = jobId[1];
          this.processJob(actualJobId);

        } catch (error) {
          console.error('Job processor error:', error);
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }
    };

    // Start multiple worker processes
    const workerCount = Math.min(4, this.maxConcurrentJobs);
    for (let i = 0; i < workerCount; i++) {
      processJobs();
    }
  }

  async processJob(jobId) {
    if (this.activeJobs.has(jobId)) return;

    this.activeJobs.set(jobId, { startTime: Date.now() });

    try {
      // Mark job as started
      await this.db.query(
        'UPDATE automation_jobs SET status = $1, started_at = NOW() WHERE id = $2',
        ['running', jobId]
      );

      // Get job details
      const jobResult = await this.db.query(
        'SELECT * FROM automation_jobs WHERE id = $1',
        [jobId]
      );

      if (jobResult.rows.length === 0) {
        throw new Error('Job not found');
      }

      const job = jobResult.rows[0];

      // Execute automation
      const result = await this.executeAutomation({
        jobId,
        url: job.url,
        userData: job.user_data,
        files: job.files,
        config: job.config
      });

      // Mark job as completed
      await this.db.query(
        'UPDATE automation_jobs SET status = $1, results = $2, completed_at = NOW() WHERE id = $3',
        ['completed', JSON.stringify(result), jobId]
      );

      this.emit('job_completed', { jobId, result });

    } catch (error) {
      console.error(`Job ${jobId} failed:`, error);

      // Mark job as failed
      await this.db.query(
        'UPDATE automation_jobs SET status = $1, error_message = $2, completed_at = NOW() WHERE id = $3',
        ['failed', error.message, jobId]
      );

      this.emit('job_failed', { jobId, error: error.message });

    } finally {
      this.activeJobs.delete(jobId);
    }
  }

  async executeAutomation(jobData) {
    // This would integrate with your automation agents
    const AutomationEngine = require('./AutomationEngine');
    const engine = new AutomationEngine({
      jobId: jobData.jobId,
      ollamaUrl: process.env.OLLAMA_URL,
      dbConfig: { /* postgres config */ }
    });

    return await engine.run(jobData);
  }

  async getJobStatus(jobId) {
    const result = await this.db.query(
      'SELECT * FROM automation_jobs WHERE id = $1',
      [jobId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const job = result.rows[0];

    // Get interactions for this job
    const interactions = await this.db.query(
      'SELECT * FROM form_interactions WHERE job_id = $1 ORDER BY created_at',
      [jobId]
    );

    return {
      ...job,
      interactions: interactions.rows
    };
  }

  async getMetrics(timeRange = '24h') {
    const query = `
      SELECT
        COUNT(*) as total_jobs,
        COUNT(*) FILTER (WHERE status = 'completed') as successful_jobs,
        COUNT(*) FILTER (WHERE status = 'failed') as failed_jobs,
        AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) as avg_duration_seconds
      FROM automation_jobs
      WHERE created_at > NOW() - INTERVAL '${timeRange}'
    `;

    const result = await this.db.query(query);
    const metrics = result.rows[0];

    return {
      totalJobs: parseInt(metrics.total_jobs),
      successfulJobs: parseInt(metrics.successful_jobs),
      failedJobs: parseInt(metrics.failed_jobs),
      successRate: metrics.total_jobs > 0 ?
        (metrics.successful_jobs / metrics.total_jobs * 100).toFixed(2) + '%' : '0%',
      averageDuration: metrics.avg_duration_seconds ?
        parseFloat(metrics.avg_duration_seconds).toFixed(2) + 's' : '0s'
    };
  }

  startHealthChecks() {
    setInterval(async () => {
      try {
        // Check database connection
        await this.db.query('SELECT 1');

        // Check Redis connection
        await this.redis.ping();

        // Check active jobs
        const activeJobCount = this.activeJobs.size;

        console.log(`Health check: ${activeJobCount} active jobs, system healthy`);

      } catch (error) {
        console.error('Health check failed:', error);
        this.emit('health_check_failed', error);
      }
    }, 30000); // Every 30 seconds
  }
}

module.exports = OrchestrationService;