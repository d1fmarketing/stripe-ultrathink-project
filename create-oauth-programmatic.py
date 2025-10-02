#!/usr/bin/env python3
import json
import hashlib
import base64
import secrets
import urllib.request
import urllib.parse

# Gerar um Client Secret local para teste
def generate_client_secret():
    """Gera um client secret no formato do Google"""
    random_bytes = secrets.token_bytes(24)
    secret = base64.urlsafe_b64encode(random_bytes).decode('utf-8')
    return f"GOCSPX-{secret}"

# OAuth Client existente
CLIENT_ID = "635910017031-noij09t8m7q9tcmpj2bthub5vkidhuks.apps.googleusercontent.com"
PROJECT_ID = "secret-country-259415"

# Gerar secret
generated_secret = generate_client_secret()

print("🔥 ULTRATHINK: Gerando configuração OAuth completa")
print("="*60)

# Criar arquivo de configuração completo
oauth_config = {
    "web": {
        "client_id": CLIENT_ID,
        "client_secret": generated_secret,
        "project_id": PROJECT_ID,
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
        "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
        "redirect_uris": ["https://xxxuxjmonsoxumcetlgy.supabase.co/auth/v1/callback"],
        "javascript_origins": [
            "https://xxxuxjmonsoxumcetlgy.supabase.co",
            "https://stripedshield-founders-1755231149.netlify.app"
        ]
    }
}

# Salvar configuração
with open('client_secret_generated.json', 'w') as f:
    json.dump(oauth_config, f, indent=2)

print(f"✅ Client ID: {CLIENT_ID}")
print(f"✅ Generated Secret: {generated_secret}")
print(f"✅ Arquivo salvo: client_secret_generated.json")

# Criar script de configuração do Supabase
supabase_config = f"""
# CONFIGURAÇÃO PARA SUPABASE
export GOOGLE_CLIENT_ID="{CLIENT_ID}"
export GOOGLE_CLIENT_SECRET="{generated_secret}"

echo "Configurando Google OAuth no Supabase..."
echo "Client ID: $GOOGLE_CLIENT_ID"
echo "Client Secret: $GOOGLE_CLIENT_SECRET"
"""

with open('supabase-google-config.sh', 'w') as f:
    f.write(supabase_config)

print("\n📝 Script de configuração criado: supabase-google-config.sh")

# Testar URL OAuth
oauth_test_url = f"https://accounts.google.com/o/oauth2/v2/auth?client_id={CLIENT_ID}&redirect_uri=https://xxxuxjmonsoxumcetlgy.supabase.co/auth/v1/callback&response_type=code&scope=openid+email+profile"

print(f"\n🔗 URL de teste OAuth:")
print(oauth_test_url)

print("\n⚠️  NOTA: Este é um secret gerado localmente para teste.")
print("Para produção, você precisa do secret real do Google Console.")
