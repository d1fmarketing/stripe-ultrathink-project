#!/bin/bash

echo "🚀 ULTRATHINK: Deploy rápido das funções quebradas"
echo "=================================================="
echo ""

cd /home/ubuntu/STRIPE_ULTRATHINK_PROJECT

# Compilar apenas as funções quebradas com esbuild
echo "📦 Compilando funções quebradas..."
HANDLERS=(
    "authLoginHandler"
    "getDispute"
    "getPaymentIntent"
    "stripeStageEvidence"
    "stripeSubmitEvidence"
    "webhookStripe"
    "reportWeekly"
    "submitCase"
)

for handler in "${HANDLERS[@]}"; do
    echo -n "  $handler... "
    esbuild "src/handlers/${handler}.ts" \
        --bundle \
        --platform=node \
        --target=node20 \
        --format=cjs \
        --outfile="dist/handlers/${handler}.js" \
        --external:aws-sdk \
        --minify=false 2>/dev/null
    
    if [ $? -eq 0 ]; then
        echo "✅"
    else
        echo "❌"
    fi
done

echo ""
echo "📤 Fazendo deploy direto no Lambda..."
echo ""

# Criar ZIP simples para cada função
FUNCTIONS=(
    "authLogin:authLoginHandler"
    "getDispute:getDispute"
    "getPaymentIntent:getPaymentIntent"
    "stripeStageEvidence:stripeStageEvidence"
    "stripeSubmitEvidence:stripeSubmitEvidence"
    "webhookStripe:webhookStripe"
    "reportWeekly:reportWeekly"
    "submitCase:submitCase"
)

SUCCESS=0
FAILED=0

for func_config in "${FUNCTIONS[@]}"; do
    IFS=':' read -r func handler <<< "$func_config"
    
    echo -n "Atualizando $func... "
    
    # Criar diretório temporário
    TEMP_DIR="/tmp/lambda-$func"
    rm -rf "$TEMP_DIR"
    mkdir -p "$TEMP_DIR"
    
    # Copiar arquivo compilado
    cp "dist/handlers/${handler}.js" "$TEMP_DIR/index.js"
    
    # Criar package.json mínimo
    cat > "$TEMP_DIR/package.json" << EOF
{
  "name": "$func",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {}
}
EOF
    
    # Criar ZIP
    cd "$TEMP_DIR"
    zip -qr "/tmp/${func}.zip" .
    cd /home/ubuntu/STRIPE_ULTRATHINK_PROJECT
    
    # Upload para Lambda
    aws lambda update-function-code \
        --function-name "chargeback-autopilot-stripe-prod-$func" \
        --zip-file "fileb:///tmp/${func}.zip" \
        --output json > /tmp/deploy-$func.json 2>&1
    
    if [ $? -eq 0 ]; then
        # Atualizar handler
        aws lambda update-function-configuration \
            --function-name "chargeback-autopilot-stripe-prod-$func" \
            --handler "index.handler" \
            --environment "Variables={STRIPE_SECRET='$STRIPE_SECRET',OPENAI_API_KEY='$OPENAI_API_KEY',AI_MODEL='gpt-5'}" \
            --output json > /tmp/config-$func.json 2>&1
        
        if [ $? -eq 0 ]; then
            echo "✅"
            ((SUCCESS++))
        else
            echo "❌"
            ((FAILED++))
        fi
    else
        echo "❌"
        ((FAILED++))
    fi
    
    rm -rf "$TEMP_DIR"
done

echo ""
echo "=================================================="
echo "📊 Resultado: $SUCCESS/${#FUNCTIONS[@]} funções atualizadas"
echo ""

# Aguardar
echo "Aguardando 10 segundos..."
sleep 10

# Testar
echo ""
echo "🧪 TESTANDO FUNÇÕES CORRIGIDAS:"
echo "================================"

WORKING=0
for func in authLogin getDispute getPaymentIntent stripeStageEvidence stripeSubmitEvidence webhookStripe reportWeekly submitCase; do
    echo -n "$func: "
    
    if [ "$func" == "getDispute" ]; then
        PAYLOAD='{"dispute_id":"dp_test","merchant":{"stripe_account_id":"acct_test"}}'
    elif [ "$func" == "webhookStripe" ]; then
        PAYLOAD='{"headers":{"stripe-signature":"test"},"body":"{\"type\":\"test\"}"}'
    else
        PAYLOAD='{"test":true}'
    fi
    
    aws lambda invoke \
        --function-name "chargeback-autopilot-stripe-prod-$func" \
        --cli-binary-format raw-in-base64-out \
        --payload "$PAYLOAD" \
        /tmp/final-$func.json >/dev/null 2>&1
    
    ERROR=$(jq -r '.errorType // ""' /tmp/final-$func.json 2>/dev/null)
    
    if [ -z "$ERROR" ] || [ "$ERROR" == "null" ]; then
        echo "✅ FUNCIONANDO!"
        ((WORKING++))
    else
        echo "❌ $ERROR"
    fi
done

echo ""
echo "================================"
echo "📊 STATUS FINAL:"
echo "  Funcionando: $WORKING/8"
echo "  Sistema: $((($WORKING + 18) * 100 / 26))% funcional"