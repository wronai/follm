const { test, expect } = require('@playwright/test');
const { execSync } = require('child_process');
const http = require('http');
const { createServer } = require('http');

// Test the CLI
test('CLI help command', () => {
  const output = execSync('node app.js --help').toString();
  expect(output).toContain('Usage: follm');
});

// Test the web server
test('Web server health check', async ({}) => {
  // Import the server dynamically to avoid port conflicts
  const { app } = await import('../server');
  
  return new Promise((resolve, reject) => {
    const server = app.listen(0, async () => {
      try {
        const port = server.address().port;
        
        // Test health check endpoint using Node's http module
        const response = await new Promise((res) => {
          const req = http.get(`http://localhost:${port}/health`, (response) => {
            let data = '';
            response.on('data', (chunk) => data += chunk);
            response.on('end', () => res({
              statusCode: response.statusCode,
              headers: response.headers,
              body: JSON.parse(data)
            }));
          });
          req.on('error', reject);
        });
        
        expect(response.statusCode).toBe(200);
        expect(response.body.status).toBe('ok');
        
        server.close(() => resolve());
      } catch (error) {
        server.close();
        reject(error);
      }
    });
  });
});
