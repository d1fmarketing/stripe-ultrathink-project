import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: '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'
});

console.log('🔍 Checking OpenAI API Key...\n');

async function checkAPI() {
  try {
    // Try to list models
    console.log('📋 Attempting to list available models...');
    const models = await openai.models.list();
    console.log('\n✅ API Key is valid! Available models:');
    for await (const model of models) {
      if (model.id.includes('gpt')) {
        console.log('  - ' + model.id);
      }
    }
  } catch (error) {
    console.log('\n❌ API Key Error:', error.message);
    
    if (error.status === 401) {
      console.log('\n⚠️  This API key is INVALID or EXPIRED');
      console.log('   You need a valid OpenAI API key from: https://platform.openai.com/api-keys');
    } else if (error.status === 403) {
      console.log('\n⚠️  This API key has NO PERMISSIONS');
      console.log('   The project associated with this key has no model access');
    }
    
    console.log('\n💡 SOLUTION:');
    console.log('1. Get a new API key from: https://platform.openai.com/api-keys');
    console.log('2. Make sure you have credits in your OpenAI account');
    console.log('3. Use a key that has access to GPT models');
  }
}

checkAPI();