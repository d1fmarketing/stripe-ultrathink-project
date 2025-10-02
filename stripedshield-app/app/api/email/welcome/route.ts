import { sendEmail, template } from '@/lib/email'
import { requireServiceKey } from '@/lib/serviceAuth'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  if (!requireServiceKey(req.headers)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  
  try {
    const { to, name } = await req.json()
    
    const html = template({
      title: 'Welcome to StripedShield 🎉',
      body: `
        <p>Hi ${name || 'there'},</p>
        <p>Your founder account is live. Connect Stripe and we'll start defending disputes automatically.</p>
        <ul>
          <li>~68% win rate (CE3.0 built-in)</li>
          <li>Flat $599 founder plan</li>
          <li>Sub-second pipeline</li>
        </ul>
        <p><a href="${process.env.NEXTAUTH_URL}/dashboard" style="color:#635BFF">Open your dashboard</a></p>
      `
    })
    
    await sendEmail({ to, subject: 'Welcome to StripedShield', html })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Welcome email error:', error)
    return NextResponse.json(
      { error: 'Failed to send email' },
      { status: 500 }
    )
  }
}