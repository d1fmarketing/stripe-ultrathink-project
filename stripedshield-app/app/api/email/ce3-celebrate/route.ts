import { requireServiceKey } from '@/lib/serviceAuth'
import { sendEmail, template } from '@/lib/email'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  if (!requireServiceKey(req.headers)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  
  try {
    const { to, merchantName, caseId, amount, currency = 'USD', caseUrl } = await req.json()
    
    const html = template({
      title: 'First CE3.0 auto-win 🎯',
      body: `
        <p>${merchantName || 'Merchant'},</p>
        <p>You just won your <strong>first CE3.0 auto-win</strong>.</p>
        <p><strong>Case:</strong> ${caseId} • <strong>Recovered:</strong> ${Number(amount||0).toLocaleString()} ${currency}</p>
        ${caseUrl ? `<p><a href="${caseUrl}" style="color:#635BFF">View case</a></p>` : ''}
        <p>We'll keep optimizing as more outcomes flow in.</p>
      `
    })
    
    await sendEmail({ to, subject: 'You just got a CE3.0 auto-win', html })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('CE3 celebrate email error:', error)
    return NextResponse.json(
      { error: 'Failed to send email' },
      { status: 500 }
    )
  }
}