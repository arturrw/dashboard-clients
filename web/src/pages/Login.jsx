import React, { useEffect, useState } from 'react'
import { MapPin, Lock, ChevronRight, Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Field } from '@/components/ui/field'
import { Spinner } from '@/components/ui/misc'
import { useSession } from '@/lib/session'
import { useI18n } from '@/i18n'
import { get, store } from '@/lib/api'
import { LANGUAGES } from '@/i18n/dictionary'
import { cn, initials, shortName } from '@/lib/utils'

export default function Login() {
  const { signIn } = useSession()
  const { t, lang, setLang } = useI18n()
  const [device, setDevice] = useState(store.device)
  const [accounts, setAccounts] = useState(null)
  const [username, setUsername] = useState(device?.username ?? '')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Accounts are listed so an unbound terminal can pick its venue once; after
  // that the PC remembers it and only the password is asked for.
  useEffect(() => {
    if (device) return
    get('/auth/accounts').then(setAccounts).catch(() => setAccounts([]))
  }, [device])

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await signIn(username, password)
    } catch (err) {
      setError(err.code === 'bad_credentials' ? t('auth.failed') : t('common.error'))
      setPassword('')
    } finally {
      setBusy(false)
    }
  }

  const unbind = () => {
    store.device = null
    setDevice(null)
    setUsername('')
    setPassword('')
  }

  return (
    <div className="grid h-full lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-accent p-10 text-accent-ink lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)',
            backgroundSize: '22px 22px'
          }}
          aria-hidden="true"
        />
        <div className="relative">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-lg border border-current/25 font-display text-lg">
              F
            </span>
            <div>
              <p className="font-display text-lg leading-none">Forno</p>
              <p className="mt-1 text-xs uppercase tracking-[0.14em] opacity-70">{t('app.subtitle')}</p>
            </div>
          </div>
        </div>

        <div className="relative max-w-md">
          <p className="font-display text-[28px] leading-[1.25]">
            One diary, three dining rooms, every guest remembered.
          </p>
          <p className="mt-4 text-sm leading-relaxed opacity-80">
            Reservations, blocked time, supply prices and the guest book — all bound to the venue this
            terminal belongs to, and switchable the moment a call is forwarded.
          </p>
        </div>

        <div className="relative flex gap-6 text-xs opacity-70">
          <span>3 locations</span>
          <span>17 tables</span>
          <span>10 staff</span>
        </div>
      </aside>

      <main className="flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center justify-between">
            <div className="flex items-center gap-2 lg:hidden">
              <span className="flex size-8 items-center justify-center rounded-lg bg-accent font-display text-accent-ink">F</span>
              <span className="font-display">Forno</span>
            </div>
            <div className="ml-auto flex rounded-lg border border-line bg-sunken p-0.5">
              {LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => setLang(l.code)}
                  aria-pressed={lang === l.code}
                  className={cn(
                    'cursor-pointer rounded-md px-2 py-1 text-xs font-medium transition-colors',
                    lang === l.code ? 'bg-surface text-ink shadow-card' : 'text-ink-faint hover:text-ink'
                  )}
                >
                  {l.short}
                </button>
              ))}
            </div>
          </div>

          <h1 className="h-display text-2xl">{t('auth.title')}</h1>
          <p className="mt-1 text-sm text-ink-soft">{t('auth.subtitle')}</p>

          {device ? (
            <div className="mt-6 rounded-xl border border-line bg-accent-soft/60 p-3.5">
              <p className="text-[11px] font-medium uppercase tracking-[0.07em] text-ink-faint">
                {t('auth.bound')}
              </p>
              <div className="mt-2 flex items-center gap-2.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-sm font-medium text-accent-ink">
                  {initials(device.location_name ? shortName(device.location_name) : device.display_name)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">
                    {device.location_name || t('auth.owner')}
                  </p>
                  <p className="truncate text-xs text-ink-soft">{device.display_name}</p>
                </div>
              </div>
              <p className="mt-2.5 text-xs leading-relaxed text-ink-soft">{t('auth.boundHint')}</p>
            </div>
          ) : accounts === null ? (
            <div className="mt-6 flex items-center gap-2 text-sm text-ink-soft">
              <Spinner /> {t('common.loading')}
            </div>
          ) : (
            <div className="mt-6">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.07em] text-ink-faint">
                {t('auth.pickAccount')}
              </p>
              <div className="space-y-1.5">
                {accounts.map((a) => (
                  <button
                    key={a.username}
                    type="button"
                    onClick={() => setUsername(a.username)}
                    className={cn(
                      'flex w-full cursor-pointer items-center gap-2.5 rounded-lg border p-2.5 text-left transition-colors',
                      username === a.username
                        ? 'border-accent bg-accent-soft'
                        : 'border-line bg-surface hover:bg-sunken'
                    )}
                  >
                    <span
                      className="flex size-8 shrink-0 items-center justify-center rounded-md text-xs font-medium text-white"
                      style={{ background: a.accent || 'var(--accent)' }}
                    >
                      {a.role === 'owner' ? <Building2 className="size-4" /> : initials(shortName(a.location_name))}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">
                        {a.location_name || t('auth.owner')}
                      </span>
                      <span className="block truncate text-xs text-ink-faint">{a.username}</span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-ink-faint" />
                  </button>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={submit} className="mt-5 space-y-3.5">
            {!device && (
              <Field label={t('auth.username')}>
                <div className="relative">
                  <MapPin className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
                  <Input
                    className="pl-9"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    required
                  />
                </div>
              </Field>
            )}

            <Field label={t('auth.password')} error={error || undefined}>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
                <Input
                  className="pl-9"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  autoFocus={Boolean(device)}
                  required
                />
              </div>
            </Field>

            <Button type="submit" className="w-full" size="lg" disabled={busy || !username}>
              {busy && <Spinner className="text-current" />}
              {busy ? t('common.loading') : t('auth.signIn')}
            </Button>

            {device && (
              <button
                type="button"
                onClick={unbind}
                className="w-full cursor-pointer text-center text-xs text-ink-faint underline-offset-4 transition-colors hover:text-ink hover:underline"
              >
                {t('auth.unbind')}
              </button>
            )}
          </form>

          <p className="mt-8 text-xs leading-relaxed text-ink-faint">{t('auth.demoHint')}</p>
        </div>
      </main>
    </div>
  )
}
