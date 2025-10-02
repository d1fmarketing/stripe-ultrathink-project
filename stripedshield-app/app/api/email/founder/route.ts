import { requireServiceKey } from '@/lib/serviceAuth'
import { sendEmail, template } from '@/lib/email'
import { NextRequest, NextResponse } from 'next/server'

interface Recipient {
  email: string
  name?: string
  lastRecovered?: number
  winRate?: number
}

export async function GET(req: NextRequest) {
  if (!requireServiceKey(req.headers)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  
  try {
    const url = new URL(req.url)
    const stage = (url.searchParams.get('stage') || 'd0').toLowerCase() as 'd0'|'d2'|'d10'
    
    // In production, this would call backend for cohort
    // For now, using mock data
    const recipients: Recipient[] = [] // Would come from backend
    
    let sent = 0
    for (const r of recipients) {
      const html = buildFounderTemplate(stage, {
        name: r.name,
        lastRecovered: r.lastRecovered ?? 0,
        winRate: r.winRate ?? 0.68,
        baseUrl: process.env.NEXTAUTH_URL!,
      })
      
      await sendEmail({
        to: r.email,
        subject: founderSubject(stage),
        html
      })
      sent++
    }
    
    return NextResponse.json({ ok: true, stage, sent })
  } catch (error) {
    console.error('Founder email error:', error)
    return NextResponse.json(
      { error: 'Failed to send emails' },
      { status: 500 }
    )
  }
}

function founderSubject(stage: 'd0'|'d2'|'d10') {
  if (stage === 'd0') return 'Welcome — Claim your founder plan ($599/mo)'
  if (stage === 'd2') return 'Early results in — lock the founder plan'
  return 'Founder plan ends soon — keep your wins rolling'
}

function buildFounderTemplate(stage: 'd0'|'d2'|'d10', ctx: { name?: string; lastRecovered: number; winRate: number; baseUrl: string; }) {
  const headline =
    stage === 'd0'  ? 'Founder access unlocked 🎉'
  : stage === 'd2'  ? 'Your pipeline is humming ⚡'
                     : 'Last call for founder plan ⏳'

  const body =
    stage === 'd0'
      ? `
        <p>Hi ${ctx.name || ''},</p>
        <p>You're in. Connect Stripe and start winning ~68% of chargebacks automatically (CE3.0 built-in).</p>
        <ul>
          <li>Founder plan: <strong>$599/mo</strong> (no % of recovery)</li>
          <li>14-day pilot • cancel anytime</li>
          <li>Sub-second pipeline, audit-clean</li>
        </ul>
        <p><a href="${ctx.baseUrl}/dashboard" style="color:#635BFF">Open your dashboard</a> → Connect Stripe → Click "Start founder plan".</p>
      `
    : stage === 'd2'
      ? `
        <p>Hi ${ctx.name || ''},</p>
        <p>Early traction looks good. Recent recovered: <strong>${Math.round(ctx.lastRecovered).toLocaleString()}</strong>. Current win-rate tracking: <strong>${Math.round(ctx.winRate*100)}%</strong>.</p>
        <p>Lock your founder plan at <strong>$599/mo</strong> and keep CE3.0 auto-wins running.</p>
        <p><a href="${ctx.baseUrl}/dashboard?open=checkout" style="color:#635BFF">Lock founder plan</a> (1-click)</p>
      `
      : `
        <p>Hi ${ctx.name || ''},</p>
        <p>Founder pricing ends soon. Keep your pipeline running at ~68% wins and CE3.0 auto-wins.</p>
        <ul>
          <li>Founder price: <strong>$599/mo</strong></li>
          <li>After window: <strong>$1299/mo</strong></li>
        </ul>
        <p><a href="${ctx.baseUrl}/dashboard?open=checkout" style="color:#635BFF">Activate founder plan</a> — it's 1-click.</p>
      `
  
  return template({ title: headline, body })
}