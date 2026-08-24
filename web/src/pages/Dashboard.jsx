import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CalendarDays, Users, PlayCircle, Wallet, Sparkles, ListTodo, PackageMinus, ArrowRight, Pin
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardBody, Badge, Spinner, EmptyState } from '@/components/ui/misc'
import { STATUS_META, TASK_PRIORITY_META, formatPhone } from '@/lib/booking'
import { cn, hhmm, isoDay, money } from '@/lib/utils'
import { get } from '@/lib/api'
import { useSession } from '@/lib/session'
import { useI18n } from '@/i18n'

export default function Dashboard() {
  const { t, locale } = useI18n()
  const { locationId, location, setLocationId } = useSession()
  const [day] = useState(() => isoDay(new Date()))
  const [overview, setOverview] = useState(null)
  const [diary, setDiary] = useState(null)
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const load = useCallback(async () => {
    if (!locationId) return
    setLoading(true)
    try {
      const [o, d, tk] = await Promise.all([get(`/overview?day=${day}`), get(`/day?day=${day}`), get('/tasks')])
      setOverview(o)
      setDiary(d)
      setTasks(tk)
    } finally {
      setLoading(false)
    }
  }, [day, locationId])

  useEffect(() => {
    load()
  }, [load])

  const nowMinutes = now.getHours() * 60 + now.getMinutes()

  const upcoming = useMemo(
    () =>
      (diary?.bookings ?? [])
        .filter((b) => b.status !== 'cancelled' && b.end_min >= nowMinutes)
        .sort((a, b) => a.start_min - b.start_min)
        .slice(0, 8),
    [diary, nowMinutes]
  )

  const hotTasks = useMemo(
    () => tasks.filter((x) => x.status !== 'done' && (x.priority === 'urgent' || x.priority === 'high')).slice(0, 6),
    [tasks]
  )

  if (loading && !overview) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-ink-soft">
        <Spinner /> {t('common.loading')}
      </div>
    )
  }

  const tiles = [
    { key: 'dash.bookings', value: overview?.bookings ?? 0, icon: CalendarDays },
    { key: 'dash.guests', value: overview?.guests ?? 0, icon: Users },
    { key: 'dash.active', value: overview?.active ?? 0, icon: PlayCircle, tone: 'accent' },
    { key: 'dash.revenue', value: money(overview?.revenue ?? 0), icon: Wallet },
    { key: 'dash.newClients', value: overview?.new_clients ?? 0, icon: Sparkles },
    { key: 'dash.openTasks', value: overview?.open_tasks ?? 0, icon: ListTodo, tone: overview?.urgent_tasks ? 'clay' : undefined },
    { key: 'dash.lowStock', value: overview?.low_stock ?? 0, icon: PackageMinus, tone: overview?.low_stock ? 'clay' : undefined }
  ]

  return (
    <div className="h-full overflow-y-auto px-3 py-4 sm:px-5">
      <div className="mx-auto max-w-6xl space-y-4">
        <header>
          <h1 className="h-display text-xl">{t('dash.title')}</h1>
          <p className="mt-0.5 text-sm text-ink-soft">
            {location?.name} ·{' '}
            <span className="capitalize">
              {new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(now)}
            </span>
          </p>
        </header>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-7">
          {tiles.map((tile) => (
            <div key={tile.key} className="card px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-ink-faint">
                <tile.icon className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate text-[11px] font-medium uppercase tracking-[0.05em]">{t(tile.key)}</span>
              </div>
              <p
                className={cn(
                  'mt-1 text-xl font-semibold tabular',
                  tile.tone === 'accent' ? 'text-accent' : tile.tone === 'clay' ? 'text-clay' : 'text-ink'
                )}
              >
                {tile.value}
              </p>
            </div>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>{t('dash.nextUp')}</CardTitle>
              <Link to="/calendar" className="flex items-center gap-1 text-xs text-accent underline-offset-4 hover:underline">
                {t('nav.calendar')} <ArrowRight className="size-3" />
              </Link>
            </CardHeader>
            {upcoming.length === 0 ? (
              <EmptyState icon={CalendarDays} title={t('dash.noNext')} />
            ) : (
              <ul className="divide-y divide-line">
                {upcoming.map((b) => {
                  const meta = STATUS_META[b.status] ?? STATUS_META.booked
                  return (
                    <li key={b.id} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="w-24 shrink-0 text-sm font-semibold tabular text-ink">
                        {hhmm(b.start_min)}–{hhmm(b.end_min)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-medium text-ink">{b.client_name || '—'}</span>
                          {b.is_new_client && <Badge tone="accent">{t('bk.newGuest')}</Badge>}
                          {b.client_permanent_note && (
                            <Pin className="size-3 shrink-0 text-clay" aria-label={b.client_permanent_note} />
                          )}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-ink-soft">
                          {b.service_label} · {b.resource_name} · {b.guests} {t('common.guests')}
                          {b.client_phone ? ` · ${formatPhone(b.client_phone)}` : ''}
                        </span>
                      </span>
                      <span className={cn('shrink-0 rounded-md border px-1.5 py-0.5 text-[11px] font-medium', meta.chip)}>
                        {t(`status.${b.status}`)}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{t('dash.network')}</CardTitle>
              </CardHeader>
              <ul className="divide-y divide-line">
                {(overview?.per_location ?? []).map((l) => (
                  <li key={l.id}>
                    <button
                      type="button"
                      onClick={() => setLocationId(l.id)}
                      className={cn(
                        'flex w-full cursor-pointer items-center gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-sunken',
                        l.id === locationId && 'bg-accent-soft/50'
                      )}
                    >
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: l.accent }} aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{l.name}</span>
                      <span className="shrink-0 text-xs tabular text-ink-soft">
                        {l.bookings} {t('dash.bookings').toLowerCase()}
                      </span>
                      {l.hot_tasks > 0 && <Badge tone="clay">{l.hot_tasks}</Badge>}
                    </button>
                  </li>
                ))}
              </ul>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('dash.hotTasks')}</CardTitle>
                <Link to="/tasks" className="flex items-center gap-1 text-xs text-accent underline-offset-4 hover:underline">
                  {t('nav.tasks')} <ArrowRight className="size-3" />
                </Link>
              </CardHeader>
              {hotTasks.length === 0 ? (
                <EmptyState icon={ListTodo} title={t('task.empty')} />
              ) : (
                <ul className="divide-y divide-line">
                  {hotTasks.map((task) => (
                    <li key={task.id} className="flex items-start gap-2.5 px-4 py-2.5">
                      <span
                        className={cn('mt-1 h-3 w-1 shrink-0 rounded-full', TASK_PRIORITY_META[task.priority]?.bar)}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-ink">{task.title}</span>
                        <span className="mt-0.5 block text-xs text-ink-faint">
                          {t(`prio.${task.priority}`)}
                          {task.due_day ? ` · ${task.due_day}` : ''}
                          {task.assignee_name ? ` · ${task.assignee_name}` : ''}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
