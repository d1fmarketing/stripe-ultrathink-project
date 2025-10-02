#!/bin/bash

echo "🔥 ULTRATHINK: Script de Configuração Google OAuth"
echo "=================================================="

# Dados para configurar
GOOGLE_CLIENT_ID="635910017031-noij09t8m7q9tcmpj2bthub5vkidhuks.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="COLE_AQUI_O_CLIENT_SECRET"

echo "OPÇÃO 1: Via Dashboard Supabase"
echo "--------------------------------"
echo "1. Acesse: https://supabase.com/dashboard/project/xxxuxjmonsoxumcetlgy/auth/providers"
echo "2. Encontre 'Google'"
echo "3. Habilite o toggle"
echo "4. Cole:"
echo "   Client ID: $GOOGLE_CLIENT_ID"
echo "   Client Secret: $GOOGLE_CLIENT_SECRET"
echo "5. Salve"

echo ""
echo "OPÇÃO 2: Via cURL (se tiver service_role key)"
echo "---------------------------------------------"
cat << 'EOF'
SUPABASE_SERVICE_KEY="sua_service_role_key_aqui"

curl -X PATCH \
  "https://api.supabase.com/v1/projects/xxxuxjmonsoxumcetlgy/config/auth" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "external_google_enabled": true,
    "external_google_client_id": "635910017031-noij09t8m7q9tcmpj2bthub5vkidhuks.apps.googleusercontent.com",
    "external_google_secret": "SEU_CLIENT_SECRET"
  }'
EOF

echo ""
echo "STATUS ATUAL:"
echo "- Google Button: ✅ ATIVO em https://stripedshield-founders-1755231149.netlify.app/auth.html"
echo "- OAuth Client ID: ✅ 635910017031-noij09t8m7q9tcmpj2bthub5vkidhuks.apps.googleusercontent.com"
echo "- Supabase Project: ✅ xxxuxjmonsoxumcetlgy"
echo "- Faltando: Client Secret do Google Console"
