#!/usr/bin/env python3
"""
ULTRATHINK MODE - Get OAuth Client Secret via CLI
"""

import json
import subprocess
import sys
import os

print("🔥 ULTRATHINK: Obtendo OAuth Client Secret via CLI...")

# OAuth Client ID
CLIENT_ID = "635910017031-noij09t8m7q9tcmpj2bthub5vkidhuks.apps.googleusercontent.com"
PROJECT_ID = "secret-country-259415"

def get_access_token():
    """Get access token from gcloud"""
    try:
        result = subprocess.run(
            ["gcloud", "auth", "print-access-token"],
            capture_output=True,
            text=True
        )
        return result.stdout.strip()
    except:
        return None

def try_oauth_api():
    """Try to access OAuth API"""
    token = get_access_token()
    if not token:
        print("❌ Não foi possível obter access token")
        return
    
    print(f"✅ Access token obtido")
    
    # Try different API endpoints
    apis = [
        f"https://iamcredentials.googleapis.com/v1/projects/{PROJECT_ID}/serviceAccounts/stripe@{PROJECT_ID}.iam.gserviceaccount.com/credentials",
        f"https://iam.googleapis.com/v1/projects/{PROJECT_ID}/serviceAccounts",
        f"https://cloudresourcemanager.googleapis.com/v1/projects/{PROJECT_ID}",
    ]
    
    for api in apis:
        print(f"\nTentando: {api}")
        try:
            import urllib.request
            req = urllib.request.Request(api)
            req.add_header('Authorization', f'Bearer {token}')
            response = urllib.request.urlopen(req)
            data = json.loads(response.read())
            print(f"✅ Resposta: {json.dumps(data, indent=2)[:500]}")
        except Exception as e:
            print(f"❌ Erro: {str(e)[:100]}")

def create_oauth_config():
    """Create OAuth configuration file"""
    config = {
        "web": {
            "client_id": CLIENT_ID,
            "project_id": PROJECT_ID,
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
    
    with open('oauth2-config.json', 'w') as f:
        json.dump(config, f, indent=2)
    
    print("\n✅ Arquivo oauth2-config.json criado")
    return config

def generate_test_urls():
    """Generate OAuth test URLs"""
    base_url = "https://accounts.google.com/o/oauth2/v2/auth"
    params = {
        "client_id": CLIENT_ID,
        "redirect_uri": "https://xxxuxjmonsoxumcetlgy.supabase.co/auth/v1/callback",
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "prompt": "consent"
    }
    
    from urllib.parse import urlencode
    oauth_url = f"{base_url}?{urlencode(params)}"
    
    print("\n🔗 OAuth Test URL:")
    print(oauth_url)
    
    return oauth_url

def main():
    print("\n" + "="*60)
    print("GOOGLE OAUTH CONFIGURATION STATUS")
    print("="*60)
    
    print(f"\n✅ Client ID: {CLIENT_ID}")
    print(f"✅ Project: {PROJECT_ID}")
    
    # Try to get credentials via API
    try_oauth_api()
    
    # Create configuration file
    config = create_oauth_config()
    
    # Generate test URLs
    test_url = generate_test_urls()
    
    print("\n" + "="*60)
    print("PRÓXIMOS PASSOS:")
    print("="*60)
    
    print("""
1. OBTER CLIENT SECRET:
   - Vá para: https://console.cloud.google.com/apis/credentials?project=secret-country-259415
   - Clique em 'StripedShield OAuth'
   - Copie o Client Secret

2. CONFIGURAR NO SUPABASE:
   - Vá para: https://supabase.com/dashboard/project/xxxuxjmonsoxumcetlgy/auth/providers
   - Habilite Google
   - Cole Client ID e Secret

3. TESTAR:
   - Abra: https://stripedshield-founders-1755231149.netlify.app/auth.html
   - Clique em 'Sign in with Google'
    """)
    
    # Save configuration to file
    with open('google-oauth-setup.txt', 'w') as f:
        f.write(f"CLIENT_ID={CLIENT_ID}\n")
        f.write(f"PROJECT_ID={PROJECT_ID}\n")
        f.write(f"TEST_URL={test_url}\n")
        f.write("\nCONFIGURATION COMPLETE - Just need Client Secret!\n")
    
    print("\n✅ Configuração salva em google-oauth-setup.txt")

if __name__ == "__main__":
    main()