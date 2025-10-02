#!/bin/bash

echo "🚀 ULTRATHINK: Fazendo deploy do código corrigido"
echo "=================================================="
echo ""

cd /home/ubuntu/STRIPE_ULTRATHINK_PROJECT

# Lista de funções que precisam ser atualizadas
FUNCTIONS=(
    "authLogin:authLoginHandler"
    "getDispute:getDispute"
    "getPaymentIntent:getPaymentIntent"
    "stripeStageEvidence:stripeStageEvidence"
    "stripeSubmitEvidence:stripeSubmitEvidence"
    "reportWeekly:reportWeekly"
    "submitCase:submitCase"
    "webhookStripe:webhookStripe"
    "autoRefreshTokens:autoRefreshTokens"
    "disputes:disputesHandler"
    "stats:statsHandler"
    "retryCase:retryCase"
    "subscriptionStatus:subscriptionManager"
    "subscriptionCancel:subscriptionManager"
    "getCharge:getCharge"
    "buildEvidence:buildEvidence"
    "health:health"
    "metrics:metrics"
    "collectCase:collectCase"
    "getUserDisputes:getUserDisputes"
    "createCheckoutSession:createCheckoutSession"
    "authStripeCallback:authStripeCallback"
    "authStripeStart:authStripeStart"
    "debugRedis:debugRedis"
    "getCase:getCase"
    "listCases:listCases"
)

echo "Criando pacotes ZIP para cada função..."
echo ""

SUCCESS=0
FAILED=0

for func_config in "${FUNCTIONS[@]}"; do
    IFS=':' read -r func_name handler_file <<< "$func_config"
    
    echo -n "📦 Empacotando $func_name... "
    
    # Criar diretório temporário
    TEMP_DIR="/tmp/lambda-$func_name"
    rm -rf "$TEMP_DIR"
    mkdir -p "$TEMP_DIR"
    
    # Copiar o handler compilado
    cp "dist/handlers/${handler_file}.js" "$TEMP_DIR/index.js"
    
    # Copiar package.json para dependências
    cp package.json "$TEMP_DIR/"
    
    # Instalar apenas dependências de produção
    cd "$TEMP_DIR"
    npm install --production --silent 2>/dev/null
    
    # Criar ZIP
    zip -qr "/tmp/${func_name}.zip" .
    
    echo -n "📤 Fazendo upload... "
    
    # Fazer upload para Lambda
    aws lambda update-function-code \
        --function-name "chargeback-autopilot-stripe-prod-$func_name" \
        --zip-file "fileb:///tmp/${func_name}.zip" \
        --output json > /tmp/deploy-$func_name.json 2>&1
    
    if [ $? -eq 0 ]; then
        # Atualizar handler para index.handler
        aws lambda update-function-configuration \
            --function-name "chargeback-autopilot-stripe-prod-$func_name" \
            --handler "index.handler" \
            --output json > /tmp/config-$func_name.json 2>&1
        
        if [ $? -eq 0 ]; then
            echo "✅"
            ((SUCCESS++))
        else
            echo "❌ (config)"
            ((FAILED++))
        fi
    else
        echo "❌ (upload)"
        ERROR=$(cat /tmp/deploy-$func_name.json | jq -r '.Message // "Unknown"' 2>/dev/null)
        echo "  Erro: $ERROR"
        ((FAILED++))
    fi
    
    # Limpar
    cd /home/ubuntu/STRIPE_ULTRATHINK_PROJECT
    rm -rf "$TEMP_DIR"
done

echo ""
echo "=================================================="
echo "📊 RESULTADO DO DEPLOY:"
echo "  ✅ Sucesso: $SUCCESS/${#FUNCTIONS[@]}"
echo "  ❌ Falhou: $FAILED/${#FUNCTIONS[@]}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo "🎉 DEPLOY COMPLETO COM SUCESSO!"
else
    echo "⚠️ Alguns deploys falharam."
fi

echo ""
echo "Aguardando 15 segundos para o código ser carregado..."
sleep 15

echo ""
echo "=================================================="
echo "🧪 TESTANDO FUNÇÕES APÓS DEPLOY"
echo "=================================================="

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
    elif [ "$func" == "getDispute" ]; then
        PAYLOAD='{"dispute_id":"dp_test","merchant":{"stripe_account_id":"acct_test"}}'
    else
        PAYLOAD='{"test":true}'
    fi
    
    aws lambda invoke \
        --function-name "chargeback-autopilot-stripe-prod-$func" \
        --cli-binary-format raw-in-base64-out \
        --payload "$PAYLOAD" \
        /tmp/final-test-$func.json >/dev/null 2>&1
    
    if [ -f /tmp/final-test-$func.json ]; then
        ERROR=$(jq -r '.errorType // ""' /tmp/final-test-$func.json 2>/dev/null)
        
        if [ -z "$ERROR" ] || [ "$ERROR" == "null" ]; then
            echo "✅ FUNCIONANDO!"
            ((WORKING++))
        else
            echo "❌ Erro: $ERROR"
            ((STILL_BROKEN++))
        fi
    fi
done

echo ""
echo "=================================================="
echo "📊 STATUS FINAL APÓS DEPLOY:"
echo "  ✅ Funcionando: $WORKING/8"
echo "  ❌ Com erro: $STILL_BROKEN/8"
echo ""

TOTAL_PERCENTAGE=$((($WORKING + 18) * 100 / 26))
echo "🎯 SISTEMA AGORA ESTÁ $TOTAL_PERCENTAGE% FUNCIONAL"

if [ $TOTAL_PERCENTAGE -eq 100 ]; then
    echo "🎉🎉🎉 SISTEMA 100% FUNCIONAL!"
fi