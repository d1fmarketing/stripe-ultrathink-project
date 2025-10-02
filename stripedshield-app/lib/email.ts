import { Resend } from 'resend'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
const FROM = process.env.EMAIL_FROM || 'StripedShield <noreply@stripedshield.com>'

export async function sendEmail(opts: { to: string; subject: string; html: string }) {
  if (!resend || !process.env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY missing - email not sent')
    return // Skip in development
  }
  
  const { error } = await resend.emails.send({ 
    from: FROM, 
    to: opts.to, 
    subject: opts.subject, 
    html: opts.html 
  })
  
  if (error) throw error
}

export function template(layout: { title: string; body: string }) {
  return `
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0f1a;padding:24px;color:#e6e9f2;font-family:Inter,Segoe UI,Arial">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#111827;border-radius:12px;border:1px solid #1f2937;padding:24px">
        <tr><td>
          <h1 style="margin:0 0 8px 0;color:#e6e9f2;font-size:20px">${layout.title}</h1>
          <div style="color:#93a1b1;font-size:14px;line-height:1.6">${layout.body}</div>
          <p style="color:#93a1b1;font-size:12px;margin-top:24px">— StripedShield • Win ~68% of Stripe chargebacks</p>
        </td></tr>
      </table>
    </td></tr>
  </table>`
}