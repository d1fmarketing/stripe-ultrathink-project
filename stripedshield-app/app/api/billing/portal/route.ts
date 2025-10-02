import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getBaseUrl } from '@/lib/baseUrl'

export async function POST() {
  try {
    const session = await getServerSession(authOptions)
    const email = session?.user?.email
    
    if (!email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { 
      apiVersion: '2025-07-30.basil' 
    })
    
    // Try to find customer by email
    let customerId: string | undefined
    
    // Search for customer by email
    try {
      const customers = await stripe.customers.search({
        query: `email:'${email}'`,
        limit: 1
      })
      customerId = customers.data[0]?.id
    } catch (searchError) {
      // Fallback to list if search fails
      const customers = await stripe.customers.list({
        email,
        limit: 1
      })
      customerId = customers.data[0]?.id
    }
    
    if (!customerId) {
      return NextResponse.json(
        { error: 'No subscription found' },
        { status: 404 }
      )
    }
    
    // Create portal session
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${getBaseUrl()}/dashboard`,
    })
    
    return NextResponse.json({ url: portalSession.url })
  } catch (error) {
    console.error('Portal error:', error)
    return NextResponse.json(
      { error: 'Failed to create portal session' },
      { status: 500 }
    )
  }
}