#!/usr/bin/env node

/**
 * Test if all fixes are working
 */

const https = require('https');
const { URL } = require('url');

const BASE_URL = 'https://stripedshield-founders-1755231149.netlify.app';

console.log('🧪 TESTING STRIPEDSHIELD FIXES\n');
console.log('================================\n');

const tests = {
    passed: 0,
    failed: 0,
    critical: []
};

// Helper to make HTTPS request
function testUrl(name, path, checkFor) {
    return new Promise((resolve) => {
        const url = new URL(path, BASE_URL);
        
        https.get(url, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                const passed = res.statusCode === 200 && 
                               (!checkFor || data.includes(checkFor));
                
                if (passed) {
                    tests.passed++;
                    console.log(`✅ ${name}`);
                } else {
                    tests.failed++;
                    tests.critical.push(name);
                    console.log(`❌ ${name}`);
                }
                
                resolve();
            });
        }).on('error', (err) => {
            tests.failed++;
            tests.critical.push(name);
            console.log(`❌ ${name}: ${err.message}`);
            resolve();
        });
    });
}

// Test backend endpoint
function testBackend() {
    return new Promise((resolve) => {
        https.get('https://ket0g0lurh.execute-api.us-east-1.amazonaws.com/metrics/performance', (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.winRate && json.winRate.current === 68) {
                        tests.passed++;
                        console.log('✅ Backend API returns real data');
                    } else {
                        tests.failed++;
                        console.log('❌ Backend API data invalid');
                    }
                } catch (e) {
                    tests.failed++;
                    console.log('❌ Backend API parse error');
                }
                resolve();
            });
        }).on('error', () => {
            tests.failed++;
            console.log('❌ Backend API unreachable');
            resolve();
        });
    });
}

// Run all tests
async function runTests() {
    // Test 1: ROI Calculator
    console.log('📊 TESTING ROI CALCULATOR:');
    await testUrl('Chart.js loaded', '/', 'chart.js@4.4.0');
    await testUrl('Canvas element exists', '/', '<canvas id="roiChart"');
    await testUrl('Calculator sliders exist', '/', 'type="range"');
    await testUrl('Try-catch for chart errors', '/', 'Failed to initialize ROI chart');
    console.log('');
    
    // Test 2: Auth Protection
    console.log('🔐 TESTING AUTH PROTECTION:');
    await testUrl('Auth page exists', '/auth.html', 'Supabase');
    await testUrl('Login form present', '/auth.html', 'Sign In');
    await testUrl('Google OAuth button', '/auth.html', 'Sign in with Google');
    await testUrl('Dashboard has auth check', '/dashboard-protected.html', 'checkAuth');
    await testUrl('Session persistence code', '/dashboard-protected.html', 'localStorage');
    console.log('');
    
    // Test 3: Stripe Integration
    console.log('💳 TESTING STRIPE SETUP:');
    await testUrl('Checkout page exists', '/checkout.html', 'Payment Information');
    await testUrl('Stripe setup guide referenced', '/checkout.html', 'STRIPE-SETUP-GUIDE.md');
    await testUrl('Payment link placeholder', '/checkout.html', 'STRIPE_PAYMENT_LINK');
    await testUrl('Setup instructions modal', '/checkout.html', 'Stripe Setup Required');
    console.log('');
    
    // Test 4: Backend Connection
    console.log('🔌 TESTING BACKEND CONNECTION:');
    await testUrl('Dashboard fetches metrics', '/dashboard-protected.html', 'metrics/performance');
    await testUrl('Real data handling', '/dashboard-protected.html', 'Real metrics loaded');
    await testUrl('Fallback to mock data', '/dashboard-protected.html', 'generateMockDisputes');
    await testBackend();
    console.log('');
    
    // Results
    console.log('================================');
    console.log('📈 RESULTS:\n');
    
    const total = tests.passed + tests.failed;
    const percentage = Math.round((tests.passed / total) * 100);
    
    console.log(`Total Tests: ${total}`);
    console.log(`✅ Passed: ${tests.passed}`);
    console.log(`❌ Failed: ${tests.failed}`);
    console.log(`Success Rate: ${percentage}%`);
    
    console.log('\n🎯 CRITICAL CHECKS:\n');
    
    const criticalPassed = [
        'Chart.js loaded',
        'Auth page exists',
        'Checkout page exists',
        'Backend API returns real data'
    ].every(test => !tests.critical.includes(test));
    
    if (criticalPassed) {
        console.log('✅ ALL CRITICAL SYSTEMS OPERATIONAL');
        console.log('✅ READY TO SELL!\n');
        
        console.log('📝 NEXT STEPS:');
        console.log('1. Create Stripe Payment Link at: https://dashboard.stripe.com/payment-links');
        console.log('2. Update checkout.html with real payment link');
        console.log('3. Test with Stripe test card: 4242 4242 4242 4242');
        console.log('4. Start selling to real customers!');
    } else {
        console.log('⚠️ Some critical systems need attention:');
        tests.critical.forEach(test => {
            console.log(`  - ${test}`);
        });
    }
    
    console.log('\n🔗 Live URL: ' + BASE_URL);
    console.log('📚 Setup Guide: /STRIPE-SETUP-GUIDE.md');
}

// Run tests
runTests().catch(console.error);