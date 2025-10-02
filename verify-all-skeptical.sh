#!/bin/bash

echo "🧠🧠🧠 ULTRATHINK: VERIFICAÇÃO CÉTICA COMPLETA 🧠🧠🧠"
echo "======================================================"
echo ""
echo "NÃO CONFIE EM NADA. VERIFIQUE TUDO."
echo ""

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

TOTAL_ISSUES=0
CRITICAL_ISSUES=0

echo "======================================"
echo "1. VERIFICANDO TODAS AS 26 LAMBDAS"
echo "======================================"

LAMBDAS=(
    "authLogin" "autoRefreshTokens" "disputes" "stats" "retryCase"
    "subscriptionStatus" "subscriptionCancel" "getDispute" "getCharge"
    "getPaymentIntent" "buildEvidence" "stripeStageEvidence" 
    "stripeSubmitEvidence" "webhookStripe" "health" "metrics"
    "collectCase" "getUserDisputes" "createCheckoutSession"
    "authStripeCallback" "authStripeStart" "reportWeekly"
    "debugRedis" "submitCase" "getCase" "listCases"
)

WORKING_LAMBDAS=0
FAILED_LAMBDAS=0

for func in "${LAMBDAS[@]}"; do
    echo -n "Testando $func... "
    
    # Verificar se existe
    EXISTS=$(aws lambda get-function --function-name "chargeback-autopilot-stripe-prod-$func" 2>/dev/null | jq -r '.Configuration.FunctionName' 2>/dev/null)
    
    if [ -z "$EXISTS" ]; then
        echo -e "${RED}❌ NÃO EXISTE${NC}"
        ((FAILED_LAMBDAS++))
        ((CRITICAL_ISSUES++))
        continue
    fi
    
    # Verificar configuração
    CONFIG=$(aws lambda get-function-configuration --function-name "chargeback-autopilot-stripe-prod-$func" 2>/dev/null)
    
    # Verificar API keys
    HAS_OPENAI=$(echo "$CONFIG" | jq -r '.Environment.Variables.OPENAI_API_KEY // ""' | grep -q "sk-proj" && echo "1" || echo "0")
    HAS_STRIPE=$(echo "$CONFIG" | jq -r '.Environment.Variables.STRIPE_SECRET // ""' | grep -q "sk_live" && echo "1" || echo "0")
    AI_MODEL=$(echo "$CONFIG" | jq -r '.Environment.Variables.AI_MODEL // ""')
    
    # Testar invocação
    if [[ "$func" == "health" ]]; then
        INVOKE_RESULT=$(aws lambda invoke --function-name "chargeback-autopilot-stripe-prod-$func" \
            --cli-binary-format raw-in-base64-out \
            --payload '{}' \
            /tmp/test-$func.json 2>&1)
        STATUS=$?
    else
        INVOKE_RESULT=$(aws lambda invoke --function-name "chargeback-autopilot-stripe-prod-$func" \
            --cli-binary-format raw-in-base64-out \
            --payload '{"test": true}' \
            /tmp/test-$func.json 2>&1)
        STATUS=$?
    fi
    
    if [ $STATUS -eq 0 ] && [ -f /tmp/test-$func.json ]; then
        ERROR=$(jq -r '.errorType // ""' /tmp/test-$func.json 2>/dev/null)
        if [ -z "$ERROR" ] || [ "$ERROR" == "null" ]; then
            echo -e "${GREEN}✅${NC} (AI: $AI_MODEL)"
            ((WORKING_LAMBDAS++))
        else
            echo -e "${YELLOW}⚠️ Error: $ERROR${NC}"
            ((TOTAL_ISSUES++))
        fi
    else
        echo -e "${RED}❌ FALHA CRÍTICA${NC}"
        ((FAILED_LAMBDAS++))
        ((CRITICAL_ISSUES++))
    fi
done

echo ""
echo "Resumo Lambdas:"
echo "  Funcionando: $WORKING_LAMBDAS/26"
echo "  Com erros: $((26 - WORKING_LAMBDAS - FAILED_LAMBDAS))"
echo "  Não existem: $FAILED_LAMBDAS"
echo ""

echo "======================================"
echo "2. VERIFICANDO API GATEWAY"
echo "======================================"

API_ID=$(aws apigatewayv2 get-apis --query "Items[?Name=='chargeback-autopilot-stripe-prod'].ApiId" --output text 2>/dev/null)

if [ -n "$API_ID" ]; then
    echo "API ID: $API_ID"
    
    # Verificar rotas
    ROUTES=$(aws apigatewayv2 get-routes --api-id "$API_ID" --query 'Items[].RouteKey' --output text 2>/dev/null | wc -w)
    echo "Total de rotas: $ROUTES"
    
    if [ "$ROUTES" -lt 17 ]; then
        echo -e "${YELLOW}⚠️ Esperado 17 rotas, encontrado $ROUTES${NC}"
        ((TOTAL_ISSUES++))
    else
        echo -e "${GREEN}✅ Todas as rotas configuradas${NC}"
    fi
    
    # Testar endpoint
    API_ENDPOINT="https://$API_ID.execute-api.us-east-1.amazonaws.com/prod"
    HEALTH_CHECK=$(curl -s -o /dev/null -w "%{http_code}" "$API_ENDPOINT/health" 2>/dev/null)
    
    if [ "$HEALTH_CHECK" == "200" ]; then
        echo -e "${GREEN}✅ API respondendo (HTTP 200)${NC}"
    else
        echo -e "${RED}❌ API não responde (HTTP $HEALTH_CHECK)${NC}"
        ((CRITICAL_ISSUES++))
    fi
else
    echo -e "${RED}❌ API Gateway não encontrado!${NC}"
    ((CRITICAL_ISSUES++))
fi

echo ""
echo "======================================"
echo "3. VERIFICANDO DYNAMODB"
echo "======================================"

EXPECTED_TABLES=(
    "chargeback-autopilot-stripe-prod-disputes"
    "chargeback-autopilot-stripe-prod-users"
    "chargeback-autopilot-stripe-prod-cases"
    "chargeback-autopilot-stripe-prod-evidence"
    "chargeback-autopilot-stripe-prod-webhooks"
    "chargeback-autopilot-stripe-prod-sessions"
    "chargeback-autopilot-stripe-prod-metrics"
    "chargeback-autopilot-stripe-prod-subscriptions"
)

EXISTING_TABLES=$(aws dynamodb list-tables --query 'TableNames' --output json 2>/dev/null)
FOUND_TABLES=0

for table in "${EXPECTED_TABLES[@]}"; do
    if echo "$EXISTING_TABLES" | grep -q "\"$table\""; then
        echo -e "  $table: ${GREEN}✅${NC}"
        ((FOUND_TABLES++))
    else
        echo -e "  $table: ${RED}❌ NÃO EXISTE${NC}"
        ((TOTAL_ISSUES++))
    fi
done

echo "Total: $FOUND_TABLES/8 tabelas"
echo ""

echo "======================================"
echo "4. TESTE ESPECÍFICO DO GPT-5"
echo "======================================"

# Teste direto do buildEvidence
echo "Testando buildEvidence com GPT-5..."
PAYLOAD='{"charge":{"id":"ch_ultrathink_test","amount":99900,"currency":"usd","customer_name":"UltraThink Test","product_description":"Verification Service"}}'

aws lambda invoke \
    --function-name chargeback-autopilot-stripe-prod-buildEvidence \
    --cli-binary-format raw-in-base64-out \
    --payload "$PAYLOAD" \
    /tmp/gpt5-ultrathink-test.json >/dev/null 2>&1

if [ -f /tmp/gpt5-ultrathink-test.json ]; then
    RESPONSE=$(cat /tmp/gpt5-ultrathink-test.json)
    
    # Verificar se tem erro
    ERROR=$(echo "$RESPONSE" | jq -r '.errorType // ""' 2>/dev/null)
    if [ -n "$ERROR" ] && [ "$ERROR" != "null" ]; then
        echo -e "${RED}❌ ERRO: $ERROR${NC}"
        ((CRITICAL_ISSUES++))
    else
        # Verificar narrativa
        NARRATIVE=$(echo "$RESPONSE" | jq -r '.evidence.uncategorized_text // ""' 2>/dev/null)
        if [ -n "$NARRATIVE" ] && [ "$NARRATIVE" != "null" ] && [ "$NARRATIVE" != "" ]; then
            LENGTH=${#NARRATIVE}
            if [ $LENGTH -gt 100 ]; then
                echo -e "${GREEN}✅ GPT-5 FUNCIONANDO! Narrativa: $LENGTH caracteres${NC}"
            else
                echo -e "${YELLOW}⚠️ Narrativa muito curta: $LENGTH caracteres${NC}"
                ((TOTAL_ISSUES++))
            fi
        else
            echo -e "${RED}❌ GPT-5 NÃO ESTÁ GERANDO NARRATIVAS!${NC}"
            ((CRITICAL_ISSUES++))
        fi
        
        # Verificar AI model usado
        AI_USED=$(echo "$RESPONSE" | jq -r '.ai_used // ""' 2>/dev/null)
        if [ "$AI_USED" == "gpt-5" ]; then
            echo -e "  Modelo: ${GREEN}✅ GPT-5${NC}"
        elif [ "$AI_USED" == "fallback" ]; then
            echo -e "  Modelo: ${YELLOW}⚠️ Fallback (GPT-5 falhou)${NC}"
            ((TOTAL_ISSUES++))
        else
            echo -e "  Modelo: ${RED}❌ $AI_USED (não é GPT-5!)${NC}"
            ((CRITICAL_ISSUES++))
        fi
    fi
else
    echo -e "${RED}❌ Teste falhou completamente${NC}"
    ((CRITICAL_ISSUES++))
fi

echo ""
echo "======================================"
echo "5. VERIFICANDO INTEGRAÇÃO STRIPE"
echo "======================================"

# Verificar se webhook está configurado
STRIPE_KEY=$(aws lambda get-function-configuration \
    --function-name chargeback-autopilot-stripe-prod-webhookStripe \
    --query 'Environment.Variables.STRIPE_SECRET' \
    --output text 2>/dev/null)

if [[ "$STRIPE_KEY" == sk_live_* ]]; then
    echo -e "Stripe Key: ${GREEN}✅ Configurada (Live)${NC}"
    
    # Testar conexão com Stripe (read-only)
    curl -s https://api.stripe.com/v1/charges \
        -u "$STRIPE_KEY:" \
        -d limit=1 > /tmp/stripe-test.json 2>&1
    
    if grep -q '"object": "list"' /tmp/stripe-test.json 2>/dev/null; then
        echo -e "Conexão Stripe: ${GREEN}✅ Funcionando${NC}"
    else
        echo -e "Conexão Stripe: ${RED}❌ Falha na autenticação${NC}"
        ((CRITICAL_ISSUES++))
    fi
else
    echo -e "Stripe Key: ${RED}❌ Não configurada ou inválida${NC}"
    ((CRITICAL_ISSUES++))
fi

echo ""
echo "======================================"
echo "6. ANÁLISE DE LOGS RECENTES"
echo "======================================"

echo "Verificando erros nos últimos 10 minutos..."

for func in "buildEvidence" "disputes" "webhookStripe"; do
    echo -n "  $func: "
    
    ERROR_COUNT=$(aws logs filter-log-events \
        --log-group-name "/aws/lambda/chargeback-autopilot-stripe-prod-$func" \
        --start-time $(($(date +%s) - 600))000 \
        --filter-pattern "ERROR" \
        --query 'events | length(@)' \
        --output text 2>/dev/null || echo "0")
    
    if [ "$ERROR_COUNT" == "0" ] || [ -z "$ERROR_COUNT" ]; then
        echo -e "${GREEN}✅ Sem erros${NC}"
    else
        echo -e "${YELLOW}⚠️ $ERROR_COUNT erros encontrados${NC}"
        ((TOTAL_ISSUES++))
    fi
done

echo ""
echo "======================================"
echo "🧠 ANÁLISE ULTRATHINK FINAL"
echo "======================================"
echo ""

PERCENTAGE=$((WORKING_LAMBDAS * 100 / 26))

echo "📊 ESTATÍSTICAS:"
echo "  - Lambdas funcionando: $WORKING_LAMBDAS/26 ($PERCENTAGE%)"
echo "  - Problemas totais: $TOTAL_ISSUES"
echo "  - Problemas CRÍTICOS: $CRITICAL_ISSUES"
echo ""

if [ $CRITICAL_ISSUES -eq 0 ]; then
    if [ $TOTAL_ISSUES -eq 0 ]; then
        echo -e "${GREEN}✅✅✅ SISTEMA 100% FUNCIONAL!${NC}"
        echo "GPT-5 está funcionando perfeitamente!"
    else
        echo -e "${YELLOW}⚠️ Sistema ~90% funcional${NC}"
        echo "Alguns problemas menores detectados, mas nada crítico."
    fi
else
    echo -e "${RED}❌❌❌ SISTEMA COM PROBLEMAS CRÍTICOS!${NC}"
    echo ""
    echo "PROBLEMAS QUE PRECISAM SER CORRIGIDOS:"
    
    if [ $FAILED_LAMBDAS -gt 0 ]; then
        echo "  - $FAILED_LAMBDAS Lambdas não existem ou estão quebradas"
    fi
    
    if [ "$HEALTH_CHECK" != "200" ]; then
        echo "  - API Gateway não está respondendo"
    fi
    
    echo ""
    echo "PORCENTAGEM REAL DE FUNCIONAMENTO: $PERCENTAGE%"
fi

echo ""
echo "======================================"
echo "📝 EVIDÊNCIAS COLETADAS:"
echo "  - /tmp/gpt5-ultrathink-test.json (teste GPT-5)"
echo "  - /tmp/test-*.json (testes individuais)"
echo "  - /tmp/stripe-test.json (teste Stripe)"
echo "======================================"