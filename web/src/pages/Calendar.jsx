import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, Coffee, CalendarDays, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Field } from '@/components/ui/field'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, Spinner, Badge, Hint } from '@/components/ui/misc'
import { TimeField } from '@/components/ui/time-picker'
import DayGrid from '@/components/calendar/DayGrid'
import MonthView from '@/components/calendar/MonthView'
import BookingDialog from '@/components/BookingDialog'
import LocationSwitcher from '@/components/LocationSwitcher'
import { useSession } from '@/lib/session'
import { useI18n } from '@/i18n'
import { useToast } from '@/components/Toaster'
import { useConfirm } from '@/components/ConfirmDialog'
import { get, patch, post, del } from '@/lib/api'
import { addDays, hhmm, isoDay, minutesFromHHMM, cn } from '@/lib/utils'

export default function Calendar() {
  const { t, locale } = useI18n()
  const { locationId, location } = useSession()
  const toast = useToast()
  const confirm = useConfirm()

  const [day, setDay] = useState(() => isoDay(new Date()))
  const [view, setView] = useState('day')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(() => new Date())

  const [dialog, setDialog] = useState(null) // { bookingId } | { draft }
  const [breakDraft, setBreakDraft] = useState(null)

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const load = useCallback(async () => {
    if (!locationId) return
    setLoading(true)
    try {
      setData(await get(`/day?day=${day}`))
    } catch {
      toast.error(t('common.error'))
    } finally {
      setLoading(false)
    }
  }, [day, locationId, toast, t])

  useEffect(() => {
    load()
  }, [load])

  const isToday = day === isoDay(now)
  const nowMinutes = isToday ? now.getHours() * 60 + now.getMinutes() : null

  const dayLabel = useMemo(() => {
    const d = new Date(`${day}T00:00:00`)
    return new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(d)
  }, [day, locale])

  /* ------------------------- drag → confirm → persist ------------------------ */

  const proposeMove = useCallback(
    async ({ kind, item, next }) => {
      const from = `${hhmm(item.start_min)}–${hhmm(item.end_min)}`
      const to = `${hhmm(next.start_min)}–${hhmm(next.end_min)}`
      const changedTable = next.resource_id !== item.resource_id
      const resized = !changedTable && next.start_min === item.start_min

      const tableName = data?.resources.find((r) => r.id === next.resource_id)?.name
      const ok = await confirm({
        title: resized
          ? t('cal.resizeTitle')
          : kind === 'break'
            ? t('cal.moveBreakTitle')
            : t('cal.moveTitle'),
        body: resized
          ? t('cal.resizeBody', { to })
          : `${t('cal.moveBody', { from, to })}${changedTable ? ` → ${tableName}` : ''}`,
        confirmLabel: t('common.confirm')
      })
      if (!ok) return

      const endpoint = kind === 'break' ? `/breaks/${item.id}` : `/bookings/${item.id}`
      const send = (force) => patch(endpoint, { ...next, force })

      try {
        try {
          await send(false)
        } catch (err) {
          if (err.code !== 'conflict') throw err
          const c = err.conflict
          const override = await confirm({
            title: t('cal.conflictTitle'),
            body: t('cal.conflictBody', { label: c.label, time: `${hhmm(c.start_min)}–${hhmm(c.end_min)}` }),
            confirmLabel: t('cal.conflictOverride'),
            cancelLabel: t('cal.conflictPick'),
            tone: 'danger'
          })
          if (!override) return
          await send(true)
        }
        toast.success(to)
        load()
      } catch {
        toast.error(t('common.error'))
        load()
      }
    },
    [confirm, data, load, t, toast]
  )

  const saveBreak = async () => {
    const start = minutesFromHHMM(breakDraft.start)
    const end = minutesFromHHMM(breakDraft.end)
    if (end <= start) return
    try {
      await post('/breaks', {
        location_id: locationId,
        resource_id: Number(breakDraft.resource_id),
        day,
        start_min: start,
        end_min: end,
        title: breakDraft.title || t('cal.break')
      })
      setBreakDraft(null)
      toast.success(t('brk.title'))
      load()
    } catch (err) {
      if (err.code === 'conflict') toast.error(t('cal.conflictTitle'))
      else toast.error(t('common.error'))
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-2.5 sm:px-4">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" onClick={() => setDay(addDays(day, -1))} aria-label="Previous day">
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setDay(isoDay(new Date()))} className={cn(isToday && 'border-accent text-accent')}>
            {t('common.today')}
          </Button>
          <Button variant="outline" size="icon-sm" onClick={() => setDay(addDays(day, 1))} aria-label="Next day">
            <ChevronRight className="size-4" />
          </Button>
        </div>

        <label className="relative flex cursor-pointer items-center">
          <CalendarDays className="pointer-events-none absolute left-2.5 size-4 text-ink-faint" />
          <input
            type="date"
            value={day}
            onChange={(e) => e.target.value && setDay(e.target.value)}
            className="h-8 cursor-pointer rounded-lg border border-line-strong bg-surface pl-8 pr-2 text-sm tabular text-ink transition-colors hover:bg-sunken"
          />
        </label>

        <div className="min-w-0">
          <h1 className="h-display truncate text-base capitalize leading-tight">{dayLabel}</h1>
          <p className="truncate text-xs text-ink-faint">
            {location?.name} · {hhmm(location?.open_min ?? 600)}–{hhmm(location?.close_min ?? 1380)}
          </p>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <LocationSwitcher />

          <Tabs value={view} onValueChange={setView}>
            <TabsList>
              <TabsTrigger value="day" className="px-2.5 py-1 text-[13px]">{t('cal.day')}</TabsTrigger>
              <TabsTrigger value="month" className="px-2.5 py-1 text-[13px]">{t('cal.month')}</TabsTrigger>
            </TabsList>
          </Tabs>

          <Hint label={t('common.retry')}>
            <Button variant="ghost" size="icon-sm" onClick={load} aria-label={t('common.retry')}>
              <RotateCw className={cn('size-4', loading && 'animate-spin')} />
            </Button>
          </Hint>

          {view === 'day' && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setBreakDraft({
                    resource_id: data?.resources?.[0]?.id ?? '',
                    start: hhmm(location?.open_min ?? 600),
                    end: hhmm((location?.open_min ?? 600) + 60),
                    title: t('cal.break')
                  })
                }
                disabled={!data?.resources?.length}
              >
                <Coffee className="size-4" />
                <span className="hidden sm:inline">{t('cal.addBreak')}</span>
              </Button>
              <Button size="sm" onClick={() => setDialog({ draft: { day, start_min: nowMinutes ?? location?.open_min ?? 720 } })}>
                <Plus className="size-4" />
                <span className="hidden sm:inline">{t('cal.newBooking')}</span>
              </Button>
            </>
          )}
        </div>
      </header>

      {view === 'day' && (
        <p className="shrink-0 border-b border-line bg-canvas px-4 py-1 text-[11px] text-ink-faint">
          {t('cal.dragHint')}
        </p>
      )}

      <div className="min-h-0 flex-1">
        {loading && !data ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-ink-soft">
            <Spinner /> {t('common.loading')}
          </div>
        ) : view === 'month' ? (
          <MonthView
            day={day}
            onPickDay={(d) => {
              setDay(d)
              setView('day')
            }}
          />
        ) : (
          data && (
            <DayGrid
              day={day}
              location={data.location}
              resources={data.resources}
              bookings={data.bookings}
              breaks={data.breaks}
              shifts={data.shifts}
              staff={data.staff}
              nowMinutes={nowMinutes}
              onOpenBooking={(b) => setDialog({ bookingId: b.id })}
              onCreateAt={(draft) => setDialog({ draft: { ...draft, day } })}
              onProposeMove={proposeMove}
            />
          )
        )}
      </div>

      <BookingDialog
        open={Boolean(dialog)}
        onOpenChange={(o) => !o && setDialog(null)}
        bookingId={dialog?.bookingId}
        draft={dialog?.draft}
        context={data}
        onSaved={load}
      />

      <Dialog open={Boolean(breakDraft)} onOpenChange={(o) => !o && setBreakDraft(null)}>
        <DialogContent className="w-[min(94vw,26rem)]">
          <DialogHeader>
            <DialogTitle>{t('brk.new')}</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <Field label={t('brk.name')}>
              <Input value={breakDraft?.title ?? ''} onChange={(e) => setBreakDraft((d) => ({ ...d, title: e.target.value }))} />
            </Field>
            <Field label={t('cal.table')}>
              <Select
                value={breakDraft?.resource_id ? String(breakDraft.resource_id) : ''}
                onValueChange={(v) => setBreakDraft((d) => ({ ...d, resource_id: Number(v) }))}
              >
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {(data?.resources ?? []).map((r) => (
                    <SelectItem key={r.id} value={String(r.id)}>{r.name} · {r.zone}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('bk.from')}>
                <TimeField value={breakDraft?.start ?? ''} onChange={(v) => setBreakDraft((d) => ({ ...d, start: v }))} />
              </Field>
              <Field label={t('bk.to')}>
                <TimeField value={breakDraft?.end ?? ''} onChange={(v) => setBreakDraft((d) => ({ ...d, end: v }))} />
              </Field>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBreakDraft(null)}>{t('common.cancel')}</Button>
            <Button onClick={saveBreak}>{t('common.create')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
