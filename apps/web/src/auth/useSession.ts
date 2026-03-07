import { useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

type SessionState = {
  isLoading: boolean
  session: Session | null
  user: User | null
}

async function ensureProfile(user: User) {
  const { error } = await supabase.from('profiles').upsert(
    {
      id: user.id,
      email: user.email ?? null,
      display_name:
        typeof user.user_metadata?.display_name === 'string' && user.user_metadata.display_name.trim().length
          ? user.user_metadata.display_name.trim()
          : (user.email?.split('@')[0] ?? 'User'),
    },
    { onConflict: 'id' },
  )

  if (error) throw error
}

export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({
    isLoading: true,
    session: null,
    user: null,
  })

  useEffect(() => {
    let active = true

    async function syncSession(session: Session | null) {
      if (session?.user) {
        try {
          await ensureProfile(session.user)
        } catch (error) {
          console.error('Failed to ensure profile', error)
        }
      }

      if (!active) return

      setState({
        isLoading: false,
        session,
        user: session?.user ?? null,
      })
    }

    void supabase.auth.getSession().then(({ data }) => syncSession(data.session ?? null))

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void syncSession(session ?? null)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  return state
}
