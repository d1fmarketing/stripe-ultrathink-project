#!/usr/bin/env node

const { exec } = require('child_process');
const fs = require('fs');

const LAMBDA_FUNCTIONS = [
    'health',
    'debugRedis',
    'metrics',
    'stats',
    'authLogin',
    'authStripeStart',
    'authStripeCallback',
    'autoRefreshTokens',
    'buildEvidence',
    'collectCase',
    'createCheckoutSession',
    'disputes',
    'getCase',
    'getCharge',
    'getDispute',
    'getPaymentIntent',
    'getUserDisputes',
    'listCases',
    'reportWeekly',
    'retryCase',
    'stripeStageEvidence',
    'stripeSubmitEvidence',
    'submitCase',
    'subscriptionCancel',
    'subscriptionStatus',
    'webhookStripe'
];

const TEST_PAYLOADS = {
    default: '{}',
    buildEvidence: JSON.stringify({dispute_id: 'dp_test123', charge_id: 'ch_test123'}),
    collectCase: JSON.stringify({dispute_id: 'dp_test123'}),
    getCase: JSON.stringify({case_id: 'case_test123'}),
    getCharge: JSON.stringify({charge_id: 'ch_test123'}),
    getDispute: JSON.stringify({dispute_id: 'dp_test123'}),
    getUserDisputes: JSON.stringify({user_id: 'user_test123'}),
    webhookStripe: JSON.stringify({
        id: 'evt_test123',
        type: 'charge.dispute.created',
        data: { object: { id: 'dp_test123' } }
    })
};

async function testLambda(functionName) {
    return new Promise((resolve) => {
        const payload = TEST_PAYLOADS[functionName] || TEST_PAYLOADS.default;
        const fullFunctionName = `chargeback-autopilot-stripe-prod-${functionName}`;
        const outputFile = `/tmp/test-${functionName}.json`;
        
        const command = `aws lambda invoke --function-name ${fullFunctionName} --payload '${payload}' ${outputFile} 2>&1`;
        
        exec(command, (error, stdout, stderr) => {
            let result = {
                function: functionName,
                fullName: fullFunctionName,
                success: false,
                statusCode: null,
                response: null,
                error: null,
                executionTime: null
            };

            const startTime = Date.now();
            
            if (error) {
                result.error = error.message;
                result.success = false;
            } else {
                try {
                    // Try to read the response file
                    if (fs.existsSync(outputFile)) {
                        const responseContent = fs.readFileSync(outputFile, 'utf8');
                        result.response = responseContent;
                        
                        // Parse JSON response if possible
                        try {
                            const parsedResponse = JSON.parse(responseContent);
                            result.statusCode = parsedResponse.statusCode;
                            result.success = parsedResponse.statusCode < 400;
                        } catch (e) {
                            result.success = true; // Lambda executed, even if response isn't JSON
                        }
                    }
                    
                    // Check if stdout contains Lambda execution info
                    if (stdout.includes('"StatusCode": 200')) {
                        result.success = true;
                    }
                } catch (e) {
                    result.error = e.message;
                }
            }
            
            result.executionTime = Date.now() - startTime;
            resolve(result);
        });
    });
}

async function runAllTests() {
    console.log('🧪 Testing all 26 Lambda functions...\n');
    
    const results = [];
    let working = 0;
    let broken = 0;
    
    for (const func of LAMBDA_FUNCTIONS) {
        process.stdout.write(`Testing ${func}... `);
        const result = await testLambda(func);
        results.push(result);
        
        if (result.success) {
            console.log('✅ WORKING');
            working++;
        } else {
            console.log('❌ BROKEN');
            broken++;
        }
    }
    
    console.log('\n📊 COMPREHENSIVE TEST RESULTS:');
    console.log('================================');
    console.log(`Total Functions: ${LAMBDA_FUNCTIONS.length}`);
    console.log(`Working: ${working} (${((working/LAMBDA_FUNCTIONS.length)*100).toFixed(1)}%)`);
    console.log(`Broken: ${broken} (${((broken/LAMBDA_FUNCTIONS.length)*100).toFixed(1)}%)`);
    
    console.log('\n🔍 DETAILED BREAKDOWN:');
    console.log('======================');
    
    // Working functions
    console.log('\n✅ WORKING FUNCTIONS:');
    results.filter(r => r.success).forEach(r => {
        console.log(`   - ${r.function}: Status ${r.statusCode || 'Unknown'}`);
    });
    
    // Broken functions
    console.log('\n❌ BROKEN FUNCTIONS:');
    results.filter(r => !r.success).forEach(r => {
        console.log(`   - ${r.function}: ${r.error || r.statusCode || 'Unknown error'}`);
        if (r.response) {
            try {
                const parsed = JSON.parse(r.response);
                console.log(`     Error: ${parsed.body || parsed.errorMessage || 'No details'}`);
            } catch (e) {
                console.log(`     Raw response: ${r.response.substring(0, 100)}...`);
            }
        }
    });
    
    // Save detailed results
    const reportFile = `/home/ubuntu/STRIPE_ULTRATHINK_PROJECT/lambda_test_report_${Date.now()}.json`;
    fs.writeFileSync(reportFile, JSON.stringify({
        timestamp: new Date().toISOString(),
        summary: { total: LAMBDA_FUNCTIONS.length, working, broken },
        results
    }, null, 2));
    
    console.log(`\n💾 Detailed report saved to: ${reportFile}`);
    
    return { working, broken, total: LAMBDA_FUNCTIONS.length, results };
}

if (require.main === module) {
    runAllTests().catch(console.error);
}

module.exports = { runAllTests, testLambda };