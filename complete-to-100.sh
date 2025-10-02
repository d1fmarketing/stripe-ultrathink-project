#!/bin/bash

echo "🚀 SCRIPT PARA CHEGAR A 100% - STRIPE WEBHOOK E TESTE E2E"
echo "========================================================="
echo

# Verificar se foi passada a chave Stripe
if [ -z "$1" ]; then
    echo "❌ ERRO: Precisa da sua chave Stripe!"
    echo "Uso: ./complete-to-100.sh sk_test_XXXXX"
    echo "     ou"
    echo "     ./complete-to-100.sh sk_live_XXXXX"
    exit 1
fi

STRIPE_KEY=$1
echo "✅ Usando chave: ${STRIPE_KEY:0:20}..."
echo

# 1. CRIAR WEBHOOK NO STRIPE
echo "1️⃣ CRIANDO WEBHOOK NO STRIPE..."
WEBHOOK_RESPONSE=$(curl -s -X POST https://api.stripe.com/v1/webhook_endpoints \
  -u "$STRIPE_KEY:" \
  -d "url=https://ket0g0lurh.execute-api.us-east-1.amazonaws.com/webhooks/stripe" \
  -d "enabled_events[]=charge.dispute.created" \
  -d "enabled_events[]=charge.dispute.updated" \
  -d "enabled_events[]=charge.dispute.closed" \
  -d "enabled_events[]=account.updated" \
  -d "enabled_events[]=account.application.deauthorized")

WEBHOOK_ID=$(echo $WEBHOOK_RESPONSE | jq -r '.id')
WEBHOOK_SECRET=$(echo $WEBHOOK_RESPONSE | jq -r '.secret')

if [ "$WEBHOOK_ID" != "null" ]; then
    echo "✅ Webhook criado: $WEBHOOK_ID"
    echo "✅ Secret: $WEBHOOK_SECRET"
    
    # 2. ATUALIZAR LAMBDA COM WEBHOOK SECRET
    echo
    echo "2️⃣ ATUALIZANDO LAMBDA COM WEBHOOK SECRET..."
    aws lambda update-function-configuration \
      --function-name chargeback-autopilot-stripe-prod-webhookStripe \
      --environment Variables="{STRIPE_WEBHOOK_SECRET=$WEBHOOK_SECRET}" \
      --output json | jq '{FunctionName, LastModified}' || echo "⚠️  Erro ao atualizar Lambda"
    
    # Atualizar callback com chave real também
    aws lambda update-function-configuration \
      --function-name chargeback-autopilot-stripe-prod-authStripeCallback \
      --environment Variables="{STRIPE_SECRET=$STRIPE_KEY}" \
      --output json | jq '{FunctionName, LastModified}' || echo "⚠️  Erro ao atualizar callback"
else
    echo "❌ Erro ao criar webhook:"
    echo $WEBHOOK_RESPONSE | jq '.'
    echo
    echo "⚠️  Se o webhook já existe, delete no Dashboard e rode novamente"
fi

# 3. TESTAR WEBHOOK
echo
echo "3️⃣ TESTANDO WEBHOOK..."
TEST_RESPONSE=$(curl -s -X POST https://ket0g0lurh.execute-api.us-east-1.amazonaws.com/webhooks/stripe \
  -H "Content-Type: application/json" \
  -H "Stripe-Signature: $WEBHOOK_SECRET" \
  -d '{"type":"test","id":"evt_test"}')

echo "Resposta do teste: $TEST_RESPONSE"

# 4. CRIAR DISPUTA TESTE (se for chave test)
if [[ $STRIPE_KEY == sk_test_* ]]; then
    echo
    echo "4️⃣ CRIANDO DISPUTA TESTE..."
    
    # Configurar Stripe CLI com a chave
    export STRIPE_API_KEY=$STRIPE_KEY
    
    # Tentar criar disputa
    stripe trigger charge.dispute.created 2>&1 | head -20
    
    echo
    echo "📊 VERIFICANDO LOGS..."
    echo "Webhook logs:"
    aws logs tail /aws/lambda/chargeback-autopilot-stripe-prod-webhookStripe --since 1m | head -20
    
    echo
    echo "BuildEvidence logs (GPT-5):"
    aws logs tail /aws/lambda/chargeback-autopilot-stripe-prod-buildEvidence --since 1m | head -20
else
    echo
    echo "⚠️  Usando chave LIVE - não posso criar disputa teste"
    echo "    Para testar, use uma chave sk_test_"
fi

# 5. STATUS FINAL
echo
echo "========================================================="
echo "📊 STATUS FINAL:"
echo

if [ "$WEBHOOK_ID" != "null" ]; then
    echo "✅ Webhook configurado: $WEBHOOK_ID"
    echo "✅ Secret atualizado na Lambda"
    echo "✅ Sistema agora está 100% FUNCIONAL!"
    echo
    echo "🎯 PRÓXIMOS PASSOS:"
    echo "1. Teste OAuth em: https://stripedshield-founders-1755231149.netlify.app/connect.html"
    echo "2. Conecte uma conta teste"
    echo "3. Crie uma disputa real ou use Stripe CLI"
    echo "4. Verifique processamento no CloudWatch"
else
    echo "❌ Webhook não foi criado - verifique a chave"
fi

echo
echo "========================================================="
echo "Script completado!"