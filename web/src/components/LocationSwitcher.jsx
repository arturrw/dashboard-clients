import React from 'react'
import { Home, Globe } from 'lucide-react'
import { Hint } from '@/components/ui/misc'
import { useSession } from '@/lib/session'
import { useI18n } from '@/i18n'
import { cn, shortName } from '@/lib/utils'

/**
 * In-page venue picker. The top bar carries the same switch, but a diary or a
 * task board is exactly where an admin needs it — a forwarded call should not
 * cost a trip to the header.
 *
 * Selecting a venue changes the session's acting location, so every screen
 * stays on the same venue as you move between them.
 */
export default function LocationSwitcher({ allowAll = false, allSelected = false, onSelectAll, className }) {
  const { t } = useI18n()
  const { locations, locationId, setLocationId, user } = useSession()

  if (locations.length < 2) return null

  return (
    <div
      className={cn('flex items-center gap-0.5 overflow-x-auto rounded-lg border border-line bg-sunken p-0.5', className)}
      role="group"
      aria-label={t('loc.switch')}
    >
      {allowAll && (
        <button
          type="button"
          onClick={onSelectAll}
          aria-pressed={allSelected}
          className={cn(
            'flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-[13px] font-medium transition-colors',
            allSelected ? 'bg-surface text-ink shadow-card' : 'text-ink-faint hover:text-ink'
          )}
        >
          <Globe className="size-3.5" aria-hidden="true" />
          {t('common.all')}
        </button>
      )}

      {locations.map((l) => {
        const active = !allSelected && l.id === locationId
        const isHome = l.id === user?.location_id
        return (
          <Hint key={l.id} label={isHome ? `${l.name} · ${t('loc.home')}` : l.name}>
            <button
              type="button"
              onClick={() => {
                setLocationId(l.id)
                onSelectAll && allSelected && onSelectAll(false)
              }}
              aria-pressed={active}
              className={cn(
                'flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-[13px] font-medium transition-colors',
                active ? 'bg-surface text-ink shadow-card' : 'text-ink-faint hover:text-ink'
              )}
            >
              <span
                className={cn('size-2 shrink-0 rounded-full transition-opacity', !active && 'opacity-50')}
                style={{ background: l.accent }}
                aria-hidden="true"
              />
              <span className="max-w-[9rem] truncate">{shortName(l.name)}</span>
              {isHome && <Home className="size-3 shrink-0 opacity-50" aria-hidden="true" />}
            </button>
          </Hint>
        )
      })}
    </div>
  )
}
