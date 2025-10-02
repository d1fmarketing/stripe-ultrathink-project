import { backendGET } from '@/lib/backend'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const data = await backendGET('/metrics/performance')
    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch metrics' },
      { status: 500 }
    )
  }
}