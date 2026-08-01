import { NextResponse } from 'next/server'
import { routeAuthClient } from '@/lib/auth/route-client'

export const runtime = 'nodejs'

export async function POST() {
  const supabase = await routeAuthClient()
  await supabase.auth.signOut()
  return NextResponse.json({ ok: true })
}
