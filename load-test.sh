#!/bin/bash
echo "🔥 Load test: 100 requests concorrentes"
START=$(date +%s%N)

for i in {1..100}; do
  redis-cli set "load:test:$i" "value$i" > /dev/null 2>&1 &
done

wait

END=$(date +%s%N)
DURATION=$((($END - $START) / 1000000))

echo "✅ Load test completo em ${DURATION}ms"
echo "📊 Verificando performance..."
redis-cli info stats | grep instantaneous_ops_per_sec

# Cleanup
redis-cli --scan --pattern "load:test:*" | xargs -L 100 redis-cli del > /dev/null 2>&1
echo "🧹 Cleanup completo"