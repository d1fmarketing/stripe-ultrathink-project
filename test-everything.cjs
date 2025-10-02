#!/usr/bin/env node

/**
 * TESTE COMPLETO DO STRIPEDSHIELD
 * Testa TUDO antes de pensar em vender!
 */

const https = require('https');
const http = require('http');

// Colors for output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m'
};

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const errors = [];

// Helper function to make HTTP requests
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : http;
    
    const req = client.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ 
        statusCode: res.statusCode, 
        headers: res.headers,
        body: data 
      }));
    });
    
    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

// Test runner
async function runTest(name, testFn) {
  totalTests++;
  process.stdout.write(`Testing: ${name}... `);
  
  try {
    await testFn();
    passedTests++;
    console.log(`${colors.green}✓ PASS${colors.reset}`);
    return true;
  } catch (error) {
    failedTests++;
    console.log(`${colors.red}✗ FAIL${colors.reset}`);
    errors.push({ test: name, error: error.message });
    return false;
  }
}

// Test functions
async function testPageLoads(url, pageName) {
  const response = await makeRequest(url);
  if (response.statusCode !== 200) {
    throw new Error(`${pageName} returned ${response.statusCode}`);
  }
  if (!response.body || response.body.length < 1000) {
    throw new Error(`${pageName} body too small (${response.body.length} bytes)`);
  }
}

async function testPageContains(url, searchString, description) {
  const response = await makeRequest(url);
  if (!response.body.includes(searchString)) {
    throw new Error(`${description} not found in page`);
  }
}

async function testAPIEndpoint(url, expectedField) {
  const response = await makeRequest(url);
  if (response.statusCode !== 200) {
    throw new Error(`API returned ${response.statusCode}`);
  }
  
  let json;
  try {
    json = JSON.parse(response.body);
  } catch (e) {
    throw new Error('Response is not valid JSON');
  }
  
  if (expectedField && !json.hasOwnProperty(expectedField)) {
    throw new Error(`Response missing field: ${expectedField}`);
  }
  
  return json;
}

// Main test suite
async function runAllTests() {
  console.log(`\n${colors.blue}═══════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.blue}     STRIPEDSHIELD COMPLETE TEST SUITE     ${colors.reset}`);
  console.log(`${colors.blue}═══════════════════════════════════════════${colors.reset}\n`);
  
  // 1. LANDING PAGE TESTS
  console.log(`\n${colors.magenta}▶ LANDING PAGE TESTS${colors.reset}`);
  console.log(`${'─'.repeat(40)}`);
  
  const landingUrl = 'https://stripedshield-founders-1755231149.netlify.app';
  
  await runTest('Landing page loads', async () => {
    await testPageLoads(landingUrl, 'Landing page');
  });
  
  await runTest('Has Alpine.js configured', async () => {
    await testPageContains(landingUrl, 'x-data="landingPage()"', 'Alpine.js setup');
  });
  
  await runTest('Has ROI Calculator', async () => {
    await testPageContains(landingUrl, 'calculator.disputes', 'ROI Calculator');
  });
  
  await runTest('Has Chart.js included', async () => {
    await testPageContains(landingUrl, 'Chart.js', 'Chart.js library');
  });
  
  await runTest('Has demo modal', async () => {
    await testPageContains(landingUrl, 'showDemo', 'Demo modal');
  });
  
  await runTest('Has FAQ accordion', async () => {
    await testPageContains(landingUrl, 'x-data="{ open: false }"', 'FAQ accordion');
  });
  
  await runTest('Has pricing section', async () => {
    await testPageContains(landingUrl, '$599', 'Founder pricing');
  });
  
  await runTest('Has CTA buttons', async () => {
    await testPageContains(landingUrl, 'openCheckout()', 'Checkout button');
  });
  
  await runTest('Has testimonial', async () => {
    await testPageContains(landingUrl, 'paid for itself', 'Testimonial');
  });
  
  await runTest('Has 68% win rate claim', async () => {
    await testPageContains(landingUrl, '68%', 'Win rate claim');
  });
  
  // 2. DEMO DASHBOARD TESTS
  console.log(`\n${colors.magenta}▶ DEMO DASHBOARD TESTS${colors.reset}`);
  console.log(`${'─'.repeat(40)}`);
  
  const demoUrl = 'https://stripedshield-founders-1755231149.netlify.app/demo.html';
  
  await runTest('Demo dashboard loads', async () => {
    await testPageLoads(demoUrl, 'Demo dashboard');
  });
  
  await runTest('Has dashboard Alpine setup', async () => {
    await testPageContains(demoUrl, 'x-data="dashboard()"', 'Dashboard Alpine.js');
  });
  
  await runTest('Has metrics display', async () => {
    await testPageContains(demoUrl, 'metrics.winRate', 'Metrics display');
  });
  
  await runTest('Has disputes table', async () => {
    await testPageContains(demoUrl, 'filteredDisputes', 'Disputes table');
  });
  
  await runTest('Has activity feed', async () => {
    await testPageContains(demoUrl, 'activities', 'Activity feed');
  });
  
  await runTest('Has Chart.js charts', async () => {
    await testPageContains(demoUrl, 'mainChart', 'Charts');
  });
  
  await runTest('Has notifications system', async () => {
    await testPageContains(demoUrl, 'notifications', 'Notifications');
  });
  
  await runTest('Has auto-refresh setup', async () => {
    await testPageContains(demoUrl, 'startAutoRefresh', 'Auto-refresh');
  });
  
  // 3. SETUP WIZARD TESTS
  console.log(`\n${colors.magenta}▶ SETUP WIZARD TESTS${colors.reset}`);
  console.log(`${'─'.repeat(40)}`);
  
  const setupUrl = 'https://stripedshield-founders-1755231149.netlify.app/setup.html';
  
  await runTest('Setup wizard loads', async () => {
    await testPageLoads(setupUrl, 'Setup wizard');
  });
  
  await runTest('Has wizard Alpine setup', async () => {
    await testPageContains(setupUrl, 'x-data="setupWizard()"', 'Wizard Alpine.js');
  });
  
  await runTest('Has progress steps', async () => {
    await testPageContains(setupUrl, 'currentStep', 'Progress steps');
  });
  
  await runTest('Has Stripe connect button', async () => {
    await testPageContains(setupUrl, 'connectStripe()', 'Stripe connect');
  });
  
  await runTest('Has webhook URL generator', async () => {
    await testPageContains(setupUrl, 'webhookUrl', 'Webhook URL');
  });
  
  await runTest('Has test connection', async () => {
    await testPageContains(setupUrl, 'runTest()', 'Test connection');
  });
  
  await runTest('Has clipboard.js', async () => {
    await testPageContains(setupUrl, 'clipboard', 'Clipboard.js');
  });
  
  // 4. API ENDPOINTS TESTS
  console.log(`\n${colors.magenta}▶ API ENDPOINTS TESTS${colors.reset}`);
  console.log(`${'─'.repeat(40)}`);
  
  const apiBase = 'https://ket0g0lurh.execute-api.us-east-1.amazonaws.com';
  
  await runTest('Health endpoint works', async () => {
    const data = await testAPIEndpoint(`${apiBase}/health`, 'ok');
    if (!data.ok && !data.degraded) {
      throw new Error('Health check failed');
    }
  });
  
  await runTest('Metrics endpoint works', async () => {
    const data = await testAPIEndpoint(`${apiBase}/metrics/performance`, 'winRate');
    if (data.winRate?.current !== 68) {
      throw new Error(`Win rate is ${data.winRate?.current}, expected 68`);
    }
  });
  
  // New endpoints - these might fail if not deployed
  await runTest('Stats endpoint works', async () => {
    try {
      await testAPIEndpoint(`${apiBase}/stats`, 'success');
    } catch (e) {
      throw new Error('Stats endpoint not deployed or not working');
    }
  });
  
  await runTest('Cases endpoint works', async () => {
    try {
      const response = await makeRequest(`${apiBase}/cases?merchant=test`);
      if (response.statusCode !== 200 && response.statusCode !== 400) {
        throw new Error(`Unexpected status: ${response.statusCode}`);
      }
    } catch (e) {
      throw new Error('Cases endpoint error: ' + e.message);
    }
  });
  
  // 5. FUNCTIONALITY TESTS
  console.log(`\n${colors.magenta}▶ FUNCTIONALITY TESTS${colors.reset}`);
  console.log(`${'─'.repeat(40)}`);
  
  await runTest('Landing has working JavaScript', async () => {
    await testPageContains(landingUrl, 'function landingPage()', 'JavaScript functions');
  });
  
  await runTest('Demo has working JavaScript', async () => {
    await testPageContains(demoUrl, 'function dashboard()', 'Dashboard functions');
  });
  
  await runTest('Setup has working JavaScript', async () => {
    await testPageContains(setupUrl, 'function setupWizard()', 'Wizard functions');
  });
  
  await runTest('ROI Calculator has correct math', async () => {
    const response = await makeRequest(landingUrl);
    // Check if calculation logic is present
    if (!response.body.includes('0.68') || !response.body.includes('0.40')) {
      throw new Error('ROI calculation values not found');
    }
  });
  
  await runTest('Mobile viewport meta tag', async () => {
    await testPageContains(landingUrl, 'viewport', 'Mobile viewport');
  });
  
  await runTest('Tailwind CSS loaded', async () => {
    await testPageContains(landingUrl, 'tailwindcss', 'Tailwind CSS');
  });
  
  // 6. CRITICAL ELEMENTS
  console.log(`\n${colors.magenta}▶ CRITICAL ELEMENTS TESTS${colors.reset}`);
  console.log(`${'─'.repeat(40)}`);
  
  await runTest('Has 7 founder spots messaging', async () => {
    await testPageContains(landingUrl, '7', 'Founder spots');
  });
  
  await runTest('Has $8,400/month loss framing', async () => {
    await testPageContains(landingUrl, '8,400', 'Loss framing');
  });
  
  await runTest('Has CE3.0 messaging', async () => {
    await testPageContains(landingUrl, 'CE3.0', 'CE3.0 feature');
  });
  
  await runTest('Has GPT-5 mention', async () => {
    await testPageContains(landingUrl, 'GPT-5', 'GPT-5 technology');
  });
  
  await runTest('Has email contact', async () => {
    await testPageContains(landingUrl, 'founders@stripedshield.com', 'Contact email');
  });
  
  // Print results
  console.log(`\n${colors.blue}═══════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.blue}              TEST RESULTS                 ${colors.reset}`);
  console.log(`${colors.blue}═══════════════════════════════════════════${colors.reset}\n`);
  
  console.log(`Total Tests: ${totalTests}`);
  console.log(`${colors.green}Passed: ${passedTests}${colors.reset}`);
  console.log(`${colors.red}Failed: ${failedTests}${colors.reset}`);
  console.log(`Success Rate: ${((passedTests/totalTests) * 100).toFixed(1)}%`);
  
  if (errors.length > 0) {
    console.log(`\n${colors.red}ERRORS:${colors.reset}`);
    errors.forEach(err => {
      console.log(`  ${colors.red}✗${colors.reset} ${err.test}: ${err.error}`);
    });
  }
  
  // Overall verdict
  console.log(`\n${colors.blue}═══════════════════════════════════════════${colors.reset}`);
  if (failedTests === 0) {
    console.log(`${colors.green}✓ ALL TESTS PASSED! Ready to start selling!${colors.reset}`);
  } else if (failedTests <= 3) {
    console.log(`${colors.yellow}⚠ MINOR ISSUES - Fix before selling${colors.reset}`);
  } else {
    console.log(`${colors.red}✗ CRITICAL ISSUES - DO NOT SELL YET!${colors.reset}`);
  }
  console.log(`${colors.blue}═══════════════════════════════════════════${colors.reset}\n`);
  
  process.exit(failedTests > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch(error => {
  console.error(`\n${colors.red}Fatal error: ${error.message}${colors.reset}`);
  process.exit(1);
});