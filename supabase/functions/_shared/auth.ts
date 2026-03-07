import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import type { User } from '@supabase/supabase-js'
import { createUserClient } from './supabase.ts'

export async function requireUser(req: Request): Promise<User> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) throw new Error('Unauthorized')

  const client = createUserClient(authHeader)
  const {
    data: { user },
    error,
  } = await client.auth.getUser()

  if (error || !user) throw new Error('Unauthorized')
  return user
}
