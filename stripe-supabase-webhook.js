/**
 * ULTRATHINK: Webhook Stripe → Supabase
 * Sincroniza pagamentos com criação de usuários
 */

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

// Configuração Supabase
const SUPABASE_URL = 'https://xxxuxjmonsoxumcetlgy.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY; // Precisa ser service key, não anon
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

/**
 * Webhook handler para eventos do Stripe
 */
async function handleStripeWebhook(req, res) {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    
    let event;
    
    try {
        // Verificar assinatura do webhook
        event = stripe.webhooks.constructEvent(
            req.body,
            sig,
            webhookSecret
        );
    } catch (err) {
        console.error('Webhook signature verification failed:', err);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }
    
    console.log('🔥 ULTRATHINK: Webhook recebido:', event.type);
    
    // Processar diferentes tipos de eventos
    switch (event.type) {
        case 'checkout.session.completed':
            await handleCheckoutCompleted(event.data.object);
            break;
            
        case 'customer.subscription.created':
            await handleSubscriptionCreated(event.data.object);
            break;
            
        case 'customer.subscription.updated':
            await handleSubscriptionUpdated(event.data.object);
            break;
            
        case 'customer.subscription.deleted':
            await handleSubscriptionDeleted(event.data.object);
            break;
            
        case 'payment_intent.succeeded':
            await handlePaymentSucceeded(event.data.object);
            break;
            
        default:
            console.log(`Evento não processado: ${event.type}`);
    }
    
    res.json({ received: true });
}

/**
 * Processa checkout completo
 */
async function handleCheckoutCompleted(session) {
    console.log('✅ Checkout completo:', session.id);
    
    const customerEmail = session.customer_email || session.customer_details?.email;
    
    if (!customerEmail) {
        console.error('Email do cliente não encontrado');
        return;
    }
    
    // Criar ou atualizar usuário no Supabase
    const { data: user, error: userError } = await supabase.auth.admin.createUser({
        email: customerEmail,
        email_confirm: true,
        user_metadata: {
            stripe_customer_id: session.customer,
            stripe_session_id: session.id,
            plan: 'founder',
            subscription_status: 'trialing'
        }
    });
    
    if (userError && userError.message !== 'User already registered') {
        console.error('Erro ao criar usuário:', userError);
        return;
    }
    
    // Se usuário já existe, atualizar metadata
    if (userError?.message === 'User already registered') {
        const { data: existingUser } = await supabase.auth.admin.getUserByEmail(customerEmail);
        
        if (existingUser) {
            await supabase.auth.admin.updateUserById(existingUser.user.id, {
                user_metadata: {
                    ...existingUser.user.user_metadata,
                    stripe_customer_id: session.customer,
                    stripe_session_id: session.id,
                    plan: 'founder',
                    subscription_status: 'trialing'
                }
            });
        }
    }
    
    console.log('✅ Usuário sincronizado:', customerEmail);
    
    // Enviar email de boas-vindas
    await sendWelcomeEmail(customerEmail);
}

/**
 * Processa criação de assinatura
 */
async function handleSubscriptionCreated(subscription) {
    console.log('✅ Assinatura criada:', subscription.id);
    
    // Obter cliente do Stripe
    const customer = await stripe.customers.retrieve(subscription.customer);
    
    if (!customer.email) {
        console.error('Email do cliente não encontrado');
        return;
    }
    
    // Atualizar usuário no Supabase
    const { data: user } = await supabase.auth.admin.getUserByEmail(customer.email);
    
    if (user) {
        await supabase.auth.admin.updateUserById(user.user.id, {
            user_metadata: {
                ...user.user.user_metadata,
                stripe_subscription_id: subscription.id,
                subscription_status: subscription.status,
                trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null
            }
        });
    }
    
    console.log('✅ Assinatura sincronizada:', customer.email);
}

/**
 * Processa atualização de assinatura
 */
async function handleSubscriptionUpdated(subscription) {
    console.log('✅ Assinatura atualizada:', subscription.id);
    
    const customer = await stripe.customers.retrieve(subscription.customer);
    
    if (!customer.email) return;
    
    const { data: user } = await supabase.auth.admin.getUserByEmail(customer.email);
    
    if (user) {
        await supabase.auth.admin.updateUserById(user.user.id, {
            user_metadata: {
                ...user.user.user_metadata,
                subscription_status: subscription.status,
                subscription_updated_at: new Date().toISOString()
            }
        });
    }
}

/**
 * Processa cancelamento de assinatura
 */
async function handleSubscriptionDeleted(subscription) {
    console.log('❌ Assinatura cancelada:', subscription.id);
    
    const customer = await stripe.customers.retrieve(subscription.customer);
    
    if (!customer.email) return;
    
    const { data: user } = await supabase.auth.admin.getUserByEmail(customer.email);
    
    if (user) {
        await supabase.auth.admin.updateUserById(user.user.id, {
            user_metadata: {
                ...user.user.user_metadata,
                subscription_status: 'canceled',
                subscription_canceled_at: new Date().toISOString()
            }
        });
    }
}

/**
 * Processa pagamento bem-sucedido
 */
async function handlePaymentSucceeded(paymentIntent) {
    console.log('💰 Pagamento recebido:', paymentIntent.id);
    
    // Log do pagamento para analytics
    console.log(`Valor: $${paymentIntent.amount / 100}`);
}

/**
 * Envia email de boas-vindas
 */
async function sendWelcomeEmail(email) {
    console.log('📧 Enviando email de boas-vindas para:', email);
    
    // Aqui você integraria com seu serviço de email
    // Por exemplo: SendGrid, AWS SES, etc.
    
    const emailContent = `
    Bem-vindo ao StripedShield!
    
    Sua conta foi criada com sucesso.
    
    Próximos passos:
    1. Acesse: https://stripedshield-founders-1755231149.netlify.app/auth.html
    2. Faça login com seu email ou Google
    3. Configure sua integração com Stripe
    
    Você tem 7 dias de trial gratuito.
    
    Equipe StripedShield
    `;
    
    // TODO: Implementar envio real de email
    console.log('Email content:', emailContent);
}

// Exportar para uso em Lambda ou Express
module.exports = {
    handleStripeWebhook,
    handleCheckoutCompleted,
    handleSubscriptionCreated,
    handleSubscriptionUpdated,
    handleSubscriptionDeleted,
    handlePaymentSucceeded
};