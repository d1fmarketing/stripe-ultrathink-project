import { useState } from 'react'
import Head from 'next/head'
import '../styles/globals.css'

export default function Connections(){
  const [loading, setLoading] = useState(false)
  async function connectStripe(){
    setLoading(true)
    const r = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/auth/stripe/start`)
    const { url } = await r.json()
    window.location.href = url
  }
  return (
    <div className="container">
      <Head><title>Connections — Chargeback Autopilot</title></Head>
      <div className="card">
        <h1>Connections</h1>
        <p>Connect your Stripe account so we can ingest disputes and submit evidence.</p>
        <button className="btn" onClick={connectStripe} disabled={loading}>
          {loading ? 'Redirecting…' : 'Connect Stripe'}
        </button>
      </div>
      <div className="card">
        <h2>Privacy</h2>
        <p>We do not store PAN or card data. Evidence is locked in S3 with server-side encryption and auto-deleted per your retention policy.</p>
      </div>
    </div>
  )
}
