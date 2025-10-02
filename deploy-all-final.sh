#!/bin/bash
echo "🚀 FINAL DEPLOYMENT - All 26 Functions"
echo "======================================"

cd /home/ubuntu/STRIPE_ULTRATHINK_PROJECT

FUNCTIONS=(authLogin autoRefreshTokens disputes stats retryCase subscriptionStatus subscriptionCancel getDispute getCharge getPaymentIntent buildEvidence stripeStageEvidence stripeSubmitEvidence webhookStripe health metrics collectCase getUserDisputes createCheckoutSession authStripeCallback authStripeStart reportWeekly debugRedis submitCase getCase listCases)

SUCCESS=0
for func in "${FUNCTIONS[@]}"; do
  echo -n "[$((++SUCCESS))/26] Deploying $func... "
  
  # Map function name to handler file
  case $func in
    authLogin) handler="authLoginHandler" ;;
    disputes) handler="disputesHandler" ;;
    stats) handler="statsHandler" ;;
    subscriptionStatus|subscriptionCancel) handler="subscriptionManager" ;;
    *) handler="$func" ;;
  esac
  
  # Create and deploy package
  rm -rf /tmp/$func-deploy
  mkdir -p /tmp/$func-deploy/dist/handlers
  cp dist/handlers/$handler.js /tmp/$func-deploy/dist/handlers/ 2>/dev/null
  (cd /tmp/$func-deploy && zip -qr $func.zip dist/)
  
  if aws lambda update-function-code --function-name chargeback-autopilot-stripe-prod-$func --zip-file fileb:///tmp/$func-deploy/$func.zip >/dev/null 2>&1; then
    echo "✅"
  else
    echo "❌"
  fi
done

echo ""
echo "🎯 Deployment Complete! Testing endpoints..."
curl -s -o /dev/null -w "health: %{http_code}\n" https://ket0g0lurh.execute-api.us-east-1.amazonaws.com/health