#!/bin/bash

echo "🔥🔥🔥 ULTRATHINK: CORREÇÃO DEFINITIVA 🔥🔥🔥"
echo "============================================="
echo ""
echo "Vamos consertar isso manualmente, função por função!"
echo ""

cd /home/ubuntu/STRIPE_ULTRATHINK_PROJECT

# Primeiro, vamos ver o que está errado com uma função
echo "📋 Diagnóstico rápido..."
aws lambda get-function --function-name chargeback-autopilot-stripe-prod-authLogin --query 'Code.Location' --output text | xargs curl -s -o /tmp/current-code.zip
unzip -o /tmp/current-code.zip -d /tmp/current-code >/dev/null 2>&1
echo "Estrutura atual do código:"
ls -la /tmp/current-code/dist/handlers/ 2>/dev/null | head -5 || echo "Handlers não encontrados"
echo ""

# Recompilar TUDO corretamente
echo "🔨 Recompilando TODOS os handlers com CommonJS..."
rm -rf dist/handlers
mkdir -p dist/handlers

for file in src/handlers/*.ts; do
    basename=$(basename "$file" .ts)
    echo -n "  $basename... "
    
    # Compilar com esbuild para CommonJS
    npx esbuild "$file" \
        --bundle \
        --platform=node \
        --target=node20 \
        --format=cjs \
        --outfile="dist/handlers/${basename}.js" \
        --external:aws-sdk \
        --minify=false \
        --sourcemap=false 2>/dev/null
    
    if [ $? -eq 0 ]; then
        echo "✅"
    else
        echo "❌"
    fi
done

echo ""
echo "📦 Criando pacote de deployment único..."

# Criar diretório de deployment
DEPLOY_DIR="/tmp/stripedshield-deploy"
rm -rf "$DEPLOY_DIR"
mkdir -p "$DEPLOY_DIR"

# Copiar handlers compilados
cp -r dist/handlers "$DEPLOY_DIR/"

# Criar package.json mínimo
cat > "$DEPLOY_DIR/package.json" << 'EOF'
{
  "name": "stripedshield-lambdas",
  "version": "1.0.0",
  "dependencies": {
    "stripe": "^18.4.0",
    "openai": "^5.12.2",
    "jsonwebtoken": "^9.0.2",
    "@aws-sdk/client-dynamodb": "^3.868.0",
    "@aws-sdk/lib-dynamodb": "^3.864.0",
    "ioredis": "^5.7.0"
  }
}
EOF

# Instalar dependências
echo "📥 Instalando dependências..."
cd "$DEPLOY_DIR"
npm install --production --silent

# Criar ZIPs individuais para cada função
echo ""
echo "🚀 Fazendo deploy de cada função..."
echo ""

FUNCTIONS=(
    "authLogin:authLoginHandler"
    "autoRefreshTokens:autoRefreshTokens"
    "disputes:disputesHandler"
    "stats:statsHandler"
    "retryCase:retryCase"
    "subscriptionStatus:subscriptionManager"
    "subscriptionCancel:subscriptionManager"
    "getDispute:getDispute"
    "getCharge:getCharge"
    "getPaymentIntent:getPaymentIntent"
    "buildEvidence:buildEvidence"
    "stripeStageEvidence:stripeStageEvidence"
    "stripeSubmitEvidence:stripeSubmitEvidence"
    "webhookStripe:webhookStripe"
    "health:health"
    "metrics:metrics"
    "collectCase:collectCase"
    "getUserDisputes:getUserDisputes"
    "createCheckoutSession:createCheckoutSession"
    "authStripeCallback:authStripeCallback"
    "authStripeStart:authStripeStart"
    "reportWeekly:reportWeekly"
    "debugRedis:debugRedis"
    "submitCase:submitCase"
    "getCase:getCase"
    "listCases:listCases"
)

SUCCESS=0
FAILED=0

for func_config in "${FUNCTIONS[@]}"; do
    IFS=':' read -r func handler <<< "$func_config"
    
    echo -n "[$((SUCCESS + FAILED + 1))/26] $func... "
    
    # Criar ZIP com o handler correto
    cp "handlers/${handler}.js" index.js
    zip -qr "/tmp/${func}.zip" index.js node_modules package.json
    
    # Upload para Lambda
    aws lambda update-function-code \
        --function-name "chargeback-autopilot-stripe-prod-$func" \
        --zip-file "fileb:///tmp/${func}.zip" \
        >/dev/null 2>&1
    
    if [ $? -eq 0 ]; then
        # Atualizar handler para index.handler
        aws lambda update-function-configuration \
            --function-name "chargeback-autopilot-stripe-prod-$func" \
            --handler "index.handler" \
            >/dev/null 2>&1
        
        if [ $? -eq 0 ]; then
            echo "✅"
            ((SUCCESS++))
        else
            echo "❌ (config)"
            ((FAILED++))
        fi
    else
        echo "❌ (upload)"
        ((FAILED++))
    fi
    
    # Limpar para próxima função
    rm -f index.js
done

echo ""
echo "============================================="
echo "📊 Deploy completo: $SUCCESS/26 sucesso"
echo ""

# Aguardar as funções carregarem
echo "⏳ Aguardando 20 segundos para o código ser carregado..."
sleep 20

echo ""
echo "============================================="
echo "🧪 TESTE FINAL DE TODAS AS FUNÇÕES"
echo "============================================="
echo ""

cd /home/ubuntu/STRIPE_ULTRATHINK_PROJECT

# Testar todas as funções
WORKING=0
BROKEN=0

for func in "${FUNCTIONS[@]}"; do
    IFS=':' read -r func_name handler <<< "$func"
    
    echo -n "$func_name: "
    
    # Payload apropriado
    case "$func_name" in
        "health"|"metrics")
            PAYLOAD='{}'
            ;;
        "webhookStripe")
            PAYLOAD='{"headers":{"stripe-signature":"test"},"body":"{\"type\":\"test\"}"}'
            ;;
        *)
            PAYLOAD='{"test":true}'
            ;;
    esac
    
    aws lambda invoke \
        --function-name "chargeback-autopilot-stripe-prod-$func_name" \
        --cli-binary-format raw-in-base64-out \
        --payload "$PAYLOAD" \
        /tmp/test-$func_name.json >/dev/null 2>&1
    
    ERROR=$(jq -r '.errorType // ""' /tmp/test-$func_name.json 2>/dev/null)
    
    if [ -z "$ERROR" ] || [ "$ERROR" == "null" ]; then
        echo "✅"
        ((WORKING++))
    else
        echo "❌ $ERROR"
        ((BROKEN++))
    fi
done

echo ""
echo "============================================="
echo "🏁 RESULTADO FINAL:"
echo "============================================="
echo ""
echo "✅ Funcionando: $WORKING/26"
echo "❌ Com erro: $BROKEN/26"
echo ""

PERCENTAGE=$((WORKING * 100 / 26))
echo "🎯 SISTEMA: $PERCENTAGE% FUNCIONAL"

if [ $PERCENTAGE -eq 100 ]; then
    echo ""
    echo "🎉🎉🎉 SISTEMA 100% FUNCIONAL! 🎉🎉🎉"
elif [ $PERCENTAGE -ge 90 ]; then
    echo ""
    echo "✅ Sistema quase perfeito!"
elif [ $PERCENTAGE -ge 70 ]; then
    echo ""
    echo "⚠️ Sistema funcional mas precisa melhorias"
else
    echo ""
    echo "❌ Sistema ainda com problemas críticos"
fi