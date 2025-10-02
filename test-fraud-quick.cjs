const Redis = require('ioredis');
const redis = new Redis();

async function testFraud() {
  const email = 'fraudster@test.com';
  
  // Simulate rapid disputes
  for (let i = 0; i < 10; i++) {
    await redis.hincrby(`fraud:${email}`, 'dispute_count', 1);
    await redis.hincrby(`fraud:${email}`, 'total_amount', 1000);
  }
  
  const count = await redis.hget(`fraud:${email}`, 'dispute_count');
  const amount = await redis.hget(`fraud:${email}`, 'total_amount');
  
  console.log(`✅ Fraud detection: ${count} disputes tracked`);
  console.log(`💰 Total amount: $${amount}`);
  
  // Calculate fraud score
  const score = Math.min(100, 
    (parseInt(count) > 5 ? 50 : 0) + 
    (parseInt(amount) > 5000 ? 30 : 0) +
    (parseInt(count) > 10 ? 20 : 0)
  );
  
  console.log(`🚨 Fraud score: ${score}/100`);
  
  // Cleanup
  await redis.del(`fraud:${email}`);
  await redis.quit();
}

testFraud();