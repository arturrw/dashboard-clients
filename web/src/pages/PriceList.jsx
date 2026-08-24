import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Search, PackageMinus, Receipt, Pencil, Check, X } from 'lucide-react'
import { Input } from '@/components/ui/field'
import { Button } from '@/components/ui/button'
import { Badge, Spinner, EmptyState, Hint } from '@/components/ui/misc'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { cn, money } from '@/lib/utils'
import { get, patch } from '@/lib/api'
import { useSession } from '@/lib/session'
import { useI18n } from '@/i18n'
import { useToast } from '@/components/Toaster'

/**
 * What the admin opens when a delivery arrives: search the item, read the
 * agreed supply price, and see instantly whether stock is under the minimum.
 */
export default function PriceList() {
  const { t } = useI18n()
  const { locationId, location, isOwner } = useSession()
  const toast = useToast()

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('all')
  const [editing, setEditing] = useState(null)

  const load = useCallback(async () => {
    if (!locationId) return
    setLoading(true)
    try {
      setRows(await get('/products'))
    } finally {
      setLoading(false)
    }
  }, [locationId])

  useEffect(() => {
    load()
  }, [load])

  const categories = useMemo(
    () => ['all', ...Array.from(new Set(rows.map((r) => r.category).filter(Boolean))).sort()],
    [rows]
  )

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter((r) => {
      if (category !== 'all' && r.category !== category) return false
      if (!needle) return true
      return [r.name, r.sku, r.supplier, r.category].some((v) => String(v || '').toLowerCase().includes(needle))
    })
  }, [rows, q, category])

  const lowCount = useMemo(() => rows.filter((r) => r.stock < r.min_stock).length, [rows])

  const saveEdit = async () => {
    try {
      await patch(`/products/${editing.id}`, {
        supply_price: Number(editing.supply_price),
        retail_price: Number(editing.retail_price),
        stock: Number(editing.stock),
        min_stock: Number(editing.min_stock)
      })
      setEditing(null)
      load()
      toast.success(t('common.save'))
    } catch {
      toast.error(t('common.error'))
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-2.5 sm:px-4">
        <div className="min-w-0">
          <h1 className="h-display text-base leading-tight">{t('price.title')}</h1>
          <p className="truncate text-xs text-ink-faint">{location?.name}</p>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {lowCount > 0 && (
            <span className="flex items-center gap-1.5 rounded-md bg-clay-soft px-2 py-1 text-xs font-medium text-clay">
              <PackageMinus className="size-3.5" aria-hidden="true" />
              {lowCount} {t('price.low').toLowerCase()}
            </span>
          )}
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-8 w-40 text-[13px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>{c === 'all' ? t('common.all') : c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('price.search')}
              className="h-8 w-full pl-8 sm:w-72"
            />
          </div>
        </div>
      </header>

      {loading && !rows.length ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-ink-soft">
          <Spinner /> {t('common.loading')}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Receipt} title={t('common.empty')} body={t('price.search')} />
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[54rem] text-sm">
            <thead className="sticky top-0 z-10 bg-sunken text-[11px] uppercase tracking-[0.06em] text-ink-faint">
              <tr>
                <th className="w-24 px-3 py-2 text-left font-medium">{t('price.sku')}</th>
                <th className="px-3 py-2 text-left font-medium">{t('price.name')}</th>
                <th className="w-32 px-3 py-2 text-left font-medium">{t('price.category')}</th>
                <th className="w-40 px-3 py-2 text-left font-medium">{t('price.supplier')}</th>
                <th className="w-16 px-3 py-2 text-right font-medium">{t('price.unit')}</th>
                <th className="w-28 px-3 py-2 text-right font-medium">{t('price.supply')}</th>
                <th className="w-28 px-3 py-2 text-right font-medium">{t('price.retail')}</th>
                <th className="w-28 px-3 py-2 text-right font-medium">{t('price.stock')}</th>
                {isOwner && <th className="w-12" />}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const low = r.stock < r.min_stock
                const isEditing = editing?.id === r.id
                const margin = r.retail_price > 0 ? ((r.retail_price - r.supply_price) / r.retail_price) * 100 : null
                return (
                  <tr key={r.id} className={cn('border-b border-line transition-colors hover:bg-sunken/60', low && 'bg-clay-soft/30')}>
                    <td className="px-3 py-1.5 text-xs tabular text-ink-faint">{r.sku}</td>
                    <td className="px-3 py-1.5 font-medium text-ink">{r.name}</td>
                    <td className="px-3 py-1.5 text-ink-soft">{r.category}</td>
                    <td className="px-3 py-1.5 text-ink-soft">{r.supplier}</td>
                    <td className="px-3 py-1.5 text-right text-ink-faint">{r.unit}</td>

                    <td className="px-3 py-1.5 text-right tabular">
                      {isEditing ? (
                        <input
                          type="number" step="0.01" value={editing.supply_price}
                          onChange={(e) => setEditing((d) => ({ ...d, supply_price: e.target.value }))}
                          className="w-20 rounded border border-accent bg-surface px-1 py-0.5 text-right tabular outline-none"
                        />
                      ) : (
                        <span className="font-semibold text-ink">{money(r.supply_price)}</span>
                      )}
                    </td>

                    <td className="px-3 py-1.5 text-right tabular">
                      {isEditing ? (
                        <input
                          type="number" step="0.01" value={editing.retail_price}
                          onChange={(e) => setEditing((d) => ({ ...d, retail_price: e.target.value }))}
                          className="w-20 rounded border border-accent bg-surface px-1 py-0.5 text-right tabular outline-none"
                        />
                      ) : r.retail_price > 0 ? (
                        <Hint label={`${t('price.margin')} ${margin.toFixed(0)}%`}>
                          <span className="text-ink-soft">{money(r.retail_price)}</span>
                        </Hint>
                      ) : (
                        <span className="text-ink-faint">—</span>
                      )}
                    </td>

                    <td className="px-3 py-1.5 text-right tabular">
                      {isEditing ? (
                        <input
                          type="number" value={editing.stock}
                          onChange={(e) => setEditing((d) => ({ ...d, stock: e.target.value }))}
                          className="w-16 rounded border border-accent bg-surface px-1 py-0.5 text-right tabular outline-none"
                        />
                      ) : (
                        <span className={cn(low ? 'font-semibold text-clay' : 'text-ink-soft')}>
                          {r.stock}
                          <span className="ml-1 text-xs text-ink-faint">/ {r.min_stock}</span>
                        </span>
                      )}
                    </td>

                    {isOwner && (
                      <td className="px-2 py-1.5 text-center">
                        {isEditing ? (
                          <span className="flex gap-0.5">
                            <button type="button" onClick={saveEdit} className="cursor-pointer rounded p-1 text-accent hover:bg-accent-soft" aria-label={t('common.save')}>
                              <Check className="size-3.5" />
                            </button>
                            <button type="button" onClick={() => setEditing(null)} className="cursor-pointer rounded p-1 text-ink-faint hover:bg-sunken" aria-label={t('common.cancel')}>
                              <X className="size-3.5" />
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setEditing({ ...r })}
                            className="cursor-pointer rounded p-1 text-ink-faint transition-colors hover:bg-sunken hover:text-ink"
                            aria-label={t('common.edit')}
                          >
                            <Pencil className="size-3.5" />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>

          {!isOwner && (
            <p className="px-4 py-3 text-xs text-ink-faint">{t('price.readonly')}</p>
          )}
        </div>
      )}
    </div>
  )
}
