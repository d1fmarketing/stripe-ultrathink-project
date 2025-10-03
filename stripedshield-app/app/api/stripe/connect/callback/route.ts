import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  
  if (!code) {
    return NextResponse.redirect(new URL('/demo?error=missing_code', req.url))
  }
  
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2025-07-30.basil',
      maxNetworkRetries: 3
    })
    
    const response = await stripe.oauth.token({
      grant_type: 'authorization_code',
      code,
    })
    
    const acct = response.stripe_user_id
    
    // Create redirect response with cookie
    const res = NextResponse.redirect(new URL('/demo?connected=1', req.url))
    
    // Set HttpOnly cookie with the Stripe account ID
    res.cookies.set('ss_acct', acct!, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 30 // 30 days
    })
    
    // Auto-register webhook with the backend
    try {
      await fetch(`${process.env.BACKEND_API_BASE}/merchants/connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-service-key': process.env.SERVICE_KEY || '',
        },
        body: JSON.stringify({
          stripe_user_id: acct,
          access_token: response.access_token,
          refresh_token: response.refresh_token,
        })
      })
    } catch (webhookError) {
      console.error('Failed to register webhook:', webhookError)
      // Continue anyway - webhook can be set up manually
    }
    
    return res
  } catch (error) {
    console.error('Stripe Connect error:', error)
    return NextResponse.redirect(new URL('/demo?error=stripe_connect_failed', req.url))
  }
}