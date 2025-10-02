import { backendGET } from '@/lib/backend'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const data = await backendGET('/cases')
    return NextResponse.json(data)
  } catch (error) {
    console.error('Cases fetch error:', error)
    return NextResponse.json(
      { items: [], error: 'Failed to fetch cases' },
      { status: 500 }
    )
  }
}