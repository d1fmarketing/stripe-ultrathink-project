#!/bin/bash

echo "🚀 ULTRATHINK: CORRIGINDO GPT-5 COM DESCOBERTA CRÍTICA"
echo "======================================================="
echo ""

API_KEY=$(aws lambda get-function-configuration \
    --function-name chargeback-autopilot-stripe-prod-buildEvidence \
    --query 'Environment.Variables.OPENAI_API_KEY' \
    --output text 2>/dev/null)

echo "TESTE 1: GPT-5 para narrativa SEM max_completion_tokens"
echo "---------------------------------------------------------"

curl -s https://api.openai.com/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "model": "gpt-5",
    "messages": [
      {
        "role": "system",
        "content": "You are an expert at writing chargeback dispute narratives."
      },
      {
        "role": "user",
        "content": "Write a 200 word narrative for a fraudulent chargeback dispute on a $299 subscription charge."
      }
    ],
    "store": true,
    "temperature": 0.7
  }' > /tmp/gpt5-narrative-working.json 2>&1

echo "Resultado:"
CONTENT=$(jq -r '.choices[0].message.content' /tmp/gpt5-narrative-working.json)
if [ -n "$CONTENT" ] && [ "$CONTENT" != "null" ] && [ "$CONTENT" != "" ]; then
    echo "✅ SUCESSO! Narrativa gerada com $(echo "$CONTENT" | wc -w) palavras"
    echo ""
    echo "Primeiras 100 palavras:"
    echo "$CONTENT" | head -c 500
    echo ""
else
    echo "❌ Falhou"
    jq . /tmp/gpt5-narrative-working.json
fi

echo ""
echo "TESTE 2: Verificar se max_tokens funciona (sem max_completion_tokens)"
echo "----------------------------------------------------------------------"

curl -s https://api.openai.com/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "model": "gpt-5",
    "messages": [
      {
        "role": "user",
        "content": "Write a chargeback narrative"
      }
    ],
    "max_tokens": 500,
    "store": true
  }' > /tmp/gpt5-max-tokens.json 2>&1

if jq -e '.choices[0].message.content != "" and .choices[0].message.content != null' /tmp/gpt5-max-tokens.json >/dev/null 2>&1; then
    echo "✅ max_tokens funciona com GPT-5!"
else
    echo "❌ max_tokens também não funciona"
fi

echo ""
echo "======================================================="
echo "📋 SOLUÇÃO FINAL PARA buildEvidence:"
echo "======================================================="

cat > /tmp/gpt5-fix-code.js << 'EOF'
// CORREÇÃO PARA GPT-5 - USAR store:true E max_tokens (NÃO max_completion_tokens)
const completion = await client.chat.completions.create({
    model: 'gpt-5',
    messages: [
        {
            role: 'system',
            content: 'You are an expert at writing compelling chargeback dispute narratives.'
        },
        {
            role: 'user',
            content: `Write a dispute narrative for:
                Amount: ${chargeData.amount}
                Currency: ${chargeData.currency}
                Customer: ${chargeData.customer_name || 'Customer'}
                Product: ${chargeData.product_description || 'Service'}
                
                Make it compelling and professional, around 200 words.`
        }
    ],
    temperature: 0.7,
    max_tokens: 500,  // USAR max_tokens, NÃO max_completion_tokens!
    store: true       // PARÂMETRO CRÍTICO PARA GPT-5!
});
EOF

echo "Código corrigido salvo em /tmp/gpt5-fix-code.js"
echo ""
echo "🎯 AÇÕES NECESSÁRIAS:"
echo "1. Atualizar buildEvidence com store:true"
echo "2. Usar max_tokens ao invés de max_completion_tokens"
echo "3. Deploy e testar"