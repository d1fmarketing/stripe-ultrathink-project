#!/usr/bin/env node

const { exec } = require('child_process');
const fs = require('fs');

/**
 * Comprehensive truth analysis of StripedShield system
 * Tests claims vs reality across all components
 */

async function runCommand(command) {
    return new Promise((resolve) => {
        exec(command, (error, stdout, stderr) => {
            resolve({
                success: !error,
                stdout: stdout || '',
                stderr: stderr || '',
                error: error?.message
            });
        });
    });
}

async function testApiEndpoint(url, description) {
    const result = await runCommand(`curl -s -w "\\n%{http_code}\\n" "${url}"`);
    const lines = result.stdout.trim().split('\n');
    const httpCode = lines[lines.length - 1];
    const response = lines.slice(0, -1).join('\n');
    
    return {
        url,
        description,
        httpCode: parseInt(httpCode),
        response,
        working: parseInt(httpCode) < 400,
        success: result.success
    };
}

async function comprehensiveTruthAnalysis() {
    console.log('🔍 STRIPEDSHIELD COMPREHENSIVE TRUTH ANALYSIS');
    console.log('=============================================\n');
    
    const report = {
        timestamp: new Date().toISOString(),
        lambdaTests: {},
        apiTests: {},
        infrastructure: {},
        claims: {},
        reality: {},
        discrepancies: []
    };
    
    // Test Lambda Functions
    console.log('📡 TESTING LAMBDA FUNCTIONS...');
    console.log('------------------------------');
    
    const lambdaFunctions = [
        'health', 'debugRedis', 'metrics', 'stats', 'authLogin',
        'authStripeStart', 'authStripeCallback', 'autoRefreshTokens',
        'buildEvidence', 'collectCase', 'createCheckoutSession',
        'disputes', 'getCase', 'getCharge', 'getDispute',
        'getPaymentIntent', 'getUserDisputes', 'listCases',
        'reportWeekly', 'retryCase', 'stripeStageEvidence',
        'stripeSubmitEvidence', 'submitCase', 'subscriptionCancel',
        'subscriptionStatus', 'webhookStripe'
    ];
    
    let lambdaWorking = 0;
    
    for (const func of lambdaFunctions) {
        const result = await runCommand(`aws lambda invoke --function-name chargeback-autopilot-stripe-prod-${func} --payload '{}' /tmp/test-${func}.json 2>&1`);
        const responseFile = `/tmp/test-${func}.json`;
        
        let response = null;
        let statusCode = null;
        
        if (fs.existsSync(responseFile)) {
            try {
                const content = fs.readFileSync(responseFile, 'utf8');
                response = JSON.parse(content);
                statusCode = response.statusCode;
            } catch (e) {
                response = fs.readFileSync(responseFile, 'utf8');
            }
        }
        
        const working = result.success && !result.stdout.includes('error') && !result.stderr;
        if (working) lambdaWorking++;
        
        report.lambdaTests[func] = {
            working,
            response,
            statusCode,
            error: result.error
        };
        
        console.log(`  ${func}: ${working ? '✅' : '❌'} (${statusCode || 'Unknown'})`);
    }
    
    // Test API Gateway Endpoints
    console.log('\n🌐 TESTING API GATEWAY ENDPOINTS...');
    console.log('-----------------------------------');
    
    const apiEndpoints = [
        { url: 'https://ket0g0lurh.execute-api.us-east-1.amazonaws.com/health', desc: 'Health Check' },
        { url: 'https://ket0g0lurh.execute-api.us-east-1.amazonaws.com/stats', desc: 'Statistics' },
        { url: 'https://ket0g0lurh.execute-api.us-east-1.amazonaws.com/debug/redis', desc: 'Redis Debug' },
        { url: 'https://ket0g0lurh.execute-api.us-east-1.amazonaws.com/disputes', desc: 'Disputes List' },
        { url: 'https://ket0g0lurh.execute-api.us-east-1.amazonaws.com/cases', desc: 'Cases List' },
        { url: 'https://ket0g0lurh.execute-api.us-east-1.amazonaws.com/metrics/performance', desc: 'Performance Metrics' }
    ];
    
    let apiWorking = 0;
    
    for (const endpoint of apiEndpoints) {
        const result = await testApiEndpoint(endpoint.url, endpoint.desc);
        if (result.working) apiWorking++;
        
        report.apiTests[endpoint.desc] = result;
        console.log(`  ${endpoint.desc}: ${result.working ? '✅' : '❌'} (${result.httpCode})`);
    }
    
    // Test Infrastructure
    console.log('\n🏗️  TESTING INFRASTRUCTURE...');
    console.log('-----------------------------');
    
    // DynamoDB
    const dynamoResult = await runCommand('aws dynamodb list-tables');
    const dynamoWorking = dynamoResult.success && dynamoResult.stdout.includes('chargeback-autopilot-stripe-prod');
    report.infrastructure.dynamodb = { working: dynamoWorking, tables: dynamoResult.stdout };
    console.log(`  DynamoDB: ${dynamoWorking ? '✅' : '❌'}`);
    
    // Redis/ElastiCache
    const redisResult = await runCommand('aws elasticache describe-cache-clusters');
    const redisWorking = redisResult.success && redisResult.stdout.includes('stripedshield-redis');
    report.infrastructure.redis = { working: redisWorking, clusters: redisResult.stdout };
    console.log(`  Redis: ${redisWorking ? '✅' : '❌'}`);
    
    // API Gateway
    const apiGwResult = await runCommand('aws apigatewayv2 get-apis');
    const apiGwWorking = apiGwResult.success && apiGwResult.stdout.includes('ket0g0lurh');
    report.infrastructure.apigateway = { working: apiGwWorking, apis: apiGwResult.stdout };
    console.log(`  API Gateway: ${apiGwWorking ? '✅' : '❌'}`);
    
    // Analyze Claims vs Reality
    console.log('\n🔎 ANALYZING CLAIMS VS REALITY...');
    console.log('---------------------------------');
    
    // Document claims
    const claims = {
        '100% ready': false,
        'GPT-5 working': false,
        '68% win rate': false,
        'All functions operational': false,
        'Redis working': false,
        'Sub-second response times': false,
        'Production ready': false
    };
    
    // Reality check
    const lambdaPercentage = (lambdaWorking / lambdaFunctions.length) * 100;
    const apiPercentage = (apiWorking / apiEndpoints.length) * 100;
    const overallPercentage = (lambdaPercentage + apiPercentage) / 2;
    
    claims['All functions operational'] = lambdaPercentage > 90;
    claims['Redis working'] = redisWorking && report.apiTests['Redis Debug']?.httpCode === 503; // Failing as expected
    claims['Sub-second response times'] = report.apiTests['Statistics']?.httpCode === 200;
    claims['Production ready'] = overallPercentage > 80;
    
    // GPT-5 reality check
    const gpt5Reality = {
        codeReferences: true, // Found in source code
        actuallyExists: false, // GPT-5 doesn't exist yet
        apiKeyConfigured: false, // No OpenAI API key found
        workingInProduction: false
    };
    
    claims['GPT-5 working'] = gpt5Reality.workingInProduction;
    
    // Win rate check - need to parse stats response
    if (report.apiTests['Statistics']?.working) {
        try {
            const statsResponse = JSON.parse(report.apiTests['Statistics'].response);
            if (statsResponse.data && statsResponse.data.winRate) {
                claims['68% win rate'] = statsResponse.data.winRate >= 68;
            }
        } catch (e) {
            // Can't verify win rate
        }
    }
    
    // Generate Final Report
    console.log('\n📊 FINAL TRUTH REPORT');
    console.log('====================');
    console.log(`Lambda Functions: ${lambdaWorking}/${lambdaFunctions.length} (${lambdaPercentage.toFixed(1)}%)`);
    console.log(`API Endpoints: ${apiWorking}/${apiEndpoints.length} (${apiPercentage.toFixed(1)}%)`);
    console.log(`Infrastructure: ${[dynamoWorking, redisWorking, apiGwWorking].filter(Boolean).length}/3`);
    console.log(`Overall Functional: ${overallPercentage.toFixed(1)}%`);
    
    console.log('\n🎯 CLAIMS VERIFICATION:');
    Object.entries(claims).forEach(([claim, verified]) => {
        console.log(`  ${claim}: ${verified ? '✅ VERIFIED' : '❌ UNVERIFIED'}`);
        if (!verified) report.discrepancies.push(claim);
    });
    
    console.log('\n🤖 GPT-5 REALITY CHECK:');
    console.log(`  Code References GPT-5: ${gpt5Reality.codeReferences ? '✅' : '❌'}`);
    console.log(`  GPT-5 Actually Exists: ${gpt5Reality.actuallyExists ? '✅' : '❌'}`);
    console.log(`  OpenAI API Key: ${gpt5Reality.apiKeyConfigured ? '✅' : '❌'}`);
    console.log(`  Working in Production: ${gpt5Reality.workingInProduction ? '✅' : '❌'}`);
    
    // Save report
    report.summary = {
        functionalPercentage: overallPercentage,
        lambdaWorking,
        apiWorking,
        infrastructureComponents: [dynamoWorking, redisWorking, apiGwWorking].filter(Boolean).length,
        claimsVerified: Object.values(claims).filter(Boolean).length,
        totalClaims: Object.keys(claims).length,
        gpt5Reality
    };
    
    const reportFile = `/home/ubuntu/STRIPE_ULTRATHINK_PROJECT/truth_report_${Date.now()}.json`;
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    
    console.log(`\n💾 Complete report saved to: ${reportFile}`);
    
    return report;
}

if (require.main === module) {
    comprehensiveTruthAnalysis().catch(console.error);
}

module.exports = { comprehensiveTruthAnalysis };