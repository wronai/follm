const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const winston = require('winston');

// Configure logging
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});

// Ensure upload directories exist
const uploadsDir = path.join(__dirname, 'uploads');
const screenshotsDir = path.join(__dirname, 'screenshots');
[uploadsDir, screenshotsDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const upload = multer({ storage });

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));

// Health check endpoints
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'UP' });
});

app.get('/ready', (req, res) => {
  // Add any readiness checks here
  res.status(200).json({ status: 'READY' });
});

// Form submission endpoint
app.post('/api/submit', upload.single('formData'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const jobId = uuidv4();
    logger.info(`New form submission received with job ID: ${jobId}`);
    
    // Process the form data (placeholder for actual processing logic)
    // This is where you would integrate with Playwright for form filling
    
    res.status(202).json({
      jobId,
      status: 'accepted',
      message: 'Form submission received and is being processed',
      file: req.file.filename
    });
  } catch (error) {
    logger.error(`Error processing form submission: ${error.message}`, { error });
    res.status(500).json({ 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Job status endpoint
app.get('/api/status/:jobId', (req, res) => {
  const { jobId } = req.params;
  // In a real application, you would check the job status in your database
  res.json({
    jobId,
    status: 'completed', // or 'processing', 'failed', etc.
    result: 'Form submitted successfully',
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', { error: err });
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start the server
app.listen(PORT, () => {
  logger.info(`Server is running on port ${PORT}`);
  console.log(`Server is running on port ${PORT}`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', { promise, reason });
  // In production, you might want to restart the process here
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', { error });
  // In production, you might want to restart the process here
  process.exit(1);
});
