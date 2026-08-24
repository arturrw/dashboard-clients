import { CalendarCheck, DoorOpen, PlayCircle, CheckCircle2, XCircle, UserX } from 'lucide-react'

/**
 * Colour is the fastest signal on a full diary, so it is spent entirely on
 * booking state. `tile` styles the calendar block, `chip` the small pill used
 * in lists and dialogs.
 */
export const STATUS_META = {
  booked: {
    icon: CalendarCheck,
    tile: 'bg-surface border-line-strong text-ink',
    bar: 'bg-line-strong',
    chip: 'bg-sunken text-ink-soft border-line'
  },
  arrived: {
    icon: DoorOpen,
    tile: 'bg-gold-soft border-gold text-ink',
    bar: 'bg-gold',
    chip: 'bg-gold-soft text-gold border-transparent'
  },
  in_progress: {
    icon: PlayCircle,
    tile: 'bg-accent border-accent text-accent-ink',
    bar: 'bg-accent-ink',
    chip: 'bg-accent text-accent-ink border-transparent'
  },
  completed: {
    icon: CheckCircle2,
    tile: 'bg-sunken border-line text-ink-faint',
    bar: 'bg-line-strong',
    chip: 'bg-sunken text-ink-faint border-line'
  },
  cancelled: {
    icon: XCircle,
    tile: 'bg-clay-soft border-clay/40 text-clay line-through decoration-clay/50',
    bar: 'bg-clay',
    chip: 'bg-clay-soft text-clay border-transparent'
  },
  no_show: {
    icon: UserX,
    tile: 'bg-clay-soft border-clay/40 text-clay',
    bar: 'bg-clay',
    chip: 'bg-clay-soft text-clay border-transparent'
  }
}

export const STATUSES = Object.keys(STATUS_META)
/** Only two flags are worth raising; everything else is simply a booking. */
export const IMPORTANCES = ['normal', 'high', 'vip']
export const TASK_PRIORITIES = ['urgent', 'high', 'normal', 'low']

export const IMPORTANCE_META = {
  low: { chip: 'bg-sunken text-ink-faint border-line' },
  normal: { chip: 'bg-sunken text-ink-soft border-line' },
  high: { chip: 'bg-flag-high text-white border-transparent' },
  vip: { chip: 'bg-flag-vip text-white border-transparent' }
}

/**
 * A flagged booking takes over the whole block colour so it cannot be missed
 * in a full diary. Finished and dead bookings keep their muted status colour —
 * a cancelled VIP is not something anyone still needs to react to.
 */
const LIVE_STATUSES = new Set(['booked', 'arrived', 'in_progress'])

export const FLAG_META = {
  high: {
    tile: 'bg-flag-high border-flag-high text-white',
    badge: 'bg-white/25 text-white'
  },
  vip: {
    tile: 'bg-flag-vip border-flag-vip text-white',
    badge: 'bg-white/25 text-white'
  }
}

export const flagOf = (booking) =>
  LIVE_STATUSES.has(booking.status) && FLAG_META[booking.importance] ? booking.importance : null

export const TASK_PRIORITY_META = {
  urgent: { chip: 'bg-clay text-white border-transparent', bar: 'bg-clay' },
  high: { chip: 'bg-clay-soft text-clay border-transparent', bar: 'bg-clay' },
  normal: { chip: 'bg-sunken text-ink-soft border-line', bar: 'bg-line-strong' },
  low: { chip: 'bg-sunken text-ink-faint border-line', bar: 'bg-line' }
}

/** Height in pixels of one minute of diary. Drives every drag calculation. */
export const PX_PER_MIN = 1.5
export const SNAP_MIN = 5

export const snap = (minutes, step = SNAP_MIN) => Math.round(minutes / step) * step

export const overlaps = (a, b) => a.start_min < b.end_min && a.end_min > b.start_min

/** A booking is "live" if it still occupies its table. */
export const occupiesSlot = (b) => b.status !== 'cancelled' && b.status !== 'no_show'

export const formatPhone = (raw) => {
  const d = String(raw || '').replace(/\D/g, '')
  if (d.startsWith('371') && d.length === 11) return `+371 ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8)}`
  if (d.length === 8) return `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5)}`
  return raw || ''
}
