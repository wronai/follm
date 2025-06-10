const { test, expect } = require('@playwright/test');
const { execSync } = require('child_process');
const http = require('http');

test.describe('FOLLM', () => {
  test('should show help when run with --help', () => {
    const output = execSync('node app.js --help').toString();
    expect(output).toContain('Usage: follm');
  });

  test('should start a web server', async ({ page }) => {
    // Start the server in the background
    const serverProcess = execSync('node app.js serve & echo $!', { shell: true });
    const pid = serverProcess.toString().trim();
    
    try {
      // Wait for server to start
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Test the health check endpoint
      const response = await page.goto('http://localhost:3000/health');
      expect(response.status()).toBe(200);
      
      const data = await response.json();
      expect(data.status).toBe('ok');
    } finally {
      // Clean up the server process
      process.kill(pid, 'SIGTERM');
    }
  });
});
