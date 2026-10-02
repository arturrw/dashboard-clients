import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Plus, GripHorizontal, Coffee, AlertTriangle } from 'lucide-react'
import { cn, hhmm } from '@/lib/utils'
import { PX_PER_MIN, SNAP_MIN, snap, occupiesSlot } from '@/lib/booking'
import { layoutLanes, laneStyle } from '@/lib/lanes'
import { useI18n } from '@/i18n'
import BookingTile from './BookingTile'
import HoverCard from './HoverCard'

const GUTTER = 60
const MIN_COL = 168
const MIN_DURATION = 15

/**
 * The day diary: one column per table, absolute-positioned blocks, and a
 * pointer-driven drag layer. Dragging never mutates state directly — it
 * produces a proposed placement that the page confirms before saving, so an
 * accidental nudge can always be waved off.
 */
export default function DayGrid({
  day,
  location,
  resources,
  bookings,
  breaks,
  shifts,
  staff,
  nowMinutes,
  onOpenBooking,
  onCreateAt,
  onProposeMove
}) {
  const { t } = useI18n()
  const openMin = location?.open_min ?? 600
  const closeMin = location?.close_min ?? 1380
  const totalMin = Math.max(60, closeMin - openMin)
  const bodyHeight = totalMin * PX_PER_MIN

  const scrollRef = useRef(null)
  const columnsRef = useRef(new Map())
  /**
   * A click is dispatched on the common ancestor of press and release, so
   * letting go a pixel outside a booking targets the column instead — which
   * would open a blank "new booking" over the one just opened. Any gesture
   * that began on a block parks the column's create-click for a moment.
   */
  const blockGestureAt = useRef(0)

  const [drag, setDrag] = useState(null)
  /**
   * The live drag, readable synchronously from the window listeners. Pointer
   * up must act on the latest position and fire the page callbacks exactly
   * once — doing that inside a setState updater runs it twice under
   * StrictMode and updates the page while DayGrid is rendering.
   */
  const dragRef = useRef(null)
  const [hover, setHover] = useState(null)
  const [hoverSlot, setHoverSlot] = useState(null)

  const minuteFromClientY = useCallback(
    (clientY, columnEl) => {
      const rect = columnEl.getBoundingClientRect()
      return openMin + (clientY - rect.top) / PX_PER_MIN
    },
    [openMin]
  )

  /* ------------------------------- drag layer ------------------------------- */

  const beginDrag = useCallback(
    (event, item, kind, mode) => {
      if (event.button !== 0) return
      event.preventDefault()
      event.stopPropagation()

      const rects = resources.map((r) => {
        const el = columnsRef.current.get(r.id)
        return { id: r.id, rect: el?.getBoundingClientRect() }
      })

      document.body.classList.add('is-dragging')
      blockGestureAt.current = Date.now()
      setHover(null)
      dragRef.current = {
        item,
        kind, // 'booking' | 'break'
        mode, // 'move' | 'resize'
        rects,
        originX: event.clientX,
        originY: event.clientY,
        resourceId: item.resource_id,
        startMin: item.start_min,
        endMin: item.end_min,
        moved: false
      }
      setDrag(dragRef.current)
      event.currentTarget.setPointerCapture?.(event.pointerId)
    },
    [resources]
  )

  useEffect(() => {
    if (!drag) return

    const onMove = (e) => {
      const d = dragRef.current
      if (d) {
        const dyMin = (e.clientY - d.originY) / PX_PER_MIN
        const duration = d.item.end_min - d.item.start_min

        let startMin = d.startMin
        let endMin = d.endMin
        let resourceId = d.resourceId

        if (d.mode === 'move') {
          startMin = snap(d.item.start_min + dyMin, SNAP_MIN)
          startMin = Math.max(openMin, Math.min(closeMin - duration, startMin))
          endMin = startMin + duration
          // Column is chosen by pointer position, not by accumulated delta, so
          // the block follows the cursor exactly across uneven column widths.
          const hit = d.rects.find((r) => r.rect && e.clientX >= r.rect.left && e.clientX <= r.rect.right)
          if (hit) resourceId = hit.id
        } else {
          endMin = snap(d.item.end_min + dyMin, SNAP_MIN)
          endMin = Math.max(d.item.start_min + MIN_DURATION, Math.min(closeMin, endMin))
        }

        const moved = startMin !== d.item.start_min || endMin !== d.item.end_min || resourceId !== d.item.resource_id
        dragRef.current = { ...d, startMin, endMin, resourceId, moved }
        setDrag(dragRef.current)
      }

      // Auto-scroll when dragging near the edges of the viewport.
      const el = scrollRef.current
      if (el) {
        const r = el.getBoundingClientRect()
        if (e.clientY < r.top + 48) el.scrollTop -= 12
        else if (e.clientY > r.bottom - 48) el.scrollTop += 12
        if (e.clientX < r.left + 60) el.scrollLeft -= 12
        else if (e.clientX > r.right - 60) el.scrollLeft += 12
      }
    }

    const onUp = () => {
      document.body.classList.remove('is-dragging')
      blockGestureAt.current = Date.now()
      const d = dragRef.current
      dragRef.current = null
      setDrag(null)
      if (!d) return
      if (d.moved) {
        onProposeMove({
          kind: d.kind,
          item: d.item,
          next: { resource_id: d.resourceId, start_min: d.startMin, end_min: d.endMin, day }
        })
      } else if (d.kind === 'booking') {
        onOpenBooking(d.item)
      }
    }

    const onKey = (e) => {
      if (e.key !== 'Escape') return
      document.body.classList.remove('is-dragging')
      dragRef.current = null
      setDrag(null)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('keydown', onKey)
    }
  }, [drag, openMin, closeMin, day, onProposeMove, onOpenBooking])

  /* ------------------------------ lane layout ------------------------------- */

  /**
   * Positions are recomputed with the drag applied, so a block dragged onto an
   * occupied slot immediately splits the column with whatever is already there
   * — the clash is visible while it is still being made, not after saving.
   */
  const layoutByResource = useMemo(() => {
    const buckets = new Map(resources.map((r) => [r.id, []]))

    const geometryOf = (kind, item) =>
      drag?.moved && drag.kind === kind && drag.item.id === item.id
        ? { resource_id: drag.resourceId, start_min: drag.startMin, end_min: drag.endMin }
        : { resource_id: item.resource_id, start_min: item.start_min, end_min: item.end_min }

    for (const br of breaks) {
      const g = geometryOf('break', br)
      buckets.get(g.resource_id)?.push({ ...g, kind: 'break', data: br, blocking: true })
    }
    for (const b of bookings) {
      const g = geometryOf('booking', b)
      buckets.get(g.resource_id)?.push({ ...g, kind: 'booking', data: b, blocking: occupiesSlot(b) })
    }

    const out = new Map()
    for (const [id, items] of buckets) out.set(id, layoutLanes(items))
    return out
  }, [resources, bookings, breaks, drag])

  const hours = useMemo(() => {
    const out = []
    for (let m = Math.ceil(openMin / 60) * 60; m <= closeMin; m += 60) out.push(m)
    return out
  }, [openMin, closeMin])

  const staffOnShift = useMemo(() => {
    const ids = new Set(shifts.map((s) => s.staff_id))
    return staff.filter((s) => ids.has(s.id))
  }, [shifts, staff])

  const totalConflicts = useMemo(
    () => [...layoutByResource.values()].reduce((acc, l) => acc + l.conflicts, 0),
    [layoutByResource]
  )

  // Scroll so the current hour is in view on first paint of a live day.
  const didScroll = useRef(false)
  useLayoutEffect(() => {
    if (didScroll.current || !scrollRef.current || nowMinutes == null) return
    const target = (nowMinutes - openMin) * PX_PER_MIN - 160
    scrollRef.current.scrollTop = Math.max(0, target)
    didScroll.current = true
  }, [nowMinutes, openMin])

  if (!resources.length) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-ink-soft">
        {t('cal.noResources')}
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {(staffOnShift.length > 0 || totalConflicts > 0) && (
        <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-line bg-surface px-3 py-2">
          {totalConflicts > 0 && (
            <span className="flex shrink-0 items-center gap-1.5 rounded-md bg-flag-high-soft px-2 py-0.5 text-xs font-semibold text-flag-high">
              <AlertTriangle className="size-3.5" aria-hidden="true" />
              {t('cal.overlapCount', { count: totalConflicts })}
            </span>
          )}
          {staffOnShift.length > 0 && (
            <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.12em] text-ink-faint">
              {t('cal.onShift')}
            </span>
          )}
          {staffOnShift.map((s) => {
            const sh = shifts.find((x) => x.staff_id === s.id)
            return (
              <span
                key={s.id}
                className="flex shrink-0 items-center gap-1.5 rounded-md border border-line bg-sunken px-2 py-0.5 text-xs text-ink-soft"
              >
                <span className="size-2 rounded-full" style={{ background: s.color }} aria-hidden="true" />
                {s.name}
                <span className="tabular text-ink-faint">
                  {hhmm(sh.start_min)}–{hhmm(sh.end_min)}
                </span>
              </span>
            )
          })}
        </div>
      )}

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
        <div className="min-w-max">
          {/* Column headers stay visible while the diary scrolls. */}
          <div className="sticky top-0 z-20 flex border-b border-line bg-surface/95 backdrop-blur">
            <div className="shrink-0 border-r border-line" style={{ width: GUTTER }} />
            {resources.map((r) => {
              const conflicts = layoutByResource.get(r.id)?.conflicts ?? 0
              return (
                <div
                  key={r.id}
                  className="flex-1 border-r border-line px-2 py-2 last:border-r-0"
                  style={{ minWidth: MIN_COL }}
                >
                  <p className="flex items-center gap-1.5 truncate text-sm font-medium text-ink">
                    {r.name}
                    {conflicts > 0 && (
                      <span
                        className="flex items-center gap-0.5 rounded bg-flag-high px-1 text-[10px] font-bold text-white"
                        title={t('cal.overlapWarning')}
                      >
                        <AlertTriangle className="size-2.5" aria-hidden="true" />
                        {conflicts}
                      </span>
                    )}
                  </p>
                  <p className="truncate text-xs text-ink-faint">
                    {r.zone} · {r.seats} {t('cal.seats')}
                  </p>
                </div>
              )
            })}
          </div>

          <div className="relative flex" style={{ height: bodyHeight }}>
            {/* Time gutter */}
            <div className="sticky left-0 z-10 shrink-0 border-r border-line bg-canvas" style={{ width: GUTTER }}>
              {hours.map((m) => (
                <div
                  key={m}
                  className="absolute -translate-y-1/2 pr-2 text-right text-[11px] tabular text-ink-faint"
                  style={{ top: (m - openMin) * PX_PER_MIN, width: GUTTER }}
                >
                  {hhmm(m)}
                </div>
              ))}
            </div>

            {resources.map((r) => {
              const layout = layoutByResource.get(r.id) ?? { placed: [], clusters: [] }
              return (
                <div
                  key={r.id}
                  ref={(el) => {
                    if (el) columnsRef.current.set(r.id, el)
                    else columnsRef.current.delete(r.id)
                  }}
                  className="relative flex-1 border-r border-line last:border-r-0"
                  style={{ minWidth: MIN_COL }}
                  onMouseMove={(e) => {
                    if (drag) return
                    const m = snap(minuteFromClientY(e.clientY, e.currentTarget), 15)
                    setHoverSlot({ resourceId: r.id, minute: Math.max(openMin, Math.min(closeMin - 15, m)) })
                  }}
                  onMouseLeave={() => setHoverSlot(null)}
                  onClick={(e) => {
                    if (drag || Date.now() - blockGestureAt.current < 350) return
                    if (e.target.closest('[data-block]')) return
                    const m = snap(minuteFromClientY(e.clientY, e.currentTarget), 15)
                    onCreateAt({ resource_id: r.id, start_min: Math.max(openMin, Math.min(closeMin - 60, m)) })
                  }}
                >
                  {/* Hour and half-hour rules */}
                  {hours.map((m) => (
                    <React.Fragment key={m}>
                      <div className="absolute left-0 right-0 border-t border-line" style={{ top: (m - openMin) * PX_PER_MIN }} />
                      <div
                        className="absolute left-0 right-0 border-t border-dashed border-line/60"
                        style={{ top: (m + 30 - openMin) * PX_PER_MIN }}
                      />
                    </React.Fragment>
                  ))}

                  {/* A band behind every genuine double-booking, so the clash
                      is obvious even before reading the blocks themselves. */}
                  {layout.clusters
                    .filter((c) => c.conflict)
                    .map((c) => (
                      <div
                        key={`clash-${c.id}`}
                        className="pointer-events-none absolute inset-x-0 z-[6] rounded-sm border-y border-dashed border-flag-high bg-flag-high-soft"
                        style={{
                          top: (c.start_min - openMin) * PX_PER_MIN,
                          height: (c.end_min - c.start_min) * PX_PER_MIN
                        }}
                        aria-hidden="true"
                      />
                    ))}

                  {/* Free-slot affordance */}
                  {hoverSlot?.resourceId === r.id && !drag && (
                    <div
                      className="pointer-events-none absolute inset-x-1 z-[5] flex items-center gap-1 rounded-md border border-dashed border-accent/50 bg-accent-soft/60 px-2 text-[11px] font-medium text-accent"
                      style={{ top: (hoverSlot.minute - openMin) * PX_PER_MIN, height: 60 * PX_PER_MIN }}
                    >
                      <Plus className="size-3.5" aria-hidden="true" />
                      {t('cal.bookHere', { time: hhmm(hoverSlot.minute) })}
                    </div>
                  )}

                  {layout.placed.map((slot) =>
                    slot.kind === 'break' ? (
                      <BreakBlock
                        key={`br-${slot.data.id}`}
                        brk={slot.data}
                        startMin={slot.start_min}
                        endMin={slot.end_min}
                        openMin={openMin}
                        lane={slot.lane}
                        lanes={slot.lanes}
                        conflict={slot.conflict}
                        dragging={drag?.kind === 'break' && drag.item.id === slot.data.id}
                        onPointerDown={(e, mode) => beginDrag(e, slot.data, 'break', mode)}
                      />
                    ) : (
                      <BookingTile
                        key={`bk-${slot.data.id}`}
                        booking={slot.data}
                        startMin={slot.start_min}
                        endMin={slot.end_min}
                        openMin={openMin}
                        lane={slot.lane}
                        lanes={slot.lanes}
                        conflict={slot.conflict}
                        dragging={drag?.kind === 'booking' && drag.item.id === slot.data.id}
                        dimmed={Boolean(drag) && !(drag.kind === 'booking' && drag.item.id === slot.data.id)}
                        onPointerDown={(e, mode) => beginDrag(e, slot.data, 'booking', mode)}
                        onHover={(rect) => !drag && setHover(rect ? { booking: slot.data, rect } : null)}
                      />
                    )
                  )}
                </div>
              )
            })}

            {/* Current-time rule, drawn above the columns. */}
            {nowMinutes != null && nowMinutes >= openMin && nowMinutes <= closeMin && (
              <div
                className="pointer-events-none absolute left-0 right-0 z-[18] flex items-center"
                style={{ top: (nowMinutes - openMin) * PX_PER_MIN }}
              >
                <span
                  className="sticky left-0 z-10 rounded-r bg-clay px-1 py-0.5 text-[10px] font-semibold tabular text-white"
                  style={{ minWidth: GUTTER }}
                >
                  {hhmm(nowMinutes)}
                </span>
                <span className="h-px flex-1 bg-clay" />
              </div>
            )}
          </div>
        </div>
      </div>

      {hover && <HoverCard booking={hover.booking} rect={hover.rect} />}
    </div>
  )
}

function BreakBlock({ brk, startMin, endMin, openMin, lane, lanes, conflict, dragging, onPointerDown }) {
  const { t } = useI18n()
  const top = (startMin - openMin) * PX_PER_MIN
  const height = (endMin - startMin) * PX_PER_MIN
  return (
    <div
      data-block="break"
      onPointerDown={(e) => onPointerDown(e, 'move')}
      className={cn(
        'group absolute z-[8] cursor-grab overflow-hidden rounded-lg border border-line-strong text-ink-soft transition-shadow',
        conflict && 'border-flag-high ring-1 ring-flag-high',
        dragging && 'z-30 cursor-grabbing shadow-drag'
      )}
      style={{
        top,
        height,
        ...laneStyle(lane, lanes),
        backgroundImage: 'repeating-linear-gradient(135deg, var(--sunken) 0 8px, transparent 8px 16px)',
        backgroundColor: 'var(--surface)'
      }}
      title={`${brk.title} ${hhmm(startMin)}–${hhmm(endMin)}`}
    >
      <div className="flex items-center gap-1.5 px-2 py-1">
        {conflict ? (
          <AlertTriangle className="size-3.5 shrink-0 text-flag-high" aria-hidden="true" />
        ) : (
          <Coffee className="size-3.5 shrink-0" aria-hidden="true" />
        )}
        <span className="truncate text-[11px] font-medium">{brk.title || t('cal.break')}</span>
      </div>
      {height > 34 && (
        <p className="px-2 text-[11px] tabular text-ink-faint">
          {hhmm(startMin)}–{hhmm(endMin)}
        </p>
      )}
      <button
        type="button"
        aria-label="Resize"
        onPointerDown={(e) => onPointerDown(e, 'resize')}
        className="absolute inset-x-0 bottom-0 flex h-2.5 cursor-ns-resize items-center justify-center opacity-0 transition-opacity group-hover:opacity-100"
      >
        <GripHorizontal className="size-3 text-ink-faint" />
      </button>
    </div>
  )
}
