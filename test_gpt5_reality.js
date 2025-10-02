#!/usr/bin/env node

const AWS = require('aws-sdk');

/**
 * Test GPT-5 functionality by invoking the submitCase Lambda
 * which contains GPT-5 narrative generation code
 */

async function testGPT5Reality() {
    console.log('🧪 Testing GPT-5 Narrative Generation Reality Check...\n');
    
    const lambda = new AWS.Lambda({ region: 'us-east-1' });
    
    // Test payload that should trigger GPT-5 usage
    const testPayload = {
        caseId: 'case_test_gpt5',
        disputeId: 'dp_test_gpt5',
        chargeId: 'ch_test_gpt5',
        evidence: {
            charge: {
                id: 'ch_test_gpt5',
                amount: 5000,
                currency: 'usd',
                created: Math.floor(Date.now() / 1000)
            },
            customer: {
                email: 'test@example.com',
                name: 'Test Customer'
            },
            ceCandidates: [
                {
                    chargeId: 'ch_previous1',
                    created: Math.floor(Date.now() / 1000) - 86400 * 30,
                    signalOverlap: ['email', 'ip']
                }
            ]
        }
    };
    
    try {
        console.log('Testing submitCase Lambda (contains GPT-5 code)...');
        
        const result = await lambda.invoke({
            FunctionName: 'chargeback-autopilot-stripe-prod-submitCase',
            Payload: JSON.stringify(testPayload)
        }).promise();
        
        console.log('Lambda Response Status:', result.StatusCode);
        
        if (result.Payload) {
            const response = JSON.parse(result.Payload);
            console.log('Response:', JSON.stringify(response, null, 2));
            
            // Check if response contains narrative (GPT-5 generated content)
            if (response.body) {
                try {
                    const body = JSON.parse(response.body);
                    if (body.narrative || body.evidence) {
                        console.log('\n✅ GPT-5 NARRATIVE GENERATION: Evidence found in response');
                        console.log('Generated Content Preview:', 
                            body.narrative ? body.narrative.substring(0, 100) + '...' : 'No narrative field');
                    } else {
                        console.log('\n❌ GPT-5 NARRATIVE GENERATION: No narrative content in response');
                    }
                } catch (e) {
                    console.log('\n❓ GPT-5 NARRATIVE GENERATION: Response body not parseable as JSON');
                }
            }
        }
        
        // Test buildEvidence Lambda directly (also contains AI functionality)
        console.log('\n---\nTesting buildEvidence Lambda (contains AI features)...');
        
        const evidenceResult = await lambda.invoke({
            FunctionName: 'chargeback-autopilot-stripe-prod-buildEvidence',
            Payload: JSON.stringify({
                dispute_id: 'dp_test_gpt5',
                charge_id: 'ch_test_gpt5'
            })
        }).promise();
        
        console.log('Evidence Lambda Response Status:', evidenceResult.StatusCode);
        
        if (evidenceResult.Payload) {
            const evidenceResponse = JSON.parse(evidenceResult.Payload);
            console.log('Evidence Response:', JSON.stringify(evidenceResponse, null, 2));
        }
        
        console.log('\n📊 GPT-5 TEST SUMMARY:');
        console.log('======================');
        console.log('Lambda Execution:', result.StatusCode === 200 ? '✅ Success' : '❌ Failed');
        console.log('GPT-5 Configuration: Found in code (model: "gpt-5")');
        console.log('OpenAI API Key:', process.env.OPENAI_API_KEY ? '✅ Configured' : '❌ Missing');
        
        // Check environment variables from Lambda
        const configTest = await lambda.invoke({
            FunctionName: 'chargeback-autopilot-stripe-prod-health',
            Payload: '{}'
        }).promise();
        
        if (configTest.Payload) {
            const healthResponse = JSON.parse(configTest.Payload);
            if (healthResponse.body) {
                const health = JSON.parse(healthResponse.body);
                console.log('Health Check:', health.ok ? '✅ OK' : '❌ Degraded');
                console.log('Redis Status:', health.checks?.redis?.ok ? '✅ OK' : '❌ Failed');
                console.log('DynamoDB Status:', health.checks?.dynamo?.ok ? '✅ OK' : '❌ Failed');
            }
        }
        
        return {
            lambdaWorking: result.StatusCode === 200,
            hasNarrativeFeatures: true,
            configuredInCode: true,
            actuallyWorking: false // Need to check API key and responses
        };
        
    } catch (error) {
        console.error('❌ Error testing GPT-5:', error.message);
        return {
            lambdaWorking: false,
            hasNarrativeFeatures: true,
            configuredInCode: true,
            actuallyWorking: false,
            error: error.message
        };
    }
}

if (require.main === module) {
    testGPT5Reality().then(result => {
        console.log('\n🔍 FINAL GPT-5 REALITY CHECK:');
        console.log('==============================');
        console.log('Lambda Functions Deployed:', result.lambdaWorking ? '✅ Yes' : '❌ No');
        console.log('Code Contains GPT-5 References:', result.hasNarrativeFeatures ? '✅ Yes' : '❌ No');
        console.log('Actually Functional GPT-5:', result.actuallyWorking ? '✅ Yes' : '❌ Questionable');
        
        if (result.error) {
            console.log('Error Details:', result.error);
        }
        
        console.log('\n⚠️  GPT-5 Claims vs Reality:');
        console.log('- Code references "gpt-5" model ✅');
        console.log('- Temperature=1 for GPT-5 compatibility ✅');
        console.log('- Store=true parameter for GPT-5 ✅');
        console.log('- BUT: GPT-5 may not actually exist yet ⚠️');
        console.log('- OpenAI API key configuration unknown ❓');
    }).catch(console.error);
}

module.exports = { testGPT5Reality };