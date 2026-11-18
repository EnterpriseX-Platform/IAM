import { NextRequest, NextResponse } from 'next/server'

export async function GET(_request: NextRequest) {
  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8080'
    const response = await fetch(`${apiUrl}/iamx/api/health`, {
      method: 'GET',
    })

    const data = await response.json()

    return NextResponse.json(
      {
        status: 'ok',
        backend: data,
        timestamp: new Date().toISOString(),
      },
      { status: response.status }
    )
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
