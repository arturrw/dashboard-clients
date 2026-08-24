import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Phone, User, Plus, Trash2, ChevronDown, ChevronRight, Pin, Sparkles,
  History, Ban, ExternalLink, Clock, MapPin, Building2
} from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle, DialogDescription
} from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input, Textarea, Field, Label } from '@/components/ui/field'
import { Badge, Spinner, Separator } from '@/components/ui/misc'
import { TimeField } from '@/components/ui/time-picker'
import { STATUSES, IMPORTANCES, STATUS_META, formatPhone } from '@/lib/booking'
import { cn, hhmm, minutesFromHHMM, money } from '@/lib/utils'
import { get, post, patch } from '@/lib/api'
import { useI18n, serviceName } from '@/i18n'
import { useSession } from '@/lib/session'
import { useToast } from '@/components/Toaster'
import { useConfirm } from '@/components/ConfirmDialog'

const EMPTY = {
  phone: '', name: '', guests: 2, resource_id: null, staff_id: null,
  status: 'booked', importance: 'normal', note: '', permanent_note: '',
  discount_type: '', discount_reason: '', discount_value: 0,
  gift_card: '', welcome_drink: '', deposit: 0, source: 'phone', services: []
}

export default function BookingDialog({ open, onOpenChange, draft, bookingId, context, onSaved }) {
  const { t, lang } = useI18n()
  const { locationId, location, locations } = useSession()
  const toast = useToast()
  const confirm = useConfirm()

  const [form, setForm] = useState(EMPTY)
  const [day, setDay] = useState(draft?.day ?? context?.day ?? '')
  // The venue this booking belongs to, independent of the diary being viewed:
  // a forwarded call can be seated anywhere without leaving the current day.
  const [targetLocationId, setTargetLocationId] = useState(locationId)
  const [remoteContext, setRemoteContext] = useState(null)
  const [ctxLoading, setCtxLoading] = useState(false)
  const [startLabel, setStartLabel] = useState('12:00')
  const [endLabel, setEndLabel] = useState('13:30')
  const [loaded, setLoaded] = useState(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showDetails, setShowDetails] = useState(false)

  const [matches, setMatches] = useState([])
  const [matchOpen, setMatchOpen] = useState(false)
  const [linkedClient, setLinkedClient] = useState(null)
  const [lookupBusy, setLookupBusy] = useState(false)

  const isEdit = Boolean(bookingId)
  const set = useCallback((patchObj) => setForm((f) => ({ ...f, ...patchObj })), [])

  /* --------------------------------- loading -------------------------------- */

  useEffect(() => {
    if (!open) return
    setShowDetails(false)
    setMatchOpen(false)
    setMatches([])

    if (bookingId) {
      setLoading(true)
      get(`/bookings/${bookingId}`)
        .then((b) => {
          setLoaded(b)
          setTargetLocationId(b.location_id)
          setDay(b.day)
          setStartLabel(hhmm(b.start_min))
          setEndLabel(hhmm(b.end_min))
          setForm({
            phone: b.client_phone ?? '', name: b.client_name ?? '', guests: b.guests,
            resource_id: b.resource_id, staff_id: b.staff_id, status: b.status,
            importance: b.importance, note: b.note ?? '', permanent_note: b.client_permanent_note ?? '',
            discount_type: b.discount_type ?? '', discount_reason: b.discount_reason ?? '',
            discount_value: b.discount_value ?? 0, gift_card: b.gift_card ?? '',
            welcome_drink: b.welcome_drink ?? '', deposit: b.deposit ?? 0,
            source: b.source ?? 'phone',
            services: (b.services ?? []).map((s) => ({
              service_id: s.service_id, name: s.name, duration_min: s.duration_min, price: s.price, qty: s.qty
            }))
          })
          if (b.client_id) get(`/clients/${b.client_id}`).then(setLinkedClient).catch(() => {})
        })
        .catch(() => toast.error(t('common.error')))
        .finally(() => setLoading(false))
      return
    }

    // New booking: start from the slot that was clicked in the diary.
    const start = draft?.start_min ?? 720
    setLoaded(null)
    setLinkedClient(null)
    setTargetLocationId(locationId)
    setRemoteContext(null)
    setDay(draft?.day ?? context?.day ?? '')
    setStartLabel(hhmm(start))
    setEndLabel(hhmm(Math.min(1440, start + 90)))
    setForm({ ...EMPTY, resource_id: draft?.resource_id ?? context?.resources?.[0]?.id ?? null })
  }, [open, bookingId, draft, context, locationId, t, toast])

  /**
   * When the booking is aimed at another venue, that venue's tables, staff and
   * services have to come along — the diary in the background is a different
   * one and its resources would not exist there.
   */
  useEffect(() => {
    if (!open || !targetLocationId) return
    if (targetLocationId === locationId) {
      setRemoteContext(null)
      return
    }
    const when = day || context?.day
    if (!when) return
    let cancelled = false
    setCtxLoading(true)
    get(`/day?day=${when}`, { locationId: targetLocationId })
      .then((d) => !cancelled && setRemoteContext(d))
      .catch(() => !cancelled && toast.error(t('common.error')))
      .finally(() => !cancelled && setCtxLoading(false))
    return () => {
      cancelled = true
    }
  }, [open, targetLocationId, locationId, day, context, t, toast])

  const ctx = remoteContext ?? context
  const targetLocation = locations.find((l) => l.id === targetLocationId) ?? location
  const isElsewhere = targetLocationId !== locationId

  const changeLocation = (id) => {
    setTargetLocationId(id)
    // Tables and staff are venue-specific, so both selections start over.
    set({ resource_id: null, staff_id: null })
  }

  /* ----------------------------- client typeahead ---------------------------- */

  const lookupTimer = useRef(null)
  const linkedRef = useRef(null)
  useEffect(() => {
    linkedRef.current = linkedClient?.id ?? null
  }, [linkedClient])

  const chooseClient = useCallback(
    (c, { fillPhone = true } = {}) => {
      setLinkedClient(c)
      setMatchOpen(false)
      set({
        ...(fillPhone ? { phone: c.phone } : {}),
        name: c.name,
        permanent_note: c.permanent_note ?? ''
      })
    },
    [set]
  )

  useEffect(() => {
    const q = form.phone.replace(/\D/g, '')
    clearTimeout(lookupTimer.current)
    if (q.length < 3) {
      setMatches([])
      setMatchOpen(false)
      return
    }
    setLookupBusy(true)
    lookupTimer.current = setTimeout(() => {
      get(`/clients/lookup?q=${encodeURIComponent(q)}`)
        .then((rows) => {
          setMatches(rows)
          const exact = rows.find((r) => r.phone === q)
          if (exact) {
            // A complete, already-known number is unambiguous: fill the card in
            // rather than making the admin confirm their own guest again.
            if (linkedRef.current !== exact.id) chooseClient(exact, { fillPhone: false })
            else setMatchOpen(false)
          } else {
            setMatchOpen(rows.length > 0)
          }
        })
        .catch(() => setMatches([]))
        .finally(() => setLookupBusy(false))
    }, 220)
    return () => clearTimeout(lookupTimer.current)
  }, [form.phone, chooseClient])

  const digits = form.phone.replace(/\D/g, '')
  const exactMatch = useMemo(() => matches.find((m) => m.phone === digits) ?? null, [matches, digits])
  const knownClient = linkedClient ?? exactMatch
  const isNewClient = digits.length >= 6 && !knownClient && !lookupBusy

  /* --------------------------------- services -------------------------------- */

  const services = ctx?.services ?? []
  const gross = form.services.reduce((acc, s) => acc + Number(s.price || 0) * Number(s.qty || 1), 0)
  const total =
    form.discount_type === 'percent'
      ? gross * (1 - Number(form.discount_value || 0) / 100)
      : form.discount_type === 'amount'
        ? Math.max(0, gross - Number(form.discount_value || 0))
        : gross

  const addService = (id) => {
    const svc = services.find((s) => s.id === Number(id))
    if (!svc) return
    const next = [...form.services, {
      service_id: svc.id, name: serviceName(svc, lang), duration_min: svc.duration_min, price: svc.price, qty: 1
    }]
    set({ services: next })
    // The first service defines the slot length; later ones extend it.
    const start = minutesFromHHMM(startLabel)
    const totalDuration = next.reduce((acc, s) => acc + Number(s.duration_min || 0), 0)
    if (totalDuration > 0) setEndLabel(hhmm(Math.min(1439, start + totalDuration)))
  }

  const removeService = (index) => set({ services: form.services.filter((_, i) => i !== index) })
  const patchService = (index, patchObj) =>
    set({ services: form.services.map((s, i) => (i === index ? { ...s, ...patchObj } : s)) })

  /* ---------------------------------- saving --------------------------------- */

  const startMin = minutesFromHHMM(startLabel)
  const endMin = minutesFromHHMM(endLabel)
  const invalidTime = endMin <= startMin
  // Money off the bill always needs a stated reason — it ends up in the
  // guest's history and in the owner's activity log.
  const discountReasonMissing = Boolean(form.discount_type) && !String(form.discount_reason).trim()
  const canSave = Boolean(day && form.resource_id) && !invalidTime && !discountReasonMissing

  const payload = (force = false) => ({
    location_id: targetLocationId,
    resource_id: Number(form.resource_id),
    staff_id: form.staff_id ? Number(form.staff_id) : null,
    day,
    start_min: startMin,
    end_min: endMin,
    guests: Number(form.guests) || 1,
    status: form.status,
    importance: form.importance,
    note: form.note,
    permanent_note: form.permanent_note,
    phone: form.phone,
    name: form.name,
    discount_type: form.discount_type,
    discount_reason: form.discount_reason,
    discount_value: Number(form.discount_value) || 0,
    gift_card: form.gift_card,
    welcome_drink: form.welcome_drink,
    deposit: Number(form.deposit) || 0,
    source: form.source,
    services: form.services,
    force
  })

  const submit = async () => {
    if (!canSave) return
    setBusy(true)
    try {
      const send = (force) =>
        isEdit ? patch(`/bookings/${bookingId}`, payload(force)) : post('/bookings', payload(force))

      let saved
      try {
        saved = await send(false)
      } catch (err) {
        if (err.code !== 'conflict') throw err
        const c = err.conflict
        const ok = await confirm({
          title: t('cal.conflictTitle'),
          body: t('cal.conflictBody', { label: c.label, time: `${hhmm(c.start_min)}–${hhmm(c.end_min)}` }),
          confirmLabel: t('cal.conflictOverride'),
          cancelLabel: t('cal.conflictPick'),
          tone: 'danger'
        })
        if (!ok) {
          setBusy(false)
          return
        }
        saved = await send(true)
      }

      // Saving into another venue means the booking will not appear in the
      // diary behind the dialog, so the toast has to name where it landed.
      const where = isElsewhere ? ` · ${targetLocation?.name}` : ''
      if (saved.client_is_new) toast.success(`${t('bk.newGuestAlert')}${where}`)
      else toast.success(`${isEdit ? t('bk.update') : t('bk.confirm')}${where}`)
      onSaved?.(saved)
      onOpenChange(false)
    } catch (err) {
      const known = {
        cancel_reason_required: 'bk.cancelReasonRequired',
        discount_reason_required: 'bk.discountReasonRequired',
        resource_not_in_location: 'bk.resourceNotHere',
        bad_time: 'bk.badTime'
      }[err.code]
      toast.error(known ? t(known) : t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  const cancelBooking = async () => {
    const res = await confirm({
      title: t('bk.cancelTitle'),
      body: `${form.name || ''} · ${startLabel}–${endLabel}`,
      requireReason: true,
      reasonLabel: t('bk.cancelReason'),
      confirmLabel: t('bk.cancelConfirm'),
      cancelLabel: t('bk.keep'),
      tone: 'danger'
    })
    if (!res) return
    setBusy(true)
    try {
      const saved = await patch(`/bookings/${bookingId}`, { status: 'cancelled', cancel_reason: res.reason })
      toast.success(t('status.cancelled'))
      onSaved?.(saved)
      onOpenChange(false)
    } catch {
      toast.error(t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  const statusMeta = STATUS_META[form.status] ?? STATUS_META.booked

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(96vw,52rem)]">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle>{isEdit ? t('bk.edit') : t('bk.new')}</DialogTitle>
            {isEdit && (
              <span className={cn('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium', statusMeta.chip)}>
                <statusMeta.icon className="size-3" aria-hidden="true" />
                {t(`status.${form.status}`)}
              </span>
            )}
            {isNewClient && <Badge tone="accent">{t('bk.newGuest')}</Badge>}
          </div>
          <DialogDescription>
            {targetLocation?.name} · {day} · {startLabel}–{endLabel}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-5">
          {loading ? (
            <div className="flex items-center gap-2 py-10 text-sm text-ink-soft">
              <Spinner /> {t('common.loading')}
            </div>
          ) : (
            <>
              {/* -------------------------------- guest ------------------------------- */}
              <section className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="relative">
                    <Field label={t('bk.phone')} hint={!isEdit ? t('bk.phoneHint') : undefined}>
                      <div className="relative">
                        <Phone className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
                        <Input
                          className="pl-9 tabular"
                          value={form.phone}
                          inputMode="tel"
                          onChange={(e) => {
                            setLinkedClient(null)
                            set({ phone: e.target.value })
                          }}
                          onFocus={() => matches.length && setMatchOpen(true)}
                          placeholder="+371 2X XXX XXX"
                        />
                        {lookupBusy && <Spinner className="absolute right-3 top-1/2 -translate-y-1/2" />}
                      </div>
                    </Field>

                    {matchOpen && matches.length > 0 && (
                      <div className="absolute inset-x-0 top-[calc(100%-14px)] z-30 overflow-hidden rounded-xl border border-line bg-raised shadow-pop animate-scale-in">
                        {matches.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => chooseClient(m)}
                            className="flex w-full cursor-pointer items-start gap-2 border-b border-line px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-sunken"
                          >
                            <User className="mt-0.5 size-4 shrink-0 text-ink-faint" aria-hidden="true" />
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-1.5">
                                <span className="truncate text-sm font-medium text-ink">{m.name}</span>
                                <span className="shrink-0 text-xs tabular text-ink-faint">{formatPhone(m.phone)}</span>
                              </span>
                              <span className="mt-0.5 block truncate text-xs text-ink-soft">
                                {m.last_visit
                                  ? `${m.last_visit.day} · ${m.last_visit.services ?? ''}${m.last_visit.staff_name ? ` · ${m.last_visit.staff_name}` : ''}`
                                  : t('bk.noPrev')}
                              </span>
                            </span>
                            <span className="shrink-0 text-xs text-ink-faint">
                              {m.visits} {t('bk.visits')}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <Field label={t('bk.name')}>
                    <Input value={form.name} onChange={(e) => set({ name: e.target.value })} />
                  </Field>
                </div>

                {isNewClient && (
                  <div className="flex items-start gap-2.5 rounded-lg border border-accent bg-accent-soft px-3 py-2.5">
                    <Sparkles className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-accent">{t('bk.newGuestAlert')}</p>
                      <p className="mt-0.5 text-xs text-ink-soft">
                        {t('bk.newGuestBody', { name: form.name || formatPhone(form.phone) })}
                      </p>
                    </div>
                  </div>
                )}

                {knownClient && (
                  <div className="rounded-lg border border-line bg-sunken px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <History className="size-4 shrink-0 text-ink-faint" aria-hidden="true" />
                      <span className="text-sm font-medium text-ink">{t('bk.returning')}</span>
                      <Badge>{knownClient.visits} {t('bk.visits')}</Badge>
                      {knownClient.no_shows > 0 && (
                        <Badge tone="clay">{knownClient.no_shows} {t('cl.noShows')}</Badge>
                      )}
                      {knownClient.id && (
                        <Link
                          to={`/clients/${knownClient.id}`}
                          className="ml-auto flex cursor-pointer items-center gap-1 text-xs text-accent underline-offset-4 hover:underline"
                        >
                          {t('bk.openClient')} <ExternalLink className="size-3" />
                        </Link>
                      )}
                    </div>
                    {knownClient.last_visit ? (
                      <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
                        <Meta label={t('bk.prevVisit')} value={knownClient.last_visit.day} />
                        <Meta label={t('bk.prevService')} value={knownClient.last_visit.services || '—'} />
                        <Meta label={t('bk.prevStaff')} value={knownClient.last_visit.staff_name || '—'} />
                      </dl>
                    ) : (
                      <p className="mt-1.5 text-xs text-ink-faint">{t('bk.noPrev')}</p>
                    )}
                    {knownClient.permanent_note && (
                      <p className="mt-2 flex items-start gap-1.5 rounded-md bg-clay-soft px-2 py-1.5 text-xs font-medium text-clay">
                        <Pin className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                        {knownClient.permanent_note}
                      </p>
                    )}
                  </div>
                )}
              </section>

              <Separator />

              {/* ------------------------------- venue -------------------------------- */}
              <section className="space-y-2">
                <Field label={t('bk.location')} hint={t('bk.locationHint')}>
                  <Select value={targetLocationId ? String(targetLocationId) : ''} onValueChange={(v) => changeLocation(Number(v))}>
                    <SelectTrigger>
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      {locations.map((l) => (
                        <SelectItem key={l.id} value={String(l.id)}>
                          <span className="flex items-center gap-2">
                            <span className="size-2 shrink-0 rounded-full" style={{ background: l.accent }} aria-hidden="true" />
                            {l.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                {isElsewhere && (
                  <p className="flex items-start gap-2 rounded-lg border border-clay bg-clay-soft px-3 py-2 text-xs font-medium text-clay">
                    <Building2 className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                    {t('bk.elsewhere', { venue: targetLocation?.name ?? '', home: location?.name ?? '' })}
                  </p>
                )}
              </section>

              {/* -------------------------------- slot -------------------------------- */}
              <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label={t('bk.date')}>
                  <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="tabular" />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label={t('bk.from')}>
                    <TimeField
                      value={startLabel}
                      onChange={(v) => {
                        // Keep the duration the guest was quoted when the start moves.
                        const delta = minutesFromHHMM(v) - minutesFromHHMM(startLabel)
                        setStartLabel(v)
                        setEndLabel(hhmm(Math.min(1439, Math.max(0, minutesFromHHMM(endLabel) + delta))))
                      }}
                    />
                  </Field>
                  <Field label={t('bk.to')} error={invalidTime ? t('bk.badTime') : undefined}>
                    <TimeField value={endLabel} onChange={setEndLabel} />
                  </Field>
                </div>
                <Field label={t('bk.table')} required>
                  <Select value={form.resource_id ? String(form.resource_id) : ''} onValueChange={(v) => set({ resource_id: Number(v) })}>
                    <SelectTrigger disabled={ctxLoading}>
                      <SelectValue placeholder={ctxLoading ? t('common.loading') : '—'} />
                    </SelectTrigger>
                    <SelectContent>
                      {(ctx?.resources ?? []).map((r) => (
                        <SelectItem key={r.id} value={String(r.id)}>
                          {r.name} · {r.zone} ({r.seats})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label={t('bk.guests')}>
                    <Input type="number" min={1} max={60} value={form.guests} onChange={(e) => set({ guests: e.target.value })} className="tabular" />
                  </Field>
                  <Field label={t('bk.staff')}>
                    <Select value={form.staff_id ? String(form.staff_id) : 'none'} onValueChange={(v) => set({ staff_id: v === 'none' ? null : Number(v) })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t('common.none')}</SelectItem>
                        {(ctx?.staff ?? []).map((s) => (
                          <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              </section>

              {/* ------------------------------ services ------------------------------ */}
              <section>
                <div className="flex items-center justify-between gap-2">
                  <Label>{t('bk.services')}</Label>
                  <Select value="" onValueChange={addService}>
                    <SelectTrigger className="h-8 w-auto gap-1.5 px-2.5 text-[13px]">
                      <Plus className="size-3.5" aria-hidden="true" />
                      <span>{t('bk.addService')}</span>
                    </SelectTrigger>
                    <SelectContent align="end" className="w-72">
                      {services.map((s) => (
                        <SelectItem key={s.id} value={String(s.id)}>
                          <span className="flex w-full items-center gap-2">
                            <span className="flex-1 truncate">{serviceName(s, lang)}</span>
                            <span className="shrink-0 text-xs tabular text-ink-faint">
                              {s.duration_min}′ · {money(s.price)}
                            </span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="mt-2 overflow-hidden rounded-lg border border-line">
                  <table className="w-full text-sm">
                    <thead className="bg-sunken text-[11px] uppercase tracking-[0.06em] text-ink-faint">
                      <tr>
                        <th className="px-3 py-1.5 text-left font-medium">{t('bk.serviceName')}</th>
                        <th className="w-20 px-2 py-1.5 text-right font-medium">{t('bk.time')}</th>
                        <th className="w-24 px-2 py-1.5 text-right font-medium">{t('bk.price')}</th>
                        <th className="w-9" />
                      </tr>
                    </thead>
                    <tbody>
                      {form.services.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-3 py-4 text-center text-xs text-ink-faint">
                            {t('common.empty')}
                          </td>
                        </tr>
                      )}
                      {form.services.map((s, i) => (
                        <tr key={i} className="border-t border-line">
                          <td className="px-3 py-1.5">
                            <input
                              value={s.name}
                              onChange={(e) => patchService(i, { name: e.target.value })}
                              className="w-full bg-transparent text-sm text-ink outline-none"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="number"
                              value={s.duration_min}
                              onChange={(e) => patchService(i, { duration_min: Number(e.target.value) })}
                              className="w-full bg-transparent text-right text-sm tabular text-ink-soft outline-none"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="number"
                              step="0.01"
                              value={s.price}
                              onChange={(e) => patchService(i, { price: Number(e.target.value) })}
                              className="w-full bg-transparent text-right text-sm tabular text-ink outline-none"
                            />
                          </td>
                          <td className="px-1 py-1.5 text-center">
                            <button
                              type="button"
                              onClick={() => removeService(i)}
                              aria-label={t('bk.remove')}
                              className="cursor-pointer rounded p-1 text-ink-faint transition-colors hover:bg-clay-soft hover:text-clay"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* ------------------------ money & hospitality ------------------------- */}
              <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Field label={t('bk.discountType')}>
                  <Select value={form.discount_type || 'none'} onValueChange={(v) => set({ discount_type: v === 'none' ? '' : v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t('bk.discount.none')}</SelectItem>
                      <SelectItem value="percent">{t('bk.discount.percent')}</SelectItem>
                      <SelectItem value="amount">{t('bk.discount.amount')}</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field
                  label={t('bk.discountValue')}
                  hint={form.discount_type === 'percent' ? '%' : form.discount_type === 'amount' ? 'EUR' : undefined}
                >
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    disabled={!form.discount_type}
                    value={form.discount_value}
                    onChange={(e) => set({ discount_value: e.target.value })}
                    className="tabular"
                  />
                </Field>
                <Field
                  label={t('bk.discountReason')}
                  className="sm:col-span-2 lg:col-span-1"
                  required={Boolean(form.discount_type)}
                  error={discountReasonMissing ? t('bk.discountReasonRequired') : undefined}
                >
                  <Input
                    disabled={!form.discount_type}
                    value={form.discount_reason}
                    onChange={(e) => set({ discount_reason: e.target.value })}
                    className={cn(discountReasonMissing && 'border-clay')}
                  />
                </Field>
                <Field label={t('bk.welcomeDrink')}>
                  <Input value={form.welcome_drink} onChange={(e) => set({ welcome_drink: e.target.value })} />
                </Field>
                <Field label={t('bk.giftCard')}>
                  <Input value={form.gift_card} onChange={(e) => set({ gift_card: e.target.value })} className="tabular" />
                </Field>
                <Field label={t('bk.deposit')}>
                  <Input type="number" min={0} step="0.01" value={form.deposit} onChange={(e) => set({ deposit: e.target.value })} className="tabular" />
                </Field>
              </section>

              <div className="flex items-center justify-end gap-3 rounded-lg bg-sunken px-3 py-2 text-sm">
                {gross !== total && <span className="tabular text-ink-faint line-through">{money(gross)}</span>}
                <span className="text-ink-soft">{t('bk.sum')}</span>
                <span className="text-base font-semibold tabular text-ink">{money(total)}</span>
              </div>

              {/* -------------------------------- notes ------------------------------- */}
              <section className="grid gap-3 sm:grid-cols-2">
                <Field label={t('bk.comment')} hint={t('bk.commentHint')}>
                  <Textarea value={form.note} onChange={(e) => set({ note: e.target.value })} />
                </Field>
                <Field label={t('bk.permanent')} hint={t('bk.permanentHint')}>
                  <Textarea
                    value={form.permanent_note}
                    onChange={(e) => set({ permanent_note: e.target.value })}
                    className="border-clay/40 bg-clay-soft/40"
                  />
                </Field>
              </section>

              {/* ------------------------------- status ------------------------------- */}
              <section className="grid gap-3 sm:grid-cols-3">
                <Field label={t('bk.status')}>
                  <Select value={form.status} onValueChange={(v) => set({ status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUSES.filter((s) => s !== 'cancelled').map((s) => (
                        <SelectItem key={s} value={s}>{t(`status.${s}`)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={t('bk.importance')}>
                  <Select value={form.importance} onValueChange={(v) => set({ importance: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {IMPORTANCES.map((s) => (
                        <SelectItem key={s} value={s}>{t(`prio.${s}`)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={t('bk.source')}>
                  <Select value={form.source} onValueChange={(v) => set({ source: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="phone">{t('bk.source.phone')}</SelectItem>
                      <SelectItem value="walk-in">{t('bk.source.walkin')}</SelectItem>
                      <SelectItem value="online">{t('bk.source.online')}</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </section>

              {/* ------------------------------ audit trail --------------------------- */}
              {isEdit && loaded && (
                <section className="rounded-lg border border-line">
                  <button
                    type="button"
                    onClick={() => setShowDetails((v) => !v)}
                    className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-sunken"
                  >
                    {showDetails ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                    {t('common.details')}
                    <span className="ml-auto text-xs font-normal text-ink-faint">
                      {loaded.audit?.length ?? 0} {t('bk.trail').toLowerCase()}
                    </span>
                  </button>

                  {showDetails && (
                    <div className="space-y-3 border-t border-line px-3 py-3">
                      <dl className="grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2">
                        <Meta label={t('bk.createdBy')} value={loaded.created_by_name || '—'} />
                        <Meta
                          label={t('bk.createdFrom')}
                          value={loaded.created_location_name || '—'}
                          highlight={loaded.created_location_name && loaded.created_location_name !== loaded.location_name}
                        />
                        <Meta label={t('bk.createdAt')} value={loaded.created_at} mono />
                        <Meta label={t('bk.updatedAt')} value={loaded.updated_at} mono />
                      </dl>

                      <div className="space-y-1.5">
                        {(loaded.audit ?? []).map((a) => (
                          <div key={a.id} className="flex items-start gap-2 rounded-md bg-sunken px-2 py-1.5 text-xs">
                            <Clock className="mt-0.5 size-3 shrink-0 text-ink-faint" aria-hidden="true" />
                            <div className="min-w-0 flex-1">
                              <p className="text-ink">
                                <span className="font-medium">{a.actor_name}</span>{' '}
                                <span className="text-ink-soft">{t(`aud.action.${a.action}`)}</span> — {a.summary}
                              </p>
                              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-ink-faint">
                                <span className="tabular">{a.created_at}</span>
                                {a.actor_location_name && (
                                  <span className="flex items-center gap-1">
                                    <MapPin className="size-2.5" aria-hidden="true" />
                                    {t('aud.from')} {a.actor_location_name}
                                  </span>
                                )}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </section>
              )}
            </>
          )}
        </DialogBody>

        <DialogFooter>
          {isEdit && form.status !== 'cancelled' && (
            <Button variant="danger-outline" onClick={cancelBooking} disabled={busy} className="mr-auto">
              <Ban className="size-4" />
              {t('bk.cancel')}
            </Button>
          )}
          {isEdit && loaded?.cancel_reason && (
            <p className="mr-auto max-w-xs truncate text-xs text-clay" title={loaded.cancel_reason}>
              {t('bk.cancelReason')}: {loaded.cancel_reason}
            </p>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} disabled={busy || !canSave}>
            {busy && <Spinner className="text-current" />}
            {isEdit ? t('bk.update') : t('bk.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Meta({ label, value, mono, highlight }) {
  return (
    <div className="flex min-w-0 gap-1.5">
      <dt className="shrink-0 text-ink-faint">{label}:</dt>
      <dd className={cn('min-w-0 truncate', mono && 'tabular', highlight ? 'font-medium text-clay' : 'text-ink')}>
        {value}
      </dd>
    </div>
  )
}
