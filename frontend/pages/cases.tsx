import { useEffect, useState } from 'react'
import Head from 'next/head'
import '../styles/globals.css'

type Case = {
  dispute_id: string
  amount_cents: number
  currency: string
  reason: string
  status: string
  due_by_epoch?: number
}

export default function Cases(){
  const [merchant,setMerchant] = useState<string>('')
  const [items,setItems] = useState<Case[]>([])
  const [loading,setLoading] = useState(false)
  const [err,setErr] = useState<string>('')

  useEffect(()=>{
    const m = localStorage.getItem('merchantId')
    if(m) setMerchant(m)
  },[])

  function saveMerchant(e:any){
    const v = e.target.value
    setMerchant(v)
    localStorage.setItem('merchantId', v)
  }

  async function loadCases(){
    setErr(''); setLoading(true)
    try{
      const r = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/cases?merchant=${merchant}`)
      const j = await r.json()
      setItems(j.items||[])
    }catch(e:any){ setErr(e.message) }
    setLoading(false)
  }

  async function submitNow(id:string){
    await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/cases/${id}/submit?merchant=${merchant}`, {method:'POST'})
    await loadCases()
  }

  async function recollect(id:string){
    await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/cases/${id}/collect?merchant=${merchant}`, {method:'POST'})
    await loadCases()
  }

  function daysLeft(due?:number){
    if(!due) return '-'
    const diff = due*1000 - Date.now()
    const days = Math.ceil(diff / (1000*3600*24))
    return days >= 0 ? `${days}d` : `${days}d`
  }

  function money(cents:number, cur:string){
    return `${(cents/100).toFixed(2)} ${cur?.toUpperCase()||''}`
  }

  return (
    <div className="container">
      <Head><title>Cases — Chargeback Autopilot</title></Head>
      <div className="card">
        <h1>Cases</h1>
        <p>Enter your Stripe account ID (starts with <code>acct_</code>). We store it locally for convenience.</p>
        <input style={{padding:'.5rem',border:'1px solid var(--border)',borderRadius:'8px',width:'320px'}} value={merchant} onChange={saveMerchant} placeholder="acct_123..." />
        <button className="btn" style={{marginLeft:'8px'}} onClick={loadCases} disabled={!merchant || loading}>{loading?'Loading…':'Load Cases'}</button>
        {err && <p style={{color:'crimson'}}>{err}</p>}
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr><th>Dispute</th><th>Amount</th><th>Reason</th><th>Status</th><th>Due in</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {items.map((c:Case)=>(
              <tr key={c.dispute_id}>
                <td><code>{c.dispute_id}</code></td>
                <td>{money(c.amount_cents, c.currency)}</td>
                <td>{c.reason}</td>
                <td>{c.status}</td>
                <td>{daysLeft(c.due_by_epoch)}</td>
                <td>
                  <button className="btn" onClick={()=>recollect(c.dispute_id)} style={{marginRight:8}}>Recollect</button>
                  <button className="btn" onClick={()=>submitNow(c.dispute_id)}>Submit now</button>
                </td>
              </tr>
            ))}
            {items.length===0 && <tr><td colSpan={6}><em>No cases yet. Trigger Stripe test events or wait for real disputes.</em></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
