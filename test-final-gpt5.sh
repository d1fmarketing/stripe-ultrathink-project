#!/bin/bash

echo "🧠 ULTRATHINK: Teste Final do GPT-5 Corrigido"
echo "============================================="
echo ""

PAYLOAD='{"charge":{"id":"ch_test_gpt5","amount":29900,"currency":"usd","customer_name":"John Doe","product_description":"Premium Subscription Service"}}'

aws lambda invoke \
    --function-name chargeback-autopilot-stripe-prod-buildEvidence \
    --cli-binary-format raw-in-base64-out \
    --payload "$PAYLOAD" \
    /tmp/gpt5-test-output.json

echo "Status do teste: $?"
echo ""
echo "Resposta da função:"
echo "==================="

if [ -f /tmp/gpt5-test-output.json ]; then
    RESPONSE=$(cat /tmp/gpt5-test-output.json)
    
    # Parse the body if it's a JSON string
    if echo "$RESPONSE" | jq -e '.body' >/dev/null 2>&1; then
        BODY=$(echo "$RESPONSE" | jq -r '.body' | jq '.' 2>/dev/null)
        if [ $? -eq 0 ]; then
            echo "$BODY"
            
            # Check narrative length
            LENGTH=$(echo "$BODY" | jq -r '.narrative_length // 0')
            if [ "$LENGTH" -gt 0 ]; then
                echo ""
                echo "✅✅✅ GPT-5 FUNCIONANDO! Narrativa gerada com $LENGTH caracteres! ✅✅✅"
                echo ""
                echo "Prévia da narrativa:"
                echo "$BODY" | jq -r '.evidence.uncategorized_text' | head -c 500
            else
                echo ""
                echo "⚠️ Narrativa vazia - verificar logs"
            fi
        else
            echo "$RESPONSE"
        fi
    else
        # Direct response
        echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
        
        # Check for narrative
        if echo "$RESPONSE" | jq -e '.evidence.uncategorized_text' >/dev/null 2>&1; then
            TEXT=$(echo "$RESPONSE" | jq -r '.evidence.uncategorized_text')
            if [ -n "$TEXT" ] && [ "$TEXT" != "null" ]; then
                echo ""
                echo "✅✅✅ GPT-5 FUNCIONANDO! ✅✅✅"
                echo "Narrativa: $(echo "$TEXT" | wc -c) caracteres"
            fi
        fi
    fi
else
    echo "❌ Arquivo de resposta não criado"
fi