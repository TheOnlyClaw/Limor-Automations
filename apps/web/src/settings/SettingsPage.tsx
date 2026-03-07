import { InstagramConnectionsSection } from './sections/InstagramConnectionsSection'
import { AppShell } from '../shell/AppShell'

export function SettingsPage({
  onNavigate,
  userEmail,
  onSignOut,
}: {
  onNavigate: (href: string) => void
  userEmail: string | null
  onSignOut: () => Promise<void>
}) {
  return (
    <AppShell active="settings" onNavigate={onNavigate} userEmail={userEmail} onSignOut={onSignOut}>
      <InstagramConnectionsSection />
    </AppShell>
  )
}
