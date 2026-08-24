import React from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, CalendarDays, ListTodo, Receipt, Users, CalendarRange,
  Settings2, History, ChevronDown, LogOut, Check, MapPin, Sun, Moon, Languages, AlertTriangle
} from 'lucide-react'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Badge, Hint } from '@/components/ui/misc'
import { useSession } from '@/lib/session'
import { useI18n } from '@/i18n'
import { cn, initials } from '@/lib/utils'

const NAV = [
  { group: 'nav.group.floor', items: [
    { to: '/calendar', key: 'nav.calendar', icon: CalendarDays },
    { to: '/dashboard', key: 'nav.dashboard', icon: LayoutDashboard },
    { to: '/tasks', key: 'nav.tasks', icon: ListTodo },
    { to: '/clients', key: 'nav.clients', icon: Users }
  ] },
  { group: 'nav.group.manage', items: [
    { to: '/price', key: 'nav.price', icon: Receipt },
    { to: '/rota', key: 'nav.rota', icon: CalendarRange },
    { to: '/activity', key: 'nav.audit', icon: History },
    { to: '/admin', key: 'nav.admin', icon: Settings2, ownerOnly: true }
  ] }
]

export default function AppShell({ children }) {
  const { t } = useI18n()
  const { isOwner } = useSession()
  const { pathname } = useLocation()

  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <nav
          className="hidden w-[13.5rem] shrink-0 flex-col gap-5 overflow-y-auto border-r border-line bg-surface px-3 py-4 md:flex"
          aria-label="Main"
        >
          {NAV.map((section) => (
            <div key={section.group}>
              <p className="px-2.5 pb-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-ink-faint">
                {t(section.group)}
              </p>
              <ul className="space-y-0.5">
                {section.items
                  .filter((i) => !i.ownerOnly || isOwner)
                  .map((item) => (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        className={({ isActive }) =>
                          cn(
                            'group flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
                            isActive
                              ? 'bg-accent-soft text-accent'
                              : 'text-ink-soft hover:bg-sunken hover:text-ink'
                          )
                        }
                      >
                        <item.icon className="size-4 shrink-0" aria-hidden="true" />
                        {t(item.key)}
                      </NavLink>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </nav>

        <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
      </div>

      {/* Mobile: the same destinations as a bottom bar. */}
      <nav className="flex shrink-0 items-center justify-around border-t border-line bg-surface md:hidden" aria-label="Main">
        {NAV.flatMap((s) => s.items)
          .filter((i) => !i.ownerOnly || isOwner)
          .slice(0, 5)
          .map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={cn(
                'flex flex-1 cursor-pointer flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors',
                pathname === item.to ? 'text-accent' : 'text-ink-faint'
              )}
            >
              <item.icon className="size-[18px]" aria-hidden="true" />
              {t(item.key)}
            </NavLink>
          ))}
      </nav>
    </div>
  )
}

function TopBar() {
  const { t, lang, setLang, languages } = useI18n()
  const { user, locations, locationId, setLocationId, location, signOut, isAway, theme, setTheme } = useSession()

  return (
    <header className="z-30 flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-3 sm:px-4">
      <div className="flex items-center gap-2.5">
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-lg font-display text-[15px] text-white"
          style={{ background: location?.accent || 'var(--accent)' }}
        >
          F
        </span>
        <span className="hidden font-display text-[15px] leading-none sm:block">Forno</span>
      </div>

      {/* Location switcher — top right of the spec, kept reachable at all sizes. */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              'flex min-w-0 cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm transition-colors',
              isAway ? 'border-clay bg-clay-soft text-clay' : 'border-line-strong bg-surface hover:bg-sunken'
            )}
          >
            <MapPin className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate font-medium">{location?.name ?? t('loc.switch')}</span>
            <ChevronDown className="size-3.5 shrink-0 opacity-60" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-72">
          <DropdownMenuLabel>{t('loc.switchHint')}</DropdownMenuLabel>
          {locations.map((l) => (
            <DropdownMenuItem key={l.id} onSelect={() => setLocationId(l.id)} className="gap-2.5 py-2">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: l.accent }} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-ink">{l.name}</span>
                <span className="block truncate text-xs text-ink-faint">{l.address}</span>
              </span>
              {l.id === user?.location_id && <Badge tone="accent">{t('loc.home')}</Badge>}
              {l.id === locationId && <Check className="size-4 shrink-0 text-accent" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {isAway && (
        <Hint label={t('loc.awayWarning')}>
          <span className="hidden items-center gap-1.5 rounded-md bg-clay-soft px-2 py-1 text-xs font-medium text-clay lg:flex">
            <AlertTriangle className="size-3.5" aria-hidden="true" />
            {t('loc.awayWarning')}
          </span>
        </Hint>
      )}

      <div className="ml-auto flex items-center gap-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1.5 px-2">
              <Languages className="size-4" aria-hidden="true" />
              <span className="text-xs font-semibold tracking-wide">
                {languages.find((l) => l.code === lang)?.short}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{t('common.language')}</DropdownMenuLabel>
            {languages.map((l) => (
              <DropdownMenuItem key={l.code} onSelect={() => setLang(l.code)}>
                <span className="flex-1">{l.label}</span>
                {lang === l.code && <Check className="size-4 text-accent" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Hint label={theme === 'dark' ? t('common.theme.light') : t('common.theme.dark')}>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label={t('common.theme')}
          >
            {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>
        </Hint>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex cursor-pointer items-center gap-2 rounded-lg py-1 pl-1 pr-2 transition-colors hover:bg-sunken">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-accent text-[11px] font-semibold text-accent-ink">
                {initials(user?.display_name)}
              </span>
              <ChevronDown className="size-3.5 opacity-60" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <div className="px-2 py-1.5">
              <p className="truncate text-sm font-medium text-ink">{user?.display_name}</p>
              <p className="mt-0.5 truncate text-xs text-ink-faint">
                {user?.role === 'owner' ? t('auth.owner') : t('auth.admin')}
                {user?.location_name ? ` · ${user.location_name}` : ''}
              </p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={signOut}>
              <LogOut className="size-4" />
              {t('auth.signOut')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
