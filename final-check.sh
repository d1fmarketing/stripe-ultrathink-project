#!/bin/bash
echo "🎯 ULTRATHINK FINAL STATUS"
echo "=========================="
echo ""
echo "Endpoints:"
curl -s -o /dev/null -w "  Health: %{http_code}\n" https://ket0g0lurh.execute-api.us-east-1.amazonaws.com/health
curl -s -o /dev/null -w "  OAuth: %{http_code}\n" https://ket0g0lurh.execute-api.us-east-1.amazonaws.com/auth/stripe/start
curl -X POST -s -o /dev/null -w "  Webhook: %{http_code}\n" https://ket0g0lurh.execute-api.us-east-1.amazonaws.com/webhooks/stripe -H "Content-Type: application/json" -d '{}'
echo ""
echo "Lambda Config:"
for func in webhookStripe buildEvidence authStripeStart; do
    KEY=$(aws lambda get-function-configuration --function-name "chargeback-autopilot-stripe-prod-$func" --query 'Environment.Variables.STRIPE_SECRET' --output text 2>/dev/null | head -c 20)
    MODEL=$(aws lambda get-function-configuration --function-name "chargeback-autopilot-stripe-prod-$func" --query 'Environment.Variables.AI_MODEL' --output text 2>/dev/null)
    echo "  $func: Key=${KEY}... Model=$MODEL"
done
