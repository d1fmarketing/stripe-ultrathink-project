#!/bin/bash

echo "🧠 ULTRATHINK: Teste GPT-5 com parâmetros funcionais"
echo "===================================================="

API_KEY=$(aws lambda get-function-configuration \
    --function-name chargeback-autopilot-stripe-prod-buildEvidence \
    --query 'Environment.Variables.OPENAI_API_KEY' \
    --output text)

echo "1. Teste simples (que funcionou antes):"
curl -s https://api.openai.com/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "model": "gpt-5",
    "messages": [
      {
        "role": "user",
        "content": "Say hello"
      }
    ],
    "store": true
  }' > /tmp/test1.json

echo "Resultado teste 1:"
jq -r '.choices[0].message.content // .error.message' /tmp/test1.json
echo ""

echo "2. Teste com narrativa curta:"
curl -s https://api.openai.com/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "model": "gpt-5",
    "messages": [
      {
        "role": "user",
        "content": "Write a short chargeback dispute narrative in 50 words"
      }
    ],
    "store": true
  }' > /tmp/test2.json

echo "Resultado teste 2:"
jq -r '.choices[0].message.content // .error.message' /tmp/test2.json | head -c 500
echo ""

echo "3. Teste com narrativa completa:"
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
        "content": "Write a professional chargeback dispute narrative for a $299 charge. The customer claims fraud but actually received the service. Include verification details."
      }
    ],
    "store": true
  }' > /tmp/test3.json

echo ""
echo "Resultado teste 3:"
CONTENT=$(jq -r '.choices[0].message.content // ""' /tmp/test3.json)
if [ -n "$CONTENT" ] && [ "$CONTENT" != "" ] && [ "$CONTENT" != "null" ]; then
    echo "✅ SUCESSO! Narrativa gerada:"
    echo "$CONTENT" | head -c 800
    echo ""
    echo ""
    echo "Tamanho: $(echo "$CONTENT" | wc -w) palavras"
else
    echo "❌ Falhou:"
    jq . /tmp/test3.json
fi