import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, CalendarRange, Wand2, Eraser } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Field } from '@/components/ui/field'
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Spinner, EmptyState } from '@/components/ui/misc'
import { TimeField } from '@/components/ui/time-picker'
import { get, put, del } from '@/lib/api'
import { useSession } from '@/lib/session'
import { useI18n } from '@/i18n'
import { useToast } from '@/components/Toaster'
import { useConfirm } from '@/components/ConfirmDialog'
import { cn, hhmm, isoDay, minutesFromHHMM, pad } from '@/lib/utils'

const shiftMonth = (month, delta) => {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

/**
 * Staff rota for a whole month. Filling a month ahead is the common case, so
 * the bulk action applies one pattern to every remaining day at once and the
 * grid stays editable cell by cell afterwards.
 */
export default function Rota() {
  const { t, locale } = useI18n()
  const { locationId, location } = useSession()
  const toast = useToast()
  const confirm = useConfirm()

  const [month, setMonth] = useState(() => isoDay(new Date()).slice(0, 7))
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [cell, setCell] = useState(null)
  const [bulk, setBulk] = useState(null)

  const load = useCallback(async () => {
    if (!locationId) return
    setLoading(true)
    try {
      setData(await get(`/month?month=${month}`))
    } finally {
      setLoading(false)
    }
  }, [month, locationId])

  useEffect(() => {
    load()
  }, [load])

  const days = useMemo(() => {
    const [y, m] = month.split('-').map(Number)
    const count = new Date(y, m, 0).getDate()
    return Array.from({ length: count }, (_, i) => `${month}-${pad(i + 1)}`)
  }, [month])

  const shiftMap = useMemo(() => {
    const map = new Map()
    for (const s of data?.shifts ?? []) map.set(`${s.staff_id}:${s.day}`, s)
    return map
  }, [data])

  const saveCell = async () => {
    const start = minutesFromHHMM(cell.start)
    const end = minutesFromHHMM(cell.end)
    if (end <= start) return
    await put('/shifts', { staff_id: cell.staff_id, day: cell.day, start_min: start, end_min: end })
    setCell(null)
    load()
  }

  const clearCell = async () => {
    await del(`/shifts?staff_id=${cell.staff_id}&day=${cell.day}`)
    setCell(null)
    load()
  }

  const applyBulk = async () => {
    const start = minutesFromHHMM(bulk.start)
    const end = minutesFromHHMM(bulk.end)
    if (end <= start) return
    const today = isoDay(new Date())
    const targets = days.filter((d) => d >= (month === today.slice(0, 7) ? today : d))
    const ok = await confirm({
      title: t('rota.apply'),
      body: `${bulk.staffName} · ${targets.length} × ${bulk.start}–${bulk.end}`,
      confirmLabel: t('common.confirm')
    })
    if (!ok) return
    setBulk(null)
    for (const day of targets) {
      // Weekly rest day stays untouched by the bulk fill.
      if (bulk.skipWeekday !== '' && new Date(`${day}T00:00:00`).getDay() === Number(bulk.skipWeekday)) continue
      await put('/shifts', { staff_id: bulk.staff_id, day, start_min: start, end_min: end })
    }
    toast.success(t('common.save'))
    load()
  }

  const today = isoDay(new Date())
  const staff = data?.staff ?? []

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-2.5 sm:px-4">
        <Button variant="outline" size="icon-sm" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month">
          <ChevronLeft className="size-4" />
        </Button>
        <h1 className="h-display min-w-[9rem] text-base capitalize">
          {new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(new Date(`${month}-01T00:00:00`))}
        </h1>
        <Button variant="outline" size="icon-sm" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month">
          <ChevronRight className="size-4" />
        </Button>
        <p className="hidden text-xs text-ink-faint sm:block">{location?.name} · {t('rota.hint')}</p>
        {loading && <Spinner />}
      </header>

      {staff.length === 0 && !loading ? (
        <EmptyState icon={CalendarRange} title={t('common.empty')} />
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="min-w-max border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-20 border-b border-r border-line bg-surface px-3 py-2 text-left text-[11px] font-medium uppercase tracking-[0.06em] text-ink-faint">
                  {t('adm.staff')}
                </th>
                {days.map((d) => {
                  const date = new Date(`${d}T00:00:00`)
                  const weekend = [0, 6].includes(date.getDay())
                  return (
                    <th
                      key={d}
                      className={cn(
                        'sticky top-0 z-10 w-11 border-b border-r border-line px-1 py-1 text-center text-[11px] font-medium',
                        weekend ? 'bg-sunken text-ink-faint' : 'bg-surface text-ink-soft',
                        d === today && 'bg-clay-soft text-clay'
                      )}
                    >
                      <span className="block tabular">{Number(d.slice(-2))}</span>
                      <span className="block text-[9px] uppercase opacity-70">
                        {new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(date)}
                      </span>
                    </th>
                  )
                })}
                <th className="sticky top-0 z-10 border-b border-line bg-surface px-2" />
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.id}>
                  <th className="sticky left-0 z-10 border-b border-r border-line bg-surface px-3 py-1.5 text-left font-medium">
                    <span className="flex items-center gap-2">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: s.color }} aria-hidden="true" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-ink">{s.name}</span>
                        <span className="block truncate text-[11px] font-normal text-ink-faint">{s.role}</span>
                      </span>
                    </span>
                  </th>

                  {days.map((d) => {
                    const shift = shiftMap.get(`${s.id}:${d}`)
                    const weekend = [0, 6].includes(new Date(`${d}T00:00:00`).getDay())
                    return (
                      <td key={d} className={cn('border-b border-r border-line p-0', weekend && 'bg-sunken/50')}>
                        <button
                          type="button"
                          onClick={() =>
                            setCell({
                              staff_id: s.id,
                              staffName: s.name,
                              day: d,
                              start: shift ? hhmm(shift.start_min) : '10:00',
                              end: shift ? hhmm(shift.end_min) : '22:00',
                              exists: Boolean(shift)
                            })
                          }
                          className={cn(
                            'flex h-11 w-11 cursor-pointer flex-col items-center justify-center text-[10px] leading-tight transition-colors hover:bg-accent-soft',
                            shift ? 'font-medium text-ink' : 'text-ink-faint'
                          )}
                          title={shift ? `${s.name} ${hhmm(shift.start_min)}–${hhmm(shift.end_min)}` : t('rota.off')}
                        >
                          {shift ? (
                            <>
                              <span className="tabular">{hhmm(shift.start_min)}</span>
                              <span className="tabular opacity-60">{hhmm(shift.end_min)}</span>
                            </>
                          ) : (
                            '·'
                          )}
                        </button>
                      </td>
                    )
                  })}

                  <td className="border-b border-line px-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setBulk({ staff_id: s.id, staffName: s.name, start: '10:00', end: '22:00', skipWeekday: '1' })}
                      aria-label={t('rota.bulk')}
                      title={t('rota.bulk')}
                    >
                      <Wand2 className="size-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={Boolean(cell)} onOpenChange={(o) => !o && setCell(null)}>
        <DialogContent className="w-[min(94vw,24rem)]">
          <DialogHeader>
            <DialogTitle>{t('rota.setShift')}</DialogTitle>
            <DialogDescription>{cell?.staffName} · {cell?.day}</DialogDescription>
          </DialogHeader>
          <DialogBody className="grid grid-cols-2 gap-3">
            <Field label={t('bk.from')}>
              <TimeField value={cell?.start ?? ''} onChange={(v) => setCell((c) => ({ ...c, start: v }))} minuteStep={15} />
            </Field>
            <Field label={t('bk.to')}>
              <TimeField value={cell?.end ?? ''} onChange={(v) => setCell((c) => ({ ...c, end: v }))} minuteStep={15} />
            </Field>
          </DialogBody>
          <DialogFooter>
            {cell?.exists && (
              <Button variant="danger-outline" onClick={clearCell} className="mr-auto">
                <Eraser className="size-4" />
                {t('rota.clear')}
              </Button>
            )}
            <Button variant="outline" onClick={() => setCell(null)}>{t('common.cancel')}</Button>
            <Button onClick={saveCell}>{t('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(bulk)} onOpenChange={(o) => !o && setBulk(null)}>
        <DialogContent className="w-[min(94vw,26rem)]">
          <DialogHeader>
            <DialogTitle>{t('rota.bulk')}</DialogTitle>
            <DialogDescription>{bulk?.staffName} · {t('rota.bulkHint')}</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('bk.from')}>
                <TimeField value={bulk?.start ?? ''} onChange={(v) => setBulk((b) => ({ ...b, start: v }))} minuteStep={15} />
              </Field>
              <Field label={t('bk.to')}>
                <TimeField value={bulk?.end ?? ''} onChange={(v) => setBulk((b) => ({ ...b, end: v }))} minuteStep={15} />
              </Field>
            </div>
            <Field label={t('rota.off')}>
              <select
                value={bulk?.skipWeekday ?? ''}
                onChange={(e) => setBulk((b) => ({ ...b, skipWeekday: e.target.value }))}
                className="h-9 w-full cursor-pointer rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink"
              >
                <option value="">{t('common.none')}</option>
                {[1, 2, 3, 4, 5, 6, 0].map((wd) => (
                  <option key={wd} value={wd}>
                    {new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(new Date(2024, 0, 1 + ((wd + 6) % 7)))}
                  </option>
                ))}
              </select>
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulk(null)}>{t('common.cancel')}</Button>
            <Button onClick={applyBulk}>{t('rota.apply')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
