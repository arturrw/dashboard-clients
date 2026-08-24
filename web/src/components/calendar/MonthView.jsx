import React, { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/misc'
import { get } from '@/lib/api'
import { useI18n } from '@/i18n'
import { useSession } from '@/lib/session'
import { cn, isoDay, pad } from '@/lib/utils'

const monthOf = (day) => day.slice(0, 7)
const shiftMonth = (month, delta) => {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

/**
 * Month planner: load per day, so an admin filling the diary a month ahead can
 * see where the pressure already is before opening a single day.
 */
export default function MonthView({ day, onPickDay }) {
  const { t, locale } = useI18n()
  const { locationId } = useSession()
  const [month, setMonth] = useState(() => monthOf(day))
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    get(`/month?month=${month}`)
      .then((res) => !cancelled && setData(res))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [month, locationId])

  const cells = useMemo(() => {
    const [y, m] = month.split('-').map(Number)
    const first = new Date(y, m - 1, 1)
    // Monday-first grid, as used across Latvia.
    const lead = (first.getDay() + 6) % 7
    const daysInMonth = new Date(y, m, 0).getDate()
    const out = []
    for (let i = 0; i < lead; i++) out.push(null)
    for (let d = 1; d <= daysInMonth; d++) out.push(`${month}-${pad(d)}`)
    while (out.length % 7 !== 0) out.push(null)
    return out
  }, [month])

  const byDay = useMemo(() => {
    const map = new Map()
    for (const row of data?.days ?? []) map.set(row.day, row)
    return map
  }, [data])

  const shiftsByDay = useMemo(() => {
    const map = new Map()
    for (const s of data?.shifts ?? []) {
      if (!map.has(s.day)) map.set(s.day, [])
      map.get(s.day).push(s)
    }
    return map
  }, [data])

  const today = isoDay(new Date())
  const weekdays = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { weekday: 'short' })
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 1 + i)))
  }, [locale])

  const maxLoad = Math.max(1, ...(data?.days ?? []).map((d) => d.total))

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-line bg-surface px-4 py-2">
        <Button variant="outline" size="icon-sm" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month">
          <ChevronLeft className="size-4" />
        </Button>
        <h2 className="h-display min-w-[10rem] text-base capitalize">
          {new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(new Date(`${month}-01T00:00:00`))}
        </h2>
        <Button variant="outline" size="icon-sm" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month">
          <ChevronRight className="size-4" />
        </Button>
        {loading && <Spinner className="ml-1" />}
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3 sm:p-4">
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-line bg-line">
          {weekdays.map((w) => (
            <div key={w} className="bg-sunken px-2 py-1.5 text-center text-[11px] font-medium uppercase tracking-[0.06em] text-ink-faint">
              {w}
            </div>
          ))}

          {cells.map((d, i) => {
            if (!d) return <div key={`pad-${i}`} className="min-h-[5.5rem] bg-canvas" />
            const row = byDay.get(d)
            const shifts = shiftsByDay.get(d) ?? []
            const load = row ? row.total / maxLoad : 0
            const isToday = d === today
            const isSelected = d === day
            return (
              <button
                key={d}
                type="button"
                onClick={() => onPickDay(d)}
                className={cn(
                  'group flex min-h-[5.5rem] cursor-pointer flex-col gap-1 bg-surface p-2 text-left transition-colors hover:bg-accent-soft',
                  isSelected && 'ring-2 ring-inset ring-accent'
                )}
              >
                <span className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      'flex size-6 items-center justify-center rounded-md text-xs font-semibold tabular',
                      isToday ? 'bg-clay text-white' : 'text-ink'
                    )}
                  >
                    {Number(d.slice(-2))}
                  </span>
                  {row && (
                    <span className="text-[11px] tabular text-ink-soft">
                      {row.total} · {row.guests}p
                    </span>
                  )}
                </span>

                {/* Load bar: relative pressure across the month at a glance. */}
                <span className="h-1 w-full overflow-hidden rounded-full bg-sunken">
                  <span className="block h-full rounded-full bg-accent transition-[width]" style={{ width: `${load * 100}%` }} />
                </span>

                <span className="mt-auto flex flex-wrap gap-0.5">
                  {shifts.slice(0, 6).map((s) => (
                    <span
                      key={s.id}
                      title={`${s.staff_name}`}
                      className="size-1.5 rounded-full"
                      style={{ background: s.staff_color }}
                    />
                  ))}
                  {shifts.length > 6 && <span className="text-[9px] text-ink-faint">+{shifts.length - 6}</span>}
                </span>
              </button>
            )
          })}
        </div>

        <p className="mt-3 text-xs text-ink-faint">{t('rota.hint')}</p>
      </div>
    </div>
  )
}
