// Simple Stripe Connect without OAuth - works immediately!
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

export async function GET(req: NextRequest) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2025-07-30.basil'
  })

  try {
    // Create a Connect account
    const account = await stripe.accounts.create({
      type: 'standard',
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true }
      }
    })

    // Create account link for onboarding
    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: `${process.env.NEXTAUTH_URL}/demo?connect=retry`,
      return_url: `${process.env.NEXTAUTH_URL}/demo?connected=true&account=${account.id}`,
      type: 'account_onboarding'
    })

    // Store account ID in cookie and redirect to Stripe onboarding
    const res = NextResponse.redirect(accountLink.url)
    res.cookies.set('ss_acct', account.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30
    })

    return res
  } catch (error) {
    console.error('Connect error:', error)
    return NextResponse.redirect(new URL('/demo?error=connect_failed', req.url))
  }
}

export async function POST(req: NextRequest) {
  // Handle webhook from Stripe when account is fully onboarded
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')!
  
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2025-07-30.basil'
  })

  try {
    const event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    )

    if (event.type === 'account.updated') {
      const account = event.data.object as Stripe.Account
      console.log('Account updated:', account.id, 'Charges enabled:', account.charges_enabled)
    }

    return NextResponse.json({ received: true })
  } catch (err) {
    console.error('Webhook error:', err)
    return NextResponse.json({ error: 'Webhook error' }, { status: 400 })
  }
}