import { cookies } from 'next/headers'

const BASE = process.env.BACKEND_API_BASE || 'https://ket0g0lurh.execute-api.us-east-1.amazonaws.com'

export async function backendGET(path: string) {
  const cookieStore = await cookies()
  const acct = cookieStore.get('ss_acct')?.value
  const url = new URL(`${BASE}${path}`)
  
  if (acct && !url.searchParams.get('merchant')) {
    url.searchParams.set('merchant', acct)
  }
  
  const r = await fetch(url.toString(), { 
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
    }
  })
  
  if (!r.ok) {
    throw new Error(`Backend ${r.status}: ${await r.text()}`)
  }
  
  return r.json()
}

export async function backendPOST(path: string, body: unknown) {
  const cookieStore = await cookies()
  const acct = cookieStore.get('ss_acct')?.value
  const url = new URL(`${BASE}${path}`)
  
  if (acct && !url.searchParams.get('merchant')) {
    url.searchParams.set('merchant', acct)
  }
  
  const r = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    cache: 'no-store'
  })
  
  if (!r.ok) {
    throw new Error(`Backend ${r.status}: ${await r.text()}`)
  }
  
  return r.json()
}