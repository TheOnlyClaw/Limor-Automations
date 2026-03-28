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
      <div className="flex min-h-screen items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm rounded-[28px] border border-white/10 bg-zinc-950/75 p-8 text-center shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-400/20 bg-amber-500/10 text-amber-100">
            <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-amber-300" />
          </div>
          <div className="mt-5 text-base font-semibold tracking-tight text-zinc-50">Loading workspace</div>
          <div className="mt-2 text-sm text-zinc-400">
            Checking your session and preparing the automation dashboard.
          </div>
        </div>
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
