#!/usr/bin/env python3
"""
ULTRATHINK: Habilitar Google OAuth no Supabase via API
"""

import json
import base64
import urllib.request
import urllib.parse
import urllib.error

print("🔥 ULTRATHINK: Habilitando Google OAuth no Supabase")
print("="*60)

# Configurações do Supabase
SUPABASE_PROJECT_ID = "xxxuxjmonsoxumcetlgy"
SUPABASE_URL = f"https://{SUPABASE_PROJECT_ID}.supabase.co"
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh4eHV4am1vbnNveHVtY2V0bGd5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyODY2MjIsImV4cCI6MjA3MDg2MjYyMn0.EqCMQVTCmNJ300xUIX-WVk0NWvNHzIZRjdu9abUPKcY"

# OAuth Client do Google
GOOGLE_CLIENT_ID = "635910017031-noij09t8m7q9tcmpj2bthub5vkidhuks.apps.googleusercontent.com"

# Decodificar a anon key para obter informações
def decode_jwt(token):
    """Decodifica JWT para obter informações"""
    parts = token.split('.')
    if len(parts) != 3:
        return None
    
    # Decodificar payload (segunda parte)
    payload = parts[1]
    # Adicionar padding se necessário
    padding = 4 - (len(payload) % 4)
    if padding != 4:
        payload += '=' * padding
    
    try:
        decoded = base64.urlsafe_b64decode(payload)
        return json.loads(decoded)
    except:
        return None

jwt_info = decode_jwt(SUPABASE_ANON_KEY)
print(f"✅ Projeto Supabase: {SUPABASE_PROJECT_ID}")
print(f"✅ JWT Info: {jwt_info}")

# Tentar diferentes endpoints do Supabase
def try_supabase_endpoints():
    """Tenta diferentes endpoints do Supabase para configurar Google OAuth"""
    
    endpoints = [
        # Auth Admin API
        {
            "url": f"{SUPABASE_URL}/auth/v1/admin/providers",
            "method": "GET",
            "description": "Listar providers"
        },
        {
            "url": f"{SUPABASE_URL}/auth/v1/settings",
            "method": "GET",
            "description": "Obter configurações de auth"
        },
        {
            "url": f"{SUPABASE_URL}/rest/v1/rpc/get_auth_config",
            "method": "POST",
            "description": "Obter config via RPC"
        }
    ]
    
    for endpoint in endpoints:
        print(f"\nTentando: {endpoint['description']}")
        print(f"URL: {endpoint['url']}")
        
        req = urllib.request.Request(endpoint['url'])
        req.add_header('apikey', SUPABASE_ANON_KEY)
        req.add_header('Authorization', f'Bearer {SUPABASE_ANON_KEY}')
        req.add_header('Content-Type', 'application/json')
        
        if endpoint['method'] == 'POST':
            req.data = b'{}'
        
        try:
            response = urllib.request.urlopen(req)
            data = response.read().decode()
            print(f"✅ Resposta: {data[:200]}")
            
            # Se conseguiu dados, tentar analisar
            try:
                json_data = json.loads(data)
                print(f"   Dados: {json.dumps(json_data, indent=2)[:300]}")
            except:
                pass
                
        except urllib.error.HTTPError as e:
            print(f"❌ HTTP {e.code}: {e.reason}")
            try:
                error_data = e.read().decode()
                print(f"   Erro: {error_data[:200]}")
            except:
                pass
        except Exception as e:
            print(f"❌ Erro: {str(e)[:100]}")

# Criar configuração local do Supabase
def create_supabase_config():
    """Cria arquivo de configuração do Supabase"""
    
    config = {
        "project_id": SUPABASE_PROJECT_ID,
        "api": {
            "url": SUPABASE_URL,
            "anon_key": SUPABASE_ANON_KEY
        },
        "auth": {
            "external": {
                "google": {
                    "enabled": True,
                    "client_id": GOOGLE_CLIENT_ID,
                    "secret": "GOCSPX-GENERATED_SECRET_FOR_TESTING",
                    "redirect_uri": f"{SUPABASE_URL}/auth/v1/callback"
                }
            }
        }
    }
    
    # Criar diretório supabase se não existir
    import os
    os.makedirs('supabase', exist_ok=True)
    
    # Salvar config.toml
    with open('supabase/config.toml', 'w') as f:
        f.write(f"""
[api]
enabled = true
port = 54321
schemas = ["public", "storage", "graphql_public"]

[auth]
enabled = true
site_url = "https://stripedshield-founders-1755231149.netlify.app"
additional_redirect_urls = ["https://stripedshield-founders-1755231149.netlify.app/**"]

[auth.external.google]
enabled = true
client_id = "{GOOGLE_CLIENT_ID}"
secret = "GOCSPX-GENERATED_SECRET_FOR_TESTING"
redirect_uri = "{SUPABASE_URL}/auth/v1/callback"
""")
    
    print("\n✅ Arquivo supabase/config.toml criado")
    
    # Salvar config.json também
    with open('supabase/config.json', 'w') as f:
        json.dump(config, f, indent=2)
    
    print("✅ Arquivo supabase/config.json criado")
    
    return config

# Tentar usar Supabase CLI para aplicar config
def apply_config_via_cli():
    """Tenta aplicar configuração via Supabase CLI"""
    
    import subprocess
    
    commands = [
        ["supabase", "projects", "list"],
        ["supabase", "link", "--project-ref", SUPABASE_PROJECT_ID],
        ["supabase", "db", "remote", "set", SUPABASE_URL]
    ]
    
    for cmd in commands:
        print(f"\nExecutando: {' '.join(cmd)}")
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=5)
            if result.returncode == 0:
                print(f"✅ Sucesso: {result.stdout[:200]}")
            else:
                print(f"❌ Erro: {result.stderr[:200]}")
        except Exception as e:
            print(f"❌ Exceção: {str(e)[:100]}")

# Criar script de configuração manual
def create_manual_config_script():
    """Cria script com instruções para configuração manual"""
    
    script = f"""#!/bin/bash

echo "🔥 ULTRATHINK: Script de Configuração Google OAuth"
echo "=================================================="

# Dados para configurar
GOOGLE_CLIENT_ID="{GOOGLE_CLIENT_ID}"
GOOGLE_CLIENT_SECRET="COLE_AQUI_O_CLIENT_SECRET"

echo "OPÇÃO 1: Via Dashboard Supabase"
echo "--------------------------------"
echo "1. Acesse: https://supabase.com/dashboard/project/{SUPABASE_PROJECT_ID}/auth/providers"
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

curl -X PATCH \\
  "https://api.supabase.com/v1/projects/{SUPABASE_PROJECT_ID}/config/auth" \\
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{{
    "external_google_enabled": true,
    "external_google_client_id": "{GOOGLE_CLIENT_ID}",
    "external_google_secret": "SEU_CLIENT_SECRET"
  }}'
EOF

echo ""
echo "STATUS ATUAL:"
echo "- Google Button: ✅ ATIVO em https://stripedshield-founders-1755231149.netlify.app/auth.html"
echo "- OAuth Client ID: ✅ {GOOGLE_CLIENT_ID}"
echo "- Supabase Project: ✅ {SUPABASE_PROJECT_ID}"
echo "- Faltando: Client Secret do Google Console"
"""
    
    with open('configure-google-oauth-manual.sh', 'w') as f:
        f.write(script)
    
    import os
    os.chmod('configure-google-oauth-manual.sh', 0o755)
    
    print("\n✅ Script configure-google-oauth-manual.sh criado")

# Executar todas as tentativas
print("\n1. Tentando endpoints do Supabase...")
try_supabase_endpoints()

print("\n2. Criando configuração local...")
config = create_supabase_config()

print("\n3. Tentando aplicar via CLI...")
apply_config_via_cli()

print("\n4. Criando script de configuração manual...")
create_manual_config_script()

print("\n" + "="*60)
print("RESUMO:")
print("="*60)
print(f"""
✅ Configurações criadas:
   - supabase/config.toml
   - supabase/config.json
   - configure-google-oauth-manual.sh

✅ Google OAuth Client:
   ID: {GOOGLE_CLIENT_ID}

✅ Supabase Project:
   ID: {SUPABASE_PROJECT_ID}
   URL: {SUPABASE_URL}

⚠️  Para funcionar completamente:
   1. Obtenha o Client Secret do Google Console
   2. Configure no Supabase Dashboard
   
   OU use o script configure-google-oauth-manual.sh
""")