export const config = { schedule: '0 14 * * *' }  // daily 14:00 UTC (10am NYC)

export default async () => {
  const base = process.env.URL || process.env.DEPLOY_PRIME_URL || 'http://localhost:3000'
  const svc = process.env.SERVICE_KEY!
  const days = [3, 7, 13]
  const results = []
  
  for (const d of days) {
    try {
      const r = await fetch(`${base}/api/email/trial-digest?day=${d}`, { 
        headers: { 'x-service-key': svc } 
      })
      results.push({ day: d, status: r.status })
    } catch (error) {
      results.push({ day: d, status: 'error', error: String(error) })
    }
  }
  
  return { 
    statusCode: 200, 
    body: JSON.stringify({ ok: true, results }) 
  }
}