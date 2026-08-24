import React, { useLayoutEffect, useRef, useState } from 'react'
import { Phone, User, Utensils, Pin, MessageSquare, MapPin, Users } from 'lucide-react'
import { Badge } from '@/components/ui/misc'
import { hhmm } from '@/lib/utils'
import { STATUS_META, IMPORTANCE_META, formatPhone } from '@/lib/booking'
import { useI18n } from '@/i18n'

const GAP = 10
const WIDTH = 280

/**
 * Read-only peek at a reservation while the pointer rests on it. Rendered in a
 * fixed layer and flipped to whichever side has room, so it never falls off
 * the edge of a diary that is scrolled sideways.
 */
export default function HoverCard({ booking, rect }) {
  const { t } = useI18n()
  const ref = useRef(null)
  const [pos, setPos] = useState({ left: -9999, top: -9999 })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !rect) return
    const height = el.offsetHeight
    let left = rect.right + GAP
    if (left + WIDTH > window.innerWidth - 8) left = rect.left - WIDTH - GAP
    if (left < 8) left = Math.max(8, Math.min(window.innerWidth - WIDTH - 8, rect.left))
    let top = rect.top
    if (top + height > window.innerHeight - 8) top = window.innerHeight - height - 8
    setPos({ left, top: Math.max(8, top) })
  }, [rect, booking])

  const meta = STATUS_META[booking.status] ?? STATUS_META.booked
  const StatusIcon = meta.icon

  return (
    <div
      ref={ref}
      role="tooltip"
      className="pointer-events-none fixed z-50 rounded-xl border border-line bg-raised p-3 shadow-pop animate-fade-in"
      style={{ left: pos.left, top: pos.top, width: WIDTH }}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold tabular text-ink">
          {hhmm(booking.start_min)}–{hhmm(booking.end_min)}
        </span>
        <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${meta.chip}`}>
          <StatusIcon className="size-3" aria-hidden="true" />
          {t(`status.${booking.status}`)}
        </span>
        {(booking.importance === 'high' || booking.importance === 'vip') && (
          <span
            className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-semibold uppercase ${
              IMPORTANCE_META[booking.importance].chip
            }`}
          >
            {t(`prio.${booking.importance}`)}
          </span>
        )}
        {booking.is_new_client && <Badge tone="accent" className="ml-auto">{t('bk.newGuest')}</Badge>}
      </div>

      <dl className="mt-2.5 space-y-1.5 text-sm">
        <Row icon={Utensils} value={booking.service_label || '—'} />
        <Row icon={User} value={booking.client_name || t('bk.noPhone')} strong />
        {booking.client_phone && <Row icon={Phone} value={formatPhone(booking.client_phone)} mono />}
        <Row icon={Users} value={`${booking.guests} ${t('common.guests')}`} />
        {booking.resource_name && (
          <Row icon={MapPin} value={`${booking.resource_name}${booking.staff_name ? ` · ${booking.staff_name}` : ''}`} />
        )}
      </dl>

      {booking.note && (
        <p className="mt-2.5 flex items-start gap-1.5 rounded-md bg-sunken px-2 py-1.5 text-xs italic text-ink-soft">
          <MessageSquare className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
          {booking.note}
        </p>
      )}

      {booking.client_permanent_note && (
        <p className="mt-1.5 flex items-start gap-1.5 rounded-md bg-clay-soft px-2 py-1.5 text-xs font-medium text-clay">
          <Pin className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
          {booking.client_permanent_note}
        </p>
      )}

      {booking.cancel_reason && (
        <p className="mt-1.5 rounded-md bg-clay-soft px-2 py-1.5 text-xs text-clay">
          {t('bk.cancelReason')}: {booking.cancel_reason}
        </p>
      )}
    </div>
  )
}

function Row({ icon: Icon, value, strong, mono }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="size-3.5 shrink-0 text-ink-faint" aria-hidden="true" />
      <span className={`min-w-0 truncate ${strong ? 'font-medium text-ink' : 'text-ink-soft'} ${mono ? 'tabular' : ''}`}>
        {value}
      </span>
    </div>
  )
}
