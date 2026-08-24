import React, { useRef } from 'react'
import { GripHorizontal, Star, Pin, Users, AlertTriangle, Layers } from 'lucide-react'
import { cn, hhmm } from '@/lib/utils'
import { PX_PER_MIN, STATUS_META, FLAG_META, flagOf, formatPhone } from '@/lib/booking'
import { laneStyle } from '@/lib/lanes'
import { useI18n } from '@/i18n'

/**
 * One reservation on the diary. What fits is decided by the block's height:
 * the time range always shows, then service, guest, phone, and finally the
 * notes. A permanent note is deliberately loud — it carries allergies and
 * seating requirements that must not be missed at a glance.
 *
 * A high-priority or VIP booking takes the whole block colour; its status
 * then rides along as an icon so both still read.
 */
export default function BookingTile({
  booking,
  startMin,
  endMin,
  openMin,
  lane = 0,
  lanes = 1,
  conflict,
  dragging,
  dimmed,
  onPointerDown,
  onHover
}) {
  const { t } = useI18n()
  const ref = useRef(null)
  const meta = STATUS_META[booking.status] ?? STATUS_META.booked
  const StatusIcon = meta.icon

  const flag = flagOf(booking)
  const flagMeta = flag ? FLAG_META[flag] : null

  const from = startMin ?? booking.start_min
  const to = endMin ?? booking.end_min
  const top = (from - openMin) * PX_PER_MIN
  const height = (to - from) * PX_PER_MIN

  // Sharing the column costs width, so the lower-value lines step aside first.
  const narrow = lanes >= 3
  const showService = height >= 42
  const showGuest = height >= 58
  const showPhone = height >= 92 && !narrow
  const showNotes = height >= 110 && !narrow

  // Light text on a saturated ground: flags and the in-progress fill both.
  const inverted = Boolean(flagMeta) || booking.status === 'in_progress'

  return (
    <div
      ref={ref}
      data-block="booking"
      onPointerDown={(e) => onPointerDown(e, 'move')}
      onMouseEnter={() => onHover?.(ref.current?.getBoundingClientRect() ?? null)}
      onMouseLeave={() => onHover?.(null)}
      className={cn(
        'group absolute z-10 flex cursor-grab flex-col overflow-hidden rounded-lg border px-2 py-1 text-left transition-[box-shadow,opacity] duration-150',
        flagMeta ? flagMeta.tile : meta.tile,
        flagMeta && 'shadow-card',
        conflict && 'ring-1 ring-flag-high',
        dragging && 'z-40 cursor-grabbing shadow-drag',
        dimmed && 'opacity-45'
      )}
      style={{ top, height, ...laneStyle(lane, lanes) }}
      role="button"
      tabIndex={0}
      aria-label={`${hhmm(from)} ${booking.client_name ?? ''} ${booking.service_label ?? ''} ${
        flag ? t(`prio.${flag}`) : ''
      }${conflict ? ` — ${t('cal.overlapWarning')}` : ''}`}
    >
      <div className="flex items-baseline gap-1.5">
        {conflict && (
          <Layers
            className={cn('size-3 shrink-0 self-center', inverted ? 'text-white' : 'text-flag-high')}
            aria-label={t('cal.overlapWarning')}
          />
        )}
        <span className="shrink-0 text-[11px] font-semibold tabular leading-tight">
          {hhmm(from)}–{hhmm(to)}
        </span>

        {flag && (
          <span
            className={cn(
              'flex shrink-0 items-center gap-0.5 rounded px-1 text-[9px] font-bold uppercase tracking-wide',
              flagMeta.badge
            )}
          >
            {flag === 'vip' ? <Star className="size-2.5" aria-hidden="true" /> : <AlertTriangle className="size-2.5" aria-hidden="true" />}
            {t(`prio.${flag}`)}
          </span>
        )}

        {/* On a flagged block the status colour is gone, so show its icon. */}
        {flag && <StatusIcon className="size-3 shrink-0 opacity-80" aria-hidden="true" />}

        {booking.is_new_client && (
          <span
            className={cn(
              'ml-auto shrink-0 rounded px-1 text-[9px] font-bold tracking-wide',
              inverted ? 'bg-white/25 text-white' : 'bg-accent text-accent-ink'
            )}
          >
            {t('bk.newGuest')}
          </span>
        )}
      </div>

      {showService && booking.service_label && (
        <p className="truncate text-[11px] leading-tight opacity-90">{booking.service_label}</p>
      )}

      {showGuest && (
        <p className="flex items-center gap-1 truncate text-[12px] font-medium leading-tight">
          <span className="truncate">{booking.client_name || t('bk.noPhone')}</span>
          {booking.guests > 2 && (
            <span className="ml-auto flex shrink-0 items-center gap-0.5 text-[10px] opacity-70">
              <Users className="size-2.5" aria-hidden="true" />
              {booking.guests}
            </span>
          )}
        </p>
      )}

      {showPhone && booking.client_phone && (
        <p className="truncate text-[11px] tabular leading-tight opacity-70">{formatPhone(booking.client_phone)}</p>
      )}

      {showNotes && booking.note && (
        <p className="mt-0.5 truncate text-[11px] italic leading-tight opacity-75">{booking.note}</p>
      )}

      {showNotes && booking.client_permanent_note && (
        <p
          className={cn(
            'mt-auto flex items-center gap-1 truncate rounded px-1 py-0.5 text-[10px] font-semibold leading-tight',
            inverted ? 'bg-white/25 text-white' : 'bg-clay-soft text-clay'
          )}
        >
          <Pin className="size-2.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{booking.client_permanent_note}</span>
        </p>
      )}

      <button
        type="button"
        aria-label="Resize"
        onPointerDown={(e) => onPointerDown(e, 'resize')}
        className="absolute inset-x-0 bottom-0 flex h-2.5 cursor-ns-resize items-center justify-center opacity-0 transition-opacity group-hover:opacity-100"
      >
        <GripHorizontal className={cn('size-3', inverted ? 'text-white/70' : 'text-ink-faint')} />
      </button>
    </div>
  )
}
