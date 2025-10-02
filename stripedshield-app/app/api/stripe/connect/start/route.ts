import { NextResponse } from 'next/server'
import { getBaseUrl } from '@/lib/baseUrl'

export async function GET() {
  const redirect = process.env.STRIPE_REDIRECT_URL || `${getBaseUrl()}/api/stripe/connect/callback`
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.STRIPE_CLIENT_ID!,
    scope: 'read_write',
    redirect_uri: redirect
  })
  return NextResponse.redirect(`https://connect.stripe.com/oauth/authorize?${params.toString()}`)
}