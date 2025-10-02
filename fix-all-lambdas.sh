#!/bin/bash

echo "🔧 ULTRATHINK: Corrigindo TODAS as Lambda Functions"
echo "==================================================="
echo ""

# Lista de todas as 26 funções
FUNCTIONS=(
    "authLogin:dist/handlers/authLoginHandler.handler"
    "autoRefreshTokens:dist/handlers/autoRefreshTokens.handler"
    "disputes:dist/handlers/disputesHandler.handler"
    "stats:dist/handlers/statsHandler.handler"
    "retryCase:dist/handlers/retryCase.handler"
    "subscriptionStatus:dist/handlers/subscriptionManager.handler"
    "subscriptionCancel:dist/handlers/subscriptionManager.handler"
    "getDispute:dist/handlers/getDispute.handler"
    "getCharge:dist/handlers/getCharge.handler"
    "getPaymentIntent:dist/handlers/getPaymentIntent.handler"
    "buildEvidence:dist/handlers/buildEvidence.handler"
    "stripeStageEvidence:dist/handlers/stripeStageEvidence.handler"
    "stripeSubmitEvidence:dist/handlers/stripeSubmitEvidence.handler"
    "webhookStripe:dist/handlers/webhookStripe.handler"
    "health:dist/handlers/health.handler"
    "metrics:dist/handlers/metrics.handler"
    "collectCase:dist/handlers/collectCase.handler"
    "getUserDisputes:dist/handlers/getUserDisputes.handler"
    "createCheckoutSession:dist/handlers/createCheckoutSession.handler"
    "authStripeCallback:dist/handlers/authStripeCallback.handler"
    "authStripeStart:dist/handlers/authStripeStart.handler"
    "reportWeekly:dist/handlers/reportWeekly.handler"
    "debugRedis:dist/handlers/debugRedis.handler"
    "submitCase:dist/handlers/submitCase.handler"
    "getCase:dist/handlers/getCase.handler"
    "listCases:dist/handlers/listCases.handler"
)

SUCCESS=0
FAILED=0

for func_config in "${FUNCTIONS[@]}"; do
    IFS=':' read -r func handler <<< "$func_config"
    
    echo -n "Atualizando $func para $handler... "
    
    # Atualizar configuração do Lambda
    aws lambda update-function-configuration \
        --function-name "chargeback-autopilot-stripe-prod-$func" \
        --handler "$handler" \
        --output json > /tmp/update-$func.json 2>&1
    
    if [ $? -eq 0 ]; then
        echo "✅"
        ((SUCCESS++))
    else
        echo "❌"
        echo "  Erro: $(cat /tmp/update-$func.json | jq -r '.Message // "Unknown error"' 2>/dev/null)"
        ((FAILED++))
    fi
done

echo ""
echo "==================================================="
echo "📊 RESULTADO:"
echo "  ✅ Sucesso: $SUCCESS/26"
echo "  ❌ Falhou: $FAILED/26"
echo ""

if [ $FAILED -eq 0 ]; then
    echo "🎉 TODAS AS LAMBDAS ATUALIZADAS COM SUCESSO!"
else
    echo "⚠️ Algumas funções falharam. Verifique os logs."
fi

echo ""
echo "Aguardando 10 segundos para as configurações serem aplicadas..."
sleep 10

echo ""
echo "==================================================="
echo "🧪 TESTANDO FUNÇÕES CORRIGIDAS"
echo "==================================================="

# Testar as 8 funções que estavam quebradas
BROKEN_FUNCTIONS=(
    "authLogin"
    "getDispute"
    "getPaymentIntent"
    "stripeStageEvidence"
    "stripeSubmitEvidence"
    "webhookStripe"
    "reportWeekly"
    "submitCase"
)

WORKING=0
STILL_BROKEN=0

for func in "${BROKEN_FUNCTIONS[@]}"; do
    echo -n "Testando $func... "
    
    if [ "$func" == "webhookStripe" ]; then
        PAYLOAD='{"headers":{"stripe-signature":"test"},"body":"{\"type\":\"test\"}"}'
    else
        PAYLOAD='{"test":true}'
    fi
    
    aws lambda invoke \
        --function-name "chargeback-autopilot-stripe-prod-$func" \
        --cli-binary-format raw-in-base64-out \
        --payload "$PAYLOAD" \
        /tmp/test-$func.json >/dev/null 2>&1
    
    if [ -f /tmp/test-$func.json ]; then
        ERROR=$(jq -r '.errorType // ""' /tmp/test-$func.json 2>/dev/null)
        
        if [ -z "$ERROR" ] || [ "$ERROR" == "null" ]; then
            echo "✅ FUNCIONANDO!"
            ((WORKING++))
        else
            echo "❌ Ainda com erro: $ERROR"
            ((STILL_BROKEN++))
        fi
    else
        echo "❌ Falha no teste"
        ((STILL_BROKEN++))
    fi
done

echo ""
echo "==================================================="
echo "📊 STATUS FINAL:"
echo "  ✅ Corrigidas: $WORKING/8"
echo "  ❌ Ainda quebradas: $STILL_BROKEN/8"
echo ""

if [ $WORKING -eq 8 ]; then
    echo "🎉🎉🎉 TODAS AS FUNÇÕES QUEBRADAS FORAM CORRIGIDAS!"
else
    echo "⚠️ Ainda há funções com problemas. Verificando detalhes..."
fi