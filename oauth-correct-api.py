#!/usr/bin/env python3
"""
ULTRATHINK: Usando as APIs corretas do Google OAuth 2.0
"""

import subprocess
import json
import urllib.request
import urllib.parse
import base64

print("🔥 ULTRATHINK: Usando APIs corretas do Google OAuth")
print("="*60)

# Client ID existente
CLIENT_ID = "635910017031-noij09t8m7q9tcmpj2bthub5vkidhuks.apps.googleusercontent.com"
PROJECT_ID = "secret-country-259415"
PROJECT_NUMBER = "635910017031"

# Obter access token
def get_access_token():
    result = subprocess.run(
        ["gcloud", "auth", "print-access-token"],
        capture_output=True,
        text=True
    )
    return result.stdout.strip()

token = get_access_token()
print(f"✅ Access token obtido")

# Usar OAuth2 API v2
def get_oauth_brand():
    """Get OAuth consent screen (brand)"""
    url = f"https://iap.googleapis.com/v1/projects/{PROJECT_NUMBER}/brands"
    
    print(f"\nBuscando OAuth Brand...")
    req = urllib.request.Request(url)
    req.add_header('Authorization', f'Bearer {token}')
    
    try:
        response = urllib.request.urlopen(req)
        data = json.loads(response.read())
        print(f"✅ Brand encontrado: {json.dumps(data, indent=2)[:300]}")
        return data
    except Exception as e:
        print(f"❌ Erro: {e}")
        return None

# Tentar usar Identity Platform API
def use_identity_platform():
    """Use Identity Platform API"""
    url = f"https://identitytoolkit.googleapis.com/v1/projects/{PROJECT_ID}/config"
    
    print(f"\nTentando Identity Platform API...")
    req = urllib.request.Request(url)
    req.add_header('Authorization', f'Bearer {token}')
    
    try:
        response = urllib.request.urlopen(req)
        data = json.loads(response.read())
        print(f"✅ Config obtida: {json.dumps(data, indent=2)[:300]}")
        return data
    except Exception as e:
        print(f"❌ Erro: {e}")
        return None

# Tentar criar OAuth2 client via REST API
def create_oauth2_client():
    """Create OAuth 2.0 client using correct API"""
    
    # Esta é a estrutura correta para OAuth 2.0 clients no Google Cloud Console
    oauth_client = {
        "installed": {
            "client_id": CLIENT_ID,
            "project_id": PROJECT_ID,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
            "redirect_uris": ["urn:ietf:wg:oauth:2.0:oob", "http://localhost"]
        }
    }
    
    print(f"\nCriando arquivo de credenciais OAuth 2.0...")
    
    with open('credentials.json', 'w') as f:
        json.dump(oauth_client, f, indent=2)
    
    print(f"✅ Arquivo credentials.json criado")
    
    # Agora criar para web application
    web_client = {
        "web": {
            "client_id": CLIENT_ID,
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
    
    with open('web_client_secret.json', 'w') as f:
        json.dump(web_client, f, indent=2)
    
    print(f"✅ Arquivo web_client_secret.json criado")
    
    return web_client

# Executar todas as tentativas
print("\n1. Buscando OAuth Brand...")
brand = get_oauth_brand()

print("\n2. Tentando Identity Platform...")
identity = use_identity_platform()

print("\n3. Criando arquivos de credenciais...")
client = create_oauth2_client()

print("\n" + "="*60)
print("ARQUIVOS CRIADOS:")
print("- credentials.json (aplicação instalada)")
print("- web_client_secret.json (aplicação web)")
print("\nEstes arquivos contêm a configuração OAuth necessária.")
print("O Client Secret ainda precisa ser obtido do Console.")
