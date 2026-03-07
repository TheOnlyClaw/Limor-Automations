import type { ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { LoginPage } from './LoginPage'
import { supabase } from '../lib/supabase'
import { useSession } from './useSession'

export function AuthGate({
  children,
}: {
  children: (args: { user: User; signOut: () => Promise<void> }) => ReactNode
}) {
  const { isLoading, user } = useSession()

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 text-sm text-zinc-400">
        Loading workspace…
      </div>
    )
  }

  if (!user) {
    return <LoginPage />
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }

  return <>{children({ user, signOut })}</>
}
