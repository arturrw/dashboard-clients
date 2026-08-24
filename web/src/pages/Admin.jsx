import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Lock, Plus, Pencil, Archive, RotateCcw, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Field } from '@/components/ui/field'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, Badge, Spinner, Switch, EmptyState, Hint } from '@/components/ui/misc'
import { get, post, patch, del } from '@/lib/api'
import { useSession } from '@/lib/session'
import { useI18n } from '@/i18n'
import { useToast } from '@/components/Toaster'
import { useConfirm } from '@/components/ConfirmDialog'
import { cn, hhmm, minutesFromHHMM } from '@/lib/utils'

/**
 * Reference data the owner controls. Each tab declares its columns once and the
 * table, the editor dialog and the archive action are generated from that, so a
 * new managed entity is a few lines rather than a new screen.
 */
const TABS = (t) => [
  {
    key: 'staff',
    label: t('adm.staff'),
    path: '/staff',
    columns: [
      { key: 'name', label: t('bk.name'), type: 'text', required: true, grow: true },
      { key: 'role', label: t('adm.role'), type: 'text' },
      { key: 'phone', label: t('bk.phone'), type: 'text', mono: true },
      { key: 'color', label: t('adm.color'), type: 'color' },
      { key: 'sort_order', label: t('adm.sort'), type: 'number', width: 'w-20' }
    ],
    blank: { name: '', role: '', phone: '', color: '#1F3D2E', sort_order: 0 }
  },
  {
    key: 'resources',
    label: t('adm.tables'),
    path: '/resources',
    columns: [
      { key: 'name', label: t('cal.table'), type: 'text', required: true, grow: true },
      { key: 'zone', label: t('cal.zone'), type: 'text' },
      { key: 'seats', label: t('cal.seats'), type: 'number', width: 'w-20' },
      { key: 'sort_order', label: t('adm.sort'), type: 'number', width: 'w-20' }
    ],
    blank: { name: '', zone: '', seats: 2, sort_order: 0 }
  },
  {
    key: 'services',
    label: t('adm.services'),
    path: '/services',
    columns: [
      { key: 'name_en', label: 'EN', type: 'text', required: true, grow: true },
      { key: 'name_lv', label: 'LV', type: 'text', grow: true },
      { key: 'name_ru', label: 'RU', type: 'text', grow: true },
      { key: 'category', label: t('price.category'), type: 'text' },
      { key: 'duration_min', label: t('bk.duration'), type: 'number', width: 'w-24' },
      { key: 'price', label: t('bk.price'), type: 'number', step: '0.01', width: 'w-24' }
    ],
    blank: { name_en: '', name_lv: '', name_ru: '', category: '', duration_min: 90, price: 0, sort_order: 0 }
  },
  {
    key: 'products',
    label: t('adm.products'),
    path: '/products',
    columns: [
      { key: 'sku', label: t('price.sku'), type: 'text', width: 'w-24', mono: true },
      { key: 'name', label: t('price.name'), type: 'text', required: true, grow: true },
      { key: 'category', label: t('price.category'), type: 'text' },
      { key: 'supplier', label: t('price.supplier'), type: 'text' },
      { key: 'unit', label: t('price.unit'), type: 'text', width: 'w-16' },
      { key: 'supply_price', label: t('price.supply'), type: 'number', step: '0.01', width: 'w-24' },
      { key: 'retail_price', label: t('price.retail'), type: 'number', step: '0.01', width: 'w-24' },
      { key: 'stock', label: t('price.stock'), type: 'number', width: 'w-20' },
      { key: 'min_stock', label: t('price.min'), type: 'number', width: 'w-20' }
    ],
    blank: { sku: '', name: '', category: '', supplier: '', unit: 'kg', supply_price: 0, retail_price: 0, stock: 0, min_stock: 0 }
  }
]

export default function Admin() {
  const { t } = useI18n()
  const { isOwner, locations, locationId } = useSession()
  const toast = useToast()
  const confirm = useConfirm()

  const [tab, setTab] = useState('staff')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [showArchived, setShowArchived] = useState(false)
  const [draft, setDraft] = useState(null)

  // Rebuilt only when the language changes: `active` feeds the loader's
  // dependency list, so a fresh object every render would re-fetch forever.
  const tabs = useMemo(() => TABS(t), [t])
  const active = useMemo(() => tabs.find((x) => x.key === tab) ?? tabs[0], [tabs, tab])
  const isSpecial = tab === 'users' || tab === 'locations'

  const load = useCallback(async () => {
    if (!isOwner || !locationId) return
    setLoading(true)
    try {
      const path = tab === 'users' ? '/users' : tab === 'locations' ? '/locations' : active.path
      setRows(await get(`${path}${showArchived && !isSpecial ? '?archived=1' : ''}`))
    } catch {
      toast.error(t('common.error'))
    } finally {
      setLoading(false)
    }
  }, [tab, showArchived, isOwner, locationId, active, isSpecial, toast, t])

  useEffect(() => {
    load()
  }, [load])

  if (!isOwner) {
    return (
      <EmptyState
        icon={Lock}
        title={t('adm.ownerOnly')}
        body={t('adm.ownerOnlyBody')}
      />
    )
  }

  const save = async () => {
    const path = tab === 'users' ? '/users' : tab === 'locations' ? '/locations' : active.path
    try {
      if (draft.id) await patch(`${path}/${draft.id}`, draft)
      else await post(path, draft)
      setDraft(null)
      load()
      toast.success(t('common.save'))
    } catch {
      toast.error(t('common.error'))
    }
  }

  const archive = async (row) => {
    const name = row.name || row.name_en || row.display_name
    const ok = await confirm({
      title: t('adm.archiveTitle', { name }),
      body: t('adm.archiveBody'),
      confirmLabel: t('common.archive'),
      tone: 'danger'
    })
    if (!ok) return
    const path = tab === 'users' ? '/users' : tab === 'locations' ? '/locations' : active.path
    if (tab === 'users') await patch(`${path}/${row.id}`, { archived: 1 })
    else await del(`${path}/${row.id}`)
    load()
  }

  const restore = async (row) => {
    const path = tab === 'users' ? '/users' : tab === 'locations' ? '/locations' : active.path
    await patch(`${path}/${row.id}`, { archived: 0 })
    load()
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-2.5 sm:px-4">
        <h1 className="h-display text-base">{t('adm.title')}</h1>
        <Tabs value={tab} onValueChange={setTab} className="min-w-0 overflow-x-auto">
          <TabsList>
            {tabs.map((x) => (
              <TabsTrigger key={x.key} value={x.key} className="px-2.5 py-1 text-[13px]">{x.label}</TabsTrigger>
            ))}
            <TabsTrigger value="users" className="px-2.5 py-1 text-[13px]">{t('adm.users')}</TabsTrigger>
            <TabsTrigger value="locations" className="px-2.5 py-1 text-[13px]">{t('adm.locations')}</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="ml-auto flex items-center gap-3">
          {!isSpecial && (
            <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-soft">
              <Switch checked={showArchived} onCheckedChange={setShowArchived} />
              {t('adm.archived')}
            </label>
          )}
          <Button
            size="sm"
            onClick={() =>
              setDraft(
                tab === 'users'
                  ? { username: '', password: '', display_name: '', role: 'admin', location_id: locationId }
                  : tab === 'locations'
                    ? { slug: '', name: '', address: '', phone: '', open_min: 600, close_min: 1380, accent: '#1F3D2E' }
                    : { ...active.blank }
              )
            }
          >
            <Plus className="size-4" />
            <span className="hidden sm:inline">{t('common.add')}</span>
          </Button>
        </div>
      </header>

      {loading && !rows.length ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-ink-soft">
          <Spinner /> {t('common.loading')}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[46rem] text-sm">
            <thead className="sticky top-0 z-10 bg-sunken text-[11px] uppercase tracking-[0.06em] text-ink-faint">
              <tr>
                {tab === 'users' ? (
                  <>
                    <th className="px-3 py-2 text-left font-medium">{t('auth.username')}</th>
                    <th className="px-3 py-2 text-left font-medium">{t('bk.name')}</th>
                    <th className="px-3 py-2 text-left font-medium">{t('adm.role')}</th>
                    <th className="px-3 py-2 text-left font-medium">{t('loc.switch')}</th>
                  </>
                ) : tab === 'locations' ? (
                  <>
                    <th className="px-3 py-2 text-left font-medium">{t('bk.name')}</th>
                    <th className="px-3 py-2 text-left font-medium">{t('price.category')}</th>
                    <th className="px-3 py-2 text-left font-medium">{t('bk.phone')}</th>
                    <th className="px-3 py-2 text-left font-medium">{t('adm.openHours')}</th>
                  </>
                ) : (
                  active.columns.map((c) => (
                    <th key={c.key} className={cn('px-3 py-2 text-left font-medium', c.width)}>{c.label}</th>
                  ))
                )}
                <th className="w-20 px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={cn('border-b border-line hover:bg-sunken/60', r.archived && 'opacity-50')}>
                  {tab === 'users' ? (
                    <>
                      <td className="px-3 py-1.5 tabular text-ink">{r.username}</td>
                      <td className="px-3 py-1.5 text-ink-soft">{r.display_name}</td>
                      <td className="px-3 py-1.5">
                        <Badge tone={r.role === 'owner' ? 'gold' : 'neutral'}>
                          {r.role === 'owner' ? t('auth.owner') : t('auth.admin')}
                        </Badge>
                      </td>
                      <td className="px-3 py-1.5 text-ink-soft">{r.location_name ?? '—'}</td>
                    </>
                  ) : tab === 'locations' ? (
                    <>
                      <td className="px-3 py-1.5">
                        <span className="flex items-center gap-2">
                          <span className="size-2.5 rounded-full" style={{ background: r.accent }} aria-hidden="true" />
                          <span className="font-medium text-ink">{r.name}</span>
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-ink-soft">{r.address}</td>
                      <td className="px-3 py-1.5 tabular text-ink-soft">{r.phone}</td>
                      <td className="px-3 py-1.5 tabular text-ink-soft">{hhmm(r.open_min)}–{hhmm(r.close_min)}</td>
                    </>
                  ) : (
                    active.columns.map((c) => (
                      <td key={c.key} className={cn('px-3 py-1.5', c.mono && 'tabular', c.key === active.columns[0].key ? 'font-medium text-ink' : 'text-ink-soft')}>
                        {c.type === 'color' ? (
                          <span className="flex items-center gap-1.5">
                            <span className="size-3 rounded-full border border-line" style={{ background: r[c.key] }} />
                            <span className="tabular text-xs">{r[c.key]}</span>
                          </span>
                        ) : (
                          String(r[c.key] ?? '')
                        )}
                      </td>
                    ))
                  )}

                  <td className="px-2 py-1.5">
                    <span className="flex justify-end gap-0.5">
                      <Hint label={t('common.edit')}>
                        <button
                          type="button"
                          onClick={() => setDraft({ ...r, password: '' })}
                          className="cursor-pointer rounded p-1 text-ink-faint transition-colors hover:bg-sunken hover:text-ink"
                          aria-label={t('common.edit')}
                        >
                          <Pencil className="size-3.5" />
                        </button>
                      </Hint>
                      {r.archived ? (
                        <Hint label={t('adm.restore')}>
                          <button type="button" onClick={() => restore(r)} className="cursor-pointer rounded p-1 text-accent hover:bg-accent-soft" aria-label={t('adm.restore')}>
                            <RotateCcw className="size-3.5" />
                          </button>
                        </Hint>
                      ) : (
                        <Hint label={t('common.archive')}>
                          <button type="button" onClick={() => archive(r)} className="cursor-pointer rounded p-1 text-ink-faint hover:bg-clay-soft hover:text-clay" aria-label={t('common.archive')}>
                            <Archive className="size-3.5" />
                          </button>
                        </Hint>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={Boolean(draft)} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="w-[min(94vw,34rem)]">
          <DialogHeader>
            <DialogTitle>{draft?.id ? t('common.edit') : t('common.add')}</DialogTitle>
          </DialogHeader>
          <DialogBody className="grid gap-3 sm:grid-cols-2">
            {tab === 'users' ? (
              <>
                <Field label={t('auth.username')} required>
                  <Input
                    value={draft?.username ?? ''}
                    disabled={Boolean(draft?.id)}
                    onChange={(e) => setDraft((d) => ({ ...d, username: e.target.value }))}
                  />
                </Field>
                <Field label={t('bk.name')}>
                  <Input value={draft?.display_name ?? ''} onChange={(e) => setDraft((d) => ({ ...d, display_name: e.target.value }))} />
                </Field>
                <Field label={t('adm.password')} hint={draft?.id ? t('adm.passwordHint') : undefined} required={!draft?.id}>
                  <Input type="password" value={draft?.password ?? ''} onChange={(e) => setDraft((d) => ({ ...d, password: e.target.value }))} />
                </Field>
                <Field label={t('adm.role')}>
                  <Select value={draft?.role ?? 'admin'} onValueChange={(v) => setDraft((d) => ({ ...d, role: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">{t('auth.admin')}</SelectItem>
                      <SelectItem value="owner">{t('auth.owner')}</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={t('loc.switch')} className="sm:col-span-2">
                  <Select
                    value={draft?.location_id ? String(draft.location_id) : 'none'}
                    onValueChange={(v) => setDraft((d) => ({ ...d, location_id: v === 'none' ? null : Number(v) }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t('common.none')}</SelectItem>
                      {locations.map((l) => (
                        <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </>
            ) : tab === 'locations' ? (
              <>
                <Field label={t('bk.name')} required>
                  <Input value={draft?.name ?? ''} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
                </Field>
                <Field label="slug" required>
                  <Input value={draft?.slug ?? ''} onChange={(e) => setDraft((d) => ({ ...d, slug: e.target.value }))} className="tabular" />
                </Field>
                <Field label={t('price.category')} className="sm:col-span-2">
                  <Input value={draft?.address ?? ''} onChange={(e) => setDraft((d) => ({ ...d, address: e.target.value }))} />
                </Field>
                <Field label={t('bk.phone')}>
                  <Input value={draft?.phone ?? ''} onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))} className="tabular" />
                </Field>
                <Field label={t('adm.color')}>
                  <Input type="color" value={draft?.accent ?? '#1F3D2E'} onChange={(e) => setDraft((d) => ({ ...d, accent: e.target.value }))} className="h-9 px-1" />
                </Field>
                <Field label={`${t('adm.openHours')} — ${t('bk.from')}`}>
                  <Input
                    type="time" step="900"
                    value={hhmm(draft?.open_min ?? 600)}
                    onChange={(e) => setDraft((d) => ({ ...d, open_min: minutesFromHHMM(e.target.value) }))}
                    className="tabular"
                  />
                </Field>
                <Field label={`${t('adm.openHours')} — ${t('bk.to')}`}>
                  <Input
                    type="time" step="900"
                    value={hhmm(draft?.close_min ?? 1380)}
                    onChange={(e) => setDraft((d) => ({ ...d, close_min: minutesFromHHMM(e.target.value) }))}
                    className="tabular"
                  />
                </Field>
              </>
            ) : (
              active.columns.map((c) => (
                <Field key={c.key} label={c.label} required={c.required} className={c.grow ? 'sm:col-span-2' : undefined}>
                  <Input
                    type={c.type === 'color' ? 'color' : c.type === 'number' ? 'number' : 'text'}
                    step={c.step}
                    value={draft?.[c.key] ?? ''}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, [c.key]: c.type === 'number' ? Number(e.target.value) : e.target.value }))
                    }
                    className={cn(c.type === 'color' && 'h-9 px-1', c.type === 'number' && 'tabular')}
                  />
                </Field>
              ))
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>{t('common.cancel')}</Button>
            <Button onClick={save}>
              <Save className="size-4" />
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
