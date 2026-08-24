import React, { useCallback, useEffect, useState } from 'react'
import { History, Search, MapPin, ArrowRight } from 'lucide-react'
import { Input } from '@/components/ui/field'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger, Badge, Spinner, EmptyState } from '@/components/ui/misc'
import { get } from '@/lib/api'
import { useSession } from '@/lib/session'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'

const ENTITIES = ['booking', 'break', 'client', 'client_note', 'task', 'shift', 'staff', 'resources', 'services', 'products', 'user']
const ACTIONS = ['create', 'update', 'move', 'cancel', 'delete', 'archive', 'login']

const ACTION_TONE = {
  create: 'accent',
  update: 'neutral',
  move: 'steel',
  cancel: 'clay',
  delete: 'clay',
  archive: 'clay',
  login: 'neutral'
}

/**
 * Who did what, from where. Every write in the API lands here, so a booking
 * made from a forwarded call shows both the venue it belongs to and the venue
 * whose front desk actually took the call.
 */
export default function Activity() {
  const { t } = useI18n()
  const { locationId, location } = useSession()

  const [scope, setScope] = useState('venue')
  const [entity, setEntity] = useState('all')
  const [action, setAction] = useState('all')
  const [q, setQ] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!locationId) return
    setLoading(true)
    const params = new URLSearchParams()
    if (scope === 'all') params.set('scope', 'all')
    if (entity !== 'all') params.set('entity', entity)
    if (action !== 'all') params.set('action', action)
    if (q.trim()) params.set('q', q.trim())
    try {
      setRows(await get(`/audit?${params}`))
    } finally {
      setLoading(false)
    }
  }, [locationId, scope, entity, action, q])

  useEffect(() => {
    const id = setTimeout(load, q ? 250 : 0)
    return () => clearTimeout(id)
  }, [load, q])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-2.5 sm:px-4">
        <div className="min-w-0">
          <h1 className="h-display text-base leading-tight">{t('aud.title')}</h1>
          <p className="truncate text-xs text-ink-faint">
            {scope === 'all' ? t('common.all.locations') : location?.name}
          </p>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Tabs value={scope} onValueChange={setScope}>
            <TabsList>
              <TabsTrigger value="venue" className="px-2.5 py-1 text-[13px]">{t('task.forLocation')}</TabsTrigger>
              <TabsTrigger value="all" className="px-2.5 py-1 text-[13px]">{t('common.all.locations')}</TabsTrigger>
            </TabsList>
          </Tabs>

          <Select value={entity} onValueChange={setEntity}>
            <SelectTrigger className="h-8 w-36 text-[13px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('aud.entity')}: {t('common.all')}</SelectItem>
              {ENTITIES.map((e) => (
                <SelectItem key={e} value={e}>{e}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={action} onValueChange={setAction}>
            <SelectTrigger className="h-8 w-36 text-[13px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('aud.action')}: {t('common.all')}</SelectItem>
              {ACTIONS.map((a) => (
                <SelectItem key={a} value={a}>{t(`aud.action.${a}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('aud.search')} className="h-8 w-full pl-8 sm:w-64" />
          </div>
        </div>
      </header>

      {loading && !rows.length ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-ink-soft">
          <Spinner /> {t('common.loading')}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={History} title={t('aud.empty')} />
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <ul className="divide-y divide-line">
            {rows.map((a) => {
              const forwarded =
                a.actor_location_name && a.target_location_name && a.actor_location_name !== a.target_location_name
              return (
                <li key={a.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-3 py-2.5 hover:bg-sunken/50 sm:px-4">
                  <span className="w-36 shrink-0 text-xs tabular text-ink-faint">{a.created_at}</span>

                  <span className="w-44 shrink-0 truncate text-sm font-medium text-ink" title={a.actor_name}>
                    {a.actor_name}
                  </span>

                  <Badge tone={ACTION_TONE[a.action] ?? 'neutral'} className="shrink-0">
                    {t(`aud.action.${a.action}`) === `aud.action.${a.action}` ? a.action : t(`aud.action.${a.action}`)}
                  </Badge>

                  <span className="shrink-0 rounded-md bg-sunken px-1.5 py-0.5 text-[11px] text-ink-faint">{a.entity}</span>

                  <span className="min-w-0 flex-1 text-sm text-ink-soft">{a.summary}</span>

                  <span className={cn('flex shrink-0 items-center gap-1 text-xs', forwarded ? 'font-medium text-clay' : 'text-ink-faint')}>
                    <MapPin className="size-3" aria-hidden="true" />
                    {a.actor_location_name ?? '—'}
                    {forwarded && (
                      <>
                        <ArrowRight className="size-3" aria-hidden="true" />
                        {a.target_location_name}
                      </>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
