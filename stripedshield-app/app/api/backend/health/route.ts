import { backendGET } from '@/lib/backend'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const data = await backendGET('/health')
    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json(
      { ok: false, degraded: true, error: String(error) },
      { status: 503 }
    )
  }
}