const metrics = {
  disputes: 100,
  win_rate: 0.68,
  avg_amount: 140,
  monthly_fee: 799,
  competitor_rate: 0.225 // 22.5% industry average
};

const monthly_value = metrics.disputes * metrics.avg_amount * metrics.win_rate;
const roi = ((monthly_value - metrics.monthly_fee) / metrics.monthly_fee * 100).toFixed(1);
const competitor_fee = monthly_value * metrics.competitor_rate;
const savings = competitor_fee - metrics.monthly_fee;

console.log('💰 BUSINESS METRICS - ULTRATHINK:');
console.log('=====================================');
console.log(`  Disputes/month: ${metrics.disputes}`);
console.log(`  Win Rate: ${(metrics.win_rate * 100)}%`);
console.log(`  Avg Dispute: $${metrics.avg_amount}`);
console.log(`  Monthly Value Recovered: $${monthly_value.toFixed(2)}`);
console.log(`  StripedShield Fee: $${metrics.monthly_fee}`);
console.log(`  Competitor Fee (22.5%): $${competitor_fee.toFixed(2)}`);
console.log(`  Customer Savings: $${savings.toFixed(2)}/month`);
console.log(`  Customer ROI: ${roi}%`);
console.log('=====================================');
console.log(`  ✅ Target 1,754% ROI: ${roi > 1754 ? 'ACHIEVED!' : 'IN PROGRESS (' + roi + '% current)'}`);
console.log(`  ✅ Annual Savings: $${(savings * 12).toFixed(2)}`);
console.log(`  ✅ Annual Value: $${(monthly_value * 12).toFixed(2)}`);