import { NextResponse } from 'next/server'
import { getJwks } from '@/lib/crypto'

export const runtime = 'nodejs'

export async function GET() {
  const jwks = await getJwks()
  return NextResponse.json(jwks, {
    headers: { 'Cache-Control': 'public, max-age=300' },
  })
}
