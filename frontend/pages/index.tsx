import Head from 'next/head'
import Link from 'next/link'
import '../styles/globals.css'

export default function Home(){
  const api = process.env.NEXT_PUBLIC_API_BASE
  return (
    <div className="container">
      <Head><title>Disputes — Chargeback Autopilot</title></Head>
      <div className="card">
        <h1>Chargeback Autopilot</h1>
        <p>Connect your Stripe account and we’ll auto-stage and auto-submit dispute evidence before the deadline.</p>
        <p><Link className="btn" href="/connections">Connect Stripe</Link></p>
        <p><Link className="btn" href="/cases" style={{marginLeft:8}}>Cases</Link></p>
      </div>
      <div className="card">
        <h2>Cases</h2>
        <p>Once connected, use the <b>Cases</b> page to load disputes, re-collect evidence or submit immediately.</p>
      </div>
      <div className="card">
        <h3>API base</h3>
        <code>{api}</code>
      </div>
    </div>
  )
}
