#!/bin/bash

# ULTRATHINK MODE - CONFIGURE GOOGLE OAUTH VIA CLI

echo "🔥 ULTRATHINK: Configurando Google OAuth via CLI..."

# OAuth Client Details
CLIENT_ID="635910017031-noij09t8m7q9tcmpj2bthub5vkidhuks.apps.googleusercontent.com"
PROJECT_ID="secret-country-259415"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}✅ OAuth Client ID: ${CLIENT_ID}${NC}"

# Step 1: Try to get OAuth client details via API
echo -e "\n${YELLOW}Step 1: Tentando obter Client Secret via API...${NC}"

# Using OAuth 2.0 API endpoint
ACCESS_TOKEN=$(gcloud auth print-access-token 2>/dev/null)

if [ ! -z "$ACCESS_TOKEN" ]; then
    # Try to list OAuth clients
    echo "Tentando listar OAuth clients..."
    curl -s -H "Authorization: Bearer $ACCESS_TOKEN" \
        "https://console.cloud.google.com/apis/credentials/oauthclient/${CLIENT_ID}?project=${PROJECT_ID}" \
        2>/dev/null || echo "API direta não disponível"
fi

# Step 2: Configure Supabase via API
echo -e "\n${YELLOW}Step 2: Instruções para configurar Supabase via API...${NC}"

cat << 'EOF'

# OPÇÃO 1: Via Supabase Management API (se você tiver API key)
SUPABASE_PROJECT_ID="xxxuxjmonsoxumcetlgy"
SUPABASE_API_KEY="[YOUR_SUPABASE_SERVICE_KEY]"

# Configure Google provider
curl -X PATCH \
  "https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_ID}/auth/providers/google" \
  -H "Authorization: Bearer ${SUPABASE_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "client_id": "635910017031-noij09t8m7q9tcmpj2bthub5vkidhuks.apps.googleusercontent.com",
    "client_secret": "[YOUR_CLIENT_SECRET]"
  }'

EOF

# Step 3: Alternative - Use gcloud to create new OAuth client
echo -e "\n${YELLOW}Step 3: Alternativa - Criar novo OAuth client via gcloud...${NC}"

cat << 'EOF'

# Create OAuth consent screen first (if needed)
gcloud alpha iap oauth-brands create \
    --application_title="StripedShield" \
    --support_email="stripe@secret-country-259415.iam.gserviceaccount.com" \
    --project=secret-country-259415

# Create OAuth 2.0 client
gcloud alpha iap oauth-clients create \
    --display_name="StripedShield OAuth CLI" \
    --project=secret-country-259415

EOF

# Step 4: Direct API call to create OAuth client
echo -e "\n${YELLOW}Step 4: Criar OAuth client via REST API...${NC}"

cat << 'EOF'
# Create oauth2-client.json
cat > oauth2-client.json << 'JSON'
{
  "web": {
    "client_id": "635910017031-noij09t8m7q9tcmpj2bthub5vkidhuks.apps.googleusercontent.com",
    "project_id": "secret-country-259415",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
    "javascript_origins": [
      "https://xxxuxjmonsoxumcetlgy.supabase.co",
      "https://stripedshield-founders-1755231149.netlify.app"
    ],
    "redirect_uris": [
      "https://xxxuxjmonsoxumcetlgy.supabase.co/auth/v1/callback"
    ]
  }
}
JSON

EOF

# Step 5: Test OAuth flow programmatically
echo -e "\n${YELLOW}Step 5: Testar fluxo OAuth...${NC}"

cat << 'EOF'
# Test OAuth URL
OAUTH_URL="https://accounts.google.com/o/oauth2/v2/auth"
OAUTH_URL="${OAUTH_URL}?client_id=635910017031-noij09t8m7q9tcmpj2bthub5vkidhuks.apps.googleusercontent.com"
OAUTH_URL="${OAUTH_URL}&redirect_uri=https://xxxuxjmonsoxumcetlgy.supabase.co/auth/v1/callback"
OAUTH_URL="${OAUTH_URL}&response_type=code"
OAUTH_URL="${OAUTH_URL}&scope=openid%20email%20profile"
OAUTH_URL="${OAUTH_URL}&access_type=offline"
OAUTH_URL="${OAUTH_URL}&prompt=consent"

echo "OAuth Test URL:"
echo $OAUTH_URL
EOF

echo -e "\n${GREEN}✅ Script de configuração criado!${NC}"
echo -e "${YELLOW}⚠️  AÇÃO NECESSÁRIA:${NC}"
echo "1. Obtenha o Client Secret do Google Console"
echo "2. Configure no Supabase Dashboard"
echo ""
echo -e "${GREEN}URLs importantes:${NC}"
echo "Google Console: https://console.cloud.google.com/apis/credentials?project=secret-country-259415"
echo "Supabase Auth: https://supabase.com/dashboard/project/xxxuxjmonsoxumcetlgy/auth/providers"