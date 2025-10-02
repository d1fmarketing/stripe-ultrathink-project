
#!/bin/bash

echo "🧪 Testando Google OAuth..."

# URL de autorização OAuth
AUTH_URL="https://accounts.google.com/o/oauth2/v2/auth"
AUTH_URL="${AUTH_URL}?client_id=635910017031-noij09t8m7q9tcmpj2bthub5vkidhuks.apps.googleusercontent.com"
AUTH_URL="${AUTH_URL}&redirect_uri=https://xxxuxjmonsoxumcetlgy.supabase.co/auth/v1/callback"
AUTH_URL="${AUTH_URL}&response_type=code"
AUTH_URL="${AUTH_URL}&scope=openid%20email%20profile"
AUTH_URL="${AUTH_URL}&access_type=offline"
AUTH_URL="${AUTH_URL}&prompt=consent"

echo "📝 URL de teste OAuth:"
echo "$AUTH_URL"

echo ""
echo "Para testar:"
echo "1. Abra a URL acima no navegador"
echo "2. Faça login com Google"
echo "3. Será redirecionado para Supabase"
echo "4. Se configurado corretamente, verá sucesso"

# Testar se o botão Google está ativo
echo ""
echo "🔍 Verificando se botão Google está ativo no site..."
curl -s https://stripedshield-founders-1755231149.netlify.app/auth.html | grep -c "Sign in with Google" | \
  awk '{if($1>0) print "✅ Botão Google está ATIVO no site!"; else print "❌ Botão Google não encontrado"}'
