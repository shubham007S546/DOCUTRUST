import { createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { documents } from '@/lib/db/schema'

export const runtime = 'nodejs'

function tenantUuid(userId: string) {
  const hex = createHash('sha256').update(`docutrust-tenant:${userId}`).digest('hex').slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`
}

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) return Response.json({ documents: [] }, { status: 401 })
  const rows = await db.select().from(documents).where(eq(documents.tenantId, tenantUuid(session.user.id)))
  return Response.json({ documents: rows })
}

export async function HEAD() {
  return new Response(null, { status: 204 })
}
