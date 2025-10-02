export const config = { schedule: '0 15 * * *' } // daily 15:00 UTC (11am NYC during EDT)

export default async () => {
  const base = process.env.URL || process.env.DEPLOY_PRIME_URL || 'http://localhost:3000'
  const svc = process.env.SERVICE_KEY!
  const stages = ['d0', 'd2', 'd10']
  const results = []
  
  for (const s of stages) {
    try {
      const r = await fetch(`${base}/api/email/founder?stage=${s}`, { 
        headers: { 'x-service-key': svc } 
      })
      results.push({ stage: s, status: r.status })
    } catch (error) {
      results.push({ stage: s, status: 'error', error: String(error) })
    }
  }
  
  return { 
    statusCode: 200, 
    body: JSON.stringify({ ok: true, results }) 
  }
}