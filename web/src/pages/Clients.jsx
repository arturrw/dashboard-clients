import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, Users, Pin, ChevronRight, Ban } from 'lucide-react'
import { Input } from '@/components/ui/field'
import { Badge, Spinner, EmptyState } from '@/components/ui/misc'
import { formatPhone } from '@/lib/booking'
import { money } from '@/lib/utils'
import { get } from '@/lib/api'
import { useI18n } from '@/i18n'

export default function Clients() {
  const { t } = useI18n()
  const [q, setQ] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (needle) => {
    setLoading(true)
    try {
      setRows(await get(`/clients${needle ? `?q=${encodeURIComponent(needle)}` : ''}`))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const id = setTimeout(() => load(q.trim()), q ? 250 : 0)
    return () => clearTimeout(id)
  }, [q, load])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-2.5 sm:px-4">
        <h1 className="h-display text-base">{t('cl.title')}</h1>
        <span className="text-xs text-ink-faint">
          {rows.length} {t('common.results')}
        </span>
        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('cl.search')}
            className="h-8 w-full pl-8 sm:w-80"
          />
        </div>
      </header>

      {loading && !rows.length ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-ink-soft">
          <Spinner /> {t('common.loading')}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={Users} title={t('common.empty')} body={t('cl.search')} />
      ) : (
        <div className="min-h-0 flex-1 overflow-auto p-3 sm:p-4">
          <ul className="mx-auto grid max-w-5xl gap-2 sm:grid-cols-2">
            {rows.map((c) => (
              <li key={c.id}>
                <Link
                  to={`/clients/${c.id}`}
                  className="group flex items-center gap-3 rounded-xl border border-line bg-surface p-3 shadow-card transition-colors hover:border-line-strong hover:bg-sunken/50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-sm font-medium text-ink">{c.name}</span>
                      {c.is_new && <Badge tone="accent">{t('cl.newBadge')}</Badge>}
                      {Boolean(c.blacklisted) && (
                        <Badge tone="clay">
                          <Ban className="size-3" /> {t('cl.blacklist')}
                        </Badge>
                      )}
                      {c.tags &&
                        c.tags.split(',').filter(Boolean).map((tag) => (
                          <Badge key={tag} tone="gold">{tag}</Badge>
                        ))}
                    </span>
                    <span className="mt-0.5 block text-xs tabular text-ink-soft">{formatPhone(c.phone)}</span>
                    {c.permanent_note && (
                      <span className="mt-1 flex items-start gap-1 text-[11px] font-medium text-clay">
                        <Pin className="mt-px size-3 shrink-0" aria-hidden="true" />
                        <span className="line-clamp-1">{c.permanent_note}</span>
                      </span>
                    )}
                  </span>

                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-semibold tabular text-ink">{c.visits}</span>
                    <span className="block text-[11px] text-ink-faint">{t('cl.visits').toLowerCase()}</span>
                    <span className="mt-0.5 block text-[11px] tabular text-ink-faint">{money(c.spend)}</span>
                  </span>

                  <ChevronRight className="size-4 shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
