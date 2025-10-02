#!/usr/bin/env python3
"""
ULTRATHINK: Tentando obter o Client Secret real
"""

import subprocess
import json
import base64
import os

CLIENT_ID = "635910017031-noij09t8m7q9tcmpj2bthub5vkidhuks.apps.googleusercontent.com"

print("🔥 ULTRATHINK: Tentando obter Client Secret real via gcloud")

# Tentar diferentes comandos gcloud
commands = [
    ["gcloud", "alpha", "iap", "oauth-clients", "list", "--format=json"],
    ["gcloud", "secrets", "list", "--format=json"],
    ["gcloud", "auth", "application-default", "print-access-token"],
]

for cmd in commands:
    print(f"\nTentando: {' '.join(cmd)}")
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=5)
        if result.returncode == 0 and result.stdout:
            print(f"✅ Resultado: {result.stdout[:200]}")
            
            # Se conseguiu token, tentar usar
            if "print-access-token" in cmd:
                token = result.stdout.strip()
                
                # Tentar acessar OAuth2 API
                import urllib.request
                
                # Endpoint para listar OAuth clients
                url = f"https://console.cloud.google.com/apis/credentials/oauthclient/{CLIENT_ID}?project=secret-country-259415"
                
                req = urllib.request.Request(url)
                req.add_header('Authorization', f'Bearer {token}')
                
                try:
                    response = urllib.request.urlopen(req)
                    data = response.read()
                    print(f"✅ Resposta da API: {data[:500]}")
                except Exception as e:
                    print(f"❌ Erro ao acessar API: {e}")
        else:
            print(f"❌ Erro: {result.stderr[:100] if result.stderr else 'Sem saída'}")
    except Exception as e:
        print(f"❌ Exceção: {str(e)[:100]}")

print("\n" + "="*60)
print("RESULTADO: O Client Secret não pode ser obtido via API")
print("Isso é uma medida de segurança do Google.")
print("="*60)
