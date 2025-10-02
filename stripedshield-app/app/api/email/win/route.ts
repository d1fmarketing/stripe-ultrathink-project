import { sendEmail, template } from '@/lib/email'
import { requireServiceKey } from '@/lib/serviceAuth'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  if (!requireServiceKey(req.headers)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  
  try {
    const { to, merchantName, caseId, amount, currency = 'USD', caseUrl } = await req.json()
    
    const html = template({
      title: 'You won a dispute 💪',
      body: `
        <p>${merchantName || 'Merchant'},</p>
        <p>Case <strong>${caseId}</strong> was won. Recovered <strong>${Number(amount || 0).toLocaleString()} ${currency}</strong>.</p>
        <p>${caseUrl ? `<a href="${caseUrl}" style="color:#635BFF">View case details</a>` : ''}</p>
      `
    })
    
    await sendEmail({ to, subject: 'Dispute won — StripedShield', html })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Win email error:', error)
    return NextResponse.json(
      { error: 'Failed to send email' },
      { status: 500 }
    )
  }
}