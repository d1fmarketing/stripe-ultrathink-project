#!/bin/bash

echo "🧠🧠🧠 ULTRATHINK: INVESTIGAÇÃO PROFUNDA DO GPT-5 🧠🧠🧠"
echo "========================================================="
echo ""
echo "DESCOBERTA CRÍTICA: GPT-5 está usando 500 'reasoning_tokens'"
echo "mas retornando conteúdo VAZIO! Vamos investigar..."
echo ""

# Pegar API key
API_KEY=$(aws lambda get-function-configuration \
    --function-name chargeback-autopilot-stripe-prod-buildEvidence \
    --query 'Environment.Variables.OPENAI_API_KEY' \
    --output text 2>/dev/null)

echo "======================================"
echo "TESTE 1: GPT-5 com reasoning_effort"
echo "======================================"

curl -s https://api.openai.com/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "model": "gpt-5",
    "messages": [
      {
        "role": "user",
        "content": "Write a chargeback dispute narrative."
      }
    ],
    "reasoning_effort": "low",
    "temperature": 0.7,
    "max_completion_tokens": 500
  }' > /tmp/gpt5-reasoning-low.json 2>&1

echo "Resposta com reasoning_effort=low:"
jq -r '.choices[0].message.content // "VAZIO"' /tmp/gpt5-reasoning-low.json
echo "Tokens usados para reasoning:" 
jq -r '.usage.completion_tokens_details.reasoning_tokens' /tmp/gpt5-reasoning-low.json
echo ""

echo "======================================"
echo "TESTE 2: GPT-5 com store:true"
echo "======================================"

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
    "store": true,
    "metadata": {
      "test": "gpt5-output-check"
    }
  }' > /tmp/gpt5-store.json 2>&1

echo "Resposta com store=true:"
jq -r '.choices[0].message.content // "VAZIO"' /tmp/gpt5-store.json
echo ""

echo "======================================"
echo "TESTE 3: GPT-5 com response_format"
echo "======================================"

curl -s https://api.openai.com/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "model": "gpt-5",
    "messages": [
      {
        "role": "system",
        "content": "You must provide a response."
      },
      {
        "role": "user",
        "content": "Generate a chargeback narrative."
      }
    ],
    "response_format": {
      "type": "text"
    },
    "temperature": 0.5
  }' > /tmp/gpt5-format.json 2>&1

echo "Resposta com response_format=text:"
jq -r '.choices[0].message' /tmp/gpt5-format.json
echo ""

echo "======================================"
echo "TESTE 4: GPT-5 com output explícito"
echo "======================================"

curl -s https://api.openai.com/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "model": "gpt-5",
    "messages": [
      {
        "role": "system",
        "content": "Output your response after reasoning."
      },
      {
        "role": "user",
        "content": "Write: Hello World"
      }
    ],
    "reasoning_effort": "medium",
    "include_reasoning": true
  }' > /tmp/gpt5-explicit.json 2>&1

echo "Resposta com output explícito:"
jq . /tmp/gpt5-explicit.json
echo ""

echo "======================================"
echo "TESTE 5: Verificar se é problema de streaming"
echo "======================================"

curl -s https://api.openai.com/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "model": "gpt-5",
    "messages": [
      {
        "role": "user",
        "content": "Say exactly: TEST OUTPUT"
      }
    ],
    "stream": false,
    "n": 1
  }' > /tmp/gpt5-stream.json 2>&1

echo "Resposta sem streaming:"
jq -r '.choices[0].message' /tmp/gpt5-stream.json
echo ""

echo "========================================================="
echo "📊 ANÁLISE ULTRATHINK FINAL:"
echo "========================================================="

# Análise
for file in /tmp/gpt5-*.json; do
    if [ -f "$file" ]; then
        content=$(jq -r '.choices[0].message.content // ""' "$file" 2>/dev/null)
        reasoning=$(jq -r '.usage.completion_tokens_details.reasoning_tokens // 0' "$file" 2>/dev/null)
        
        if [ -n "$content" ] && [ "$content" != "" ] && [ "$content" != "null" ]; then
            echo "✅ FUNCIONOU: $(basename $file)"
            echo "   Conteúdo: $(echo $content | head -c 50)..."
            echo "   Reasoning tokens: $reasoning"
            echo ""
            break
        fi
    fi
done

if ! grep -l '"content":' /tmp/gpt5-*.json 2>/dev/null | grep -v '"content":""' | grep -v '"content":null' >/dev/null; then
    echo "❌ PROBLEMA CONFIRMADO: GPT-5 NÃO ESTÁ RETORNANDO CONTEÚDO!"
    echo ""
    echo "🔍 DESCOBERTAS CRÍTICAS:"
    echo "1. GPT-5 está CONSUMINDO tokens (500 reasoning_tokens)"
    echo "2. Mas retorna content VAZIO"
    echo "3. finish_reason = 'length' sugere que está gerando algo"
    echo "4. Possível que GPT-5 use formato diferente de resposta"
    echo ""
    echo "🎯 PRÓXIMO PASSO: Testar com API v2 ou endpoint específico do GPT-5"
fi