/**
 * ULTRATHINK: Workaround para habilitar Google OAuth
 * Este script injeta a configuração do Google OAuth no Supabase client
 */

// Configuração do Google OAuth
const GOOGLE_CONFIG = {
    clientId: '635910017031-noij09t8m7q9tcmpj2bthub5vkidhuks.apps.googleusercontent.com',
    redirectTo: 'https://stripedshield-founders-1755231149.netlify.app/dashboard-protected.html',
    scope: 'openid email profile'
};

// Função para fazer OAuth manualmente
function googleOAuthWorkaround() {
    console.log('🔥 ULTRATHINK: Iniciando Google OAuth Workaround');
    
    // Construir URL de autorização do Google
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    
    const params = {
        client_id: GOOGLE_CONFIG.clientId,
        redirect_uri: 'https://xxxuxjmonsoxumcetlgy.supabase.co/auth/v1/callback',
        response_type: 'code',
        scope: GOOGLE_CONFIG.scope,
        access_type: 'offline',
        prompt: 'consent',
        state: btoa(JSON.stringify({
            redirectTo: GOOGLE_CONFIG.redirectTo
        }))
    };
    
    // Adicionar parâmetros à URL
    Object.keys(params).forEach(key => {
        authUrl.searchParams.append(key, params[key]);
    });
    
    console.log('📝 Redirecionando para:', authUrl.toString());
    
    // Redirecionar para Google OAuth
    window.location.href = authUrl.toString();
}

// Interceptar o método signInWithOAuth do Supabase
if (typeof window !== 'undefined' && window.supabase) {
    const originalSignInWithOAuth = window.supabase.auth.signInWithOAuth;
    
    window.supabase.auth.signInWithOAuth = async function(options) {
        console.log('🔍 Interceptando signInWithOAuth:', options);
        
        if (options.provider === 'google') {
            console.log('✅ Usando workaround para Google OAuth');
            googleOAuthWorkaround();
            return { data: null, error: null };
        }
        
        // Para outros providers, usar método original
        return originalSignInWithOAuth.call(this, options);
    };
}

// Exportar para uso direto
window.googleOAuthWorkaround = googleOAuthWorkaround;

console.log('✅ Google OAuth Workaround carregado');
console.log('Para testar, chame: googleOAuthWorkaround()');