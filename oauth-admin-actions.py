#!/usr/bin/env python3
"""
ULTRATHINK: Usando permissões de OAuth Client Admin para obter/criar credenciais
"""

import subprocess
import json
import urllib.request
import urllib.parse

print("🔥 ULTRATHINK: Tenho permissões de OAuth Client Admin!")
print("Vou usar essas permissões para gerenciar OAuth clients")
print("="*60)

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

# Tentar listar OAuth clients via IAM API
def list_oauth_clients():
    """Lista OAuth clients usando IAM API"""
    
    urls = [
        "https://iam.googleapis.com/v1/projects/secret-country-259415/oauthClients",
        "https://iam.googleapis.com/v2/projects/secret-country-259415/oauthClients",
        "https://iamcredentials.googleapis.com/v1/projects/secret-country-259415/oauthClients"
    ]
    
    for url in urls:
        print(f"\nTentando: {url}")
        req = urllib.request.Request(url)
        req.add_header('Authorization', f'Bearer {token}')
        req.add_header('Content-Type', 'application/json')
        
        try:
            response = urllib.request.urlopen(req)
            data = json.loads(response.read())
            print(f"✅ Sucesso! Resposta: {json.dumps(data, indent=2)[:500]}")
            return data
        except urllib.error.HTTPError as e:
            print(f"❌ HTTP {e.code}: {e.reason}")
            try:
                error_data = e.read().decode()
                print(f"   Detalhes: {error_data[:200]}")
            except:
                pass
        except Exception as e:
            print(f"❌ Erro: {str(e)[:100]}")
    
    return None

# Tentar criar novo OAuth client
def create_oauth_client():
    """Cria um novo OAuth client usando IAM API"""
    
    client_data = {
        "displayName": "StripedShield OAuth CLI Created",
        "redirectUris": [
            "https://xxxuxjmonsoxumcetlgy.supabase.co/auth/v1/callback"
        ]
    }
    
    url = "https://iam.googleapis.com/v1/projects/secret-country-259415/oauthClients"
    
    print(f"\nCriando novo OAuth client...")
    print(f"URL: {url}")
    print(f"Dados: {json.dumps(client_data, indent=2)}")
    
    data_bytes = json.dumps(client_data).encode('utf-8')
    
    req = urllib.request.Request(url, data=data_bytes, method='POST')
    req.add_header('Authorization', f'Bearer {token}')
    req.add_header('Content-Type', 'application/json')
    
    try:
        response = urllib.request.urlopen(req)
        result = json.loads(response.read())
        print(f"✅ OAuth Client criado!")
        print(f"Resposta: {json.dumps(result, indent=2)}")
        return result
    except urllib.error.HTTPError as e:
        print(f"❌ HTTP {e.code}: {e.reason}")
        try:
            error_data = e.read().decode()
            print(f"   Detalhes: {error_data}")
        except:
            pass
    except Exception as e:
        print(f"❌ Erro: {str(e)}")
    
    return None

# Executar ações
print("\n1. Listando OAuth clients existentes...")
clients = list_oauth_clients()

print("\n2. Tentando criar novo OAuth client...")
new_client = create_oauth_client()

print("\n" + "="*60)
print("RESUMO:")
print("- Service account tem permissões de OAuth Client Admin ✅")
print("- Pode criar, listar, atualizar OAuth clients")
print("- Tentando usar essas permissões via API")
