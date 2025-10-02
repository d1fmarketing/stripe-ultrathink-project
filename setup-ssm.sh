#!/bin/bash

echo "🔐 Configurando SSM Parameters para StripedShield..."

# Ler chaves do .env
OPENAI_KEY=$(grep OPENAI_API_KEY .env | cut -d'=' -f2)
STRIPE_KEY=$(grep STRIPE_SECRET .env | cut -d'=' -f2)

# 1. OpenAI API Key
aws ssm put-parameter \
  --name "/stripedshield/OPENAI_API_KEY" \
  --value "$OPENAI_KEY" \
  --type SecureString \
  --overwrite \
  --output json > /dev/null 2>&1

if [ $? -eq 0 ]; then
  echo "✅ OpenAI API Key configurada"
else
  echo "❌ Erro ao configurar OpenAI API Key"
fi

# 2. Stripe Secret
aws ssm put-parameter \
  --name "/stripedshield/STRIPE_SECRET" \
  --value "$STRIPE_KEY" \
  --type SecureString \
  --overwrite \
  --output json > /dev/null 2>&1

if [ $? -eq 0 ]; then
  echo "✅ Stripe Secret configurada"
else
  echo "❌ Erro ao configurar Stripe Secret"
fi

# 3. Environment
aws ssm put-parameter \
  --name "/stripedshield/ENV" \
  --value "prod" \
  --type String \
  --overwrite \
  --output json > /dev/null 2>&1

if [ $? -eq 0 ]; then
  echo "✅ Environment configurado como 'prod'"
else
  echo "❌ Erro ao configurar Environment"
fi

# 4. Redis URL (opcional)
aws ssm put-parameter \
  --name "/stripedshield/REDIS_URL" \
  --value "redis://localhost:6379" \
  --type String \
  --overwrite \
  --output json > /dev/null 2>&1

if [ $? -eq 0 ]; then
  echo "✅ Redis URL configurada"
else
  echo "❌ Erro ao configurar Redis URL"
fi

# Verificar parâmetros criados
echo ""
echo "📋 Parâmetros configurados:"
aws ssm get-parameters \
  --names "/stripedshield/OPENAI_API_KEY" \
          "/stripedshield/STRIPE_SECRET" \
          "/stripedshield/ENV" \
          "/stripedshield/REDIS_URL" \
  --query "Parameters[].Name" \
  --output json | jq -r '.[]'

echo ""
echo "✅ SSM Setup completo!"