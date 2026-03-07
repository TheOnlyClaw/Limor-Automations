import { createClient } from '@supabase/supabase-js'
import type { User } from '@supabase/supabase-js'
import { ApiError } from './api'
import type { Database } from './supabaseDatabase'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabaseClientKey = supabasePublishableKey || supabaseAnonKey

if (!supabaseUrl) {
  throw new Error('Missing VITE_SUPABASE_URL')
}

if (!supabaseClientKey) {
  throw new Error('Missing VITE_SUPABASE_PUBLISHABLE_KEY or VITE_SUPABASE_ANON_KEY')
}

export const supabase = createClient<Database>(supabaseUrl, supabaseClientKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

export async function requireAuthenticatedUser(): Promise<User> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    throw new ApiError(401, error?.message || 'You must be signed in to continue')
  }

  return user
}
