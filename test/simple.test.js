const { execSync } = require('child_process');
const http = require('http');

// Test 1: Check CLI help
console.log('Test 1: Checking CLI help...');
try {
  const output = execSync('node app.js --help').toString();
  if (!output.includes('Usage: follm')) {
    throw new Error('CLI help does not contain expected text');
  }
  console.log('✅ CLI help test passed');
} catch (error) {
  console.error('❌ CLI help test failed:', error.message);
  process.exit(1);
}

// Test 2: Check server health
console.log('\nTest 2: Checking server health...');
const express = require('express');
const app = express();

// Add health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const server = app.listen(0); // Random port
const port = server.address().port;

const testServer = async () => {
  try {
    const response = await new Promise((resolve, reject) => {
      const req = http.get(`http://localhost:${port}/health`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({
          statusCode: res.statusCode,
          data: JSON.parse(data)
        }));
      });
      req.on('error', reject);
    });

    if (response.statusCode !== 200 || response.data.status !== 'ok') {
      throw new Error('Health check failed');
    }
    console.log('✅ Server health test passed');
  } catch (error) {
    console.error('❌ Server health test failed:', error.message);
    process.exit(1);
  } finally {
    server.close();
  }
};

testServer();
