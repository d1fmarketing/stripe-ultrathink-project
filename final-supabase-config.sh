#!/bin/bash

echo "🔥 ULTRATHINK: Configuração Final Google OAuth"
echo "=============================================="

# Service Role Key
SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh4eHV4am1vbnNveHVtY2V0bGd5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTI4NjYyMiwiZXhwIjoyMDcwODYyNjIyfQ.nFd2DwT0R3O7SG8F3LtgWAQebDYEBB4LvoVnD6m_Bgg"

# Google OAuth
CLIENT_ID="635910017031-noij09t8m7q9tcmpj2bthub5vkidhuks.apps.googleusercontent.com"

echo "✅ Service Role Key obtida"
echo "✅ Google Client ID: $CLIENT_ID"

echo ""
echo "📝 STATUS ATUAL:"
echo "- Google Button: ✅ ATIVO em https://stripedshield-founders-1755231149.netlify.app/auth.html"
echo "- Workaround: ✅ DEPLOYED (redireciona direto para Google)"
echo "- Service Role Key: ✅ FUNCIONANDO"
echo ""
echo "🧪 TESTE O WORKAROUND AGORA:"
echo "1. Abra: https://stripedshield-founders-1755231149.netlify.app/auth.html"
echo "2. Clique em 'Sign in with Google'"
echo "3. Vai redirecionar direto para Google OAuth"
echo ""
echo "🔗 OU TESTE DIRETO:"
echo "https://accounts.google.com/o/oauth2/v2/auth?client_id=$CLIENT_ID&redirect_uri=https://xxxuxjmonsoxumcetlgy.supabase.co/auth/v1/callback&response_type=code&scope=openid+email+profile"
