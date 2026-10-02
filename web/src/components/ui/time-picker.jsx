import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Clock } from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { cn, pad, hhmm, minutesFromHHMM } from '@/lib/utils'
import { useI18n } from '@/i18n'
import { useFieldId } from './field'

const FACE = 232
const CENTER = FACE / 2
const R_OUTER = 92
const R_INNER = 60
/** Anything inside this radius counts as the inner (evening) hour ring. */
const RING_SPLIT = 76

const IDX = Array.from({ length: 12 }, (_, i) => i)

/** Clock position → hour. Outer ring is 12,1…11; inner ring is 00,13…23. */
const outerHour = (idx) => (idx === 0 ? 12 : idx)
const innerHour = (idx) => (idx === 0 ? 0 : idx + 12)

const hourPlacement = (h) => {
  if (h === 0) return { idx: 0, inner: true }
  if (h === 12) return { idx: 0, inner: false }
  if (h > 12) return { idx: h - 12, inner: true }
  return { idx: h, inner: false }
}

const polar = (idx, radius, perTurn = 12) => {
  const angle = (idx / perTurn) * Math.PI * 2 - Math.PI / 2
  return { x: CENTER + radius * Math.cos(angle), y: CENTER + radius * Math.sin(angle) }
}

/**
 * Analog clock time picker. Front-desk staff read times off a clock face all
 * day; a spinner or a 96-item dropdown is slower and easier to misread. Press
 * or drag anywhere on the face — the hour ring hands over to the minute ring
 * automatically.
 */
export function TimeField({ value, onChange, minuteStep = 5, disabled, className, id: idProp }) {
  const { t } = useI18n()
  const id = useFieldId(idProp)
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState('hour')
  const [dragging, setDragging] = useState(false)
  const faceRef = useRef(null)

  const total = minutesFromHHMM(value || '00:00')
  const hour = Math.floor(total / 60) % 24
  const minute = total % 60

  useEffect(() => {
    if (open) setMode('hour')
  }, [open])

  const commit = (h, m) => onChange(`${pad(h)}:${pad(m)}`)

  /** Maps a pointer position on the face to an hour or a minute. */
  const readPointer = (event) => {
    const rect = faceRef.current.getBoundingClientRect()
    const dx = event.clientX - rect.left - CENTER
    const dy = event.clientY - rect.top - CENTER
    const radius = Math.hypot(dx, dy)
    let angle = (Math.atan2(dx, -dy) * 180) / Math.PI
    if (angle < 0) angle += 360

    if (mode === 'hour') {
      const idx = Math.round(angle / 30) % 12
      const inner = radius < RING_SPLIT
      return { hour: inner ? innerHour(idx) : outerHour(idx) }
    }
    const raw = Math.round(angle / 6) % 60
    return { minute: (Math.round(raw / minuteStep) * minuteStep) % 60 }
  }

  const apply = (event) => {
    const next = readPointer(event)
    if (next.hour !== undefined) commit(next.hour, minute)
    else commit(hour, next.minute)
  }

  useEffect(() => {
    if (!dragging) return
    const onMove = (e) => apply(e)
    const onUp = (e) => {
      apply(e)
      setDragging(false)
      // Hours hand over to minutes; picking a minute finishes the job.
      if (mode === 'hour') setMode('minute')
      else setOpen(false)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    // Re-bound whenever the reading changes, so the handlers never go stale.
  }, [dragging, mode, hour, minute, minuteStep])

  const nudge = (delta) => {
    const next = mode === 'hour' ? total + delta * 60 : total + delta * minuteStep
    const wrapped = ((next % 1440) + 1440) % 1440
    onChange(hhmm(wrapped))
  }

  const handTarget = useMemo(() => {
    if (mode === 'minute') return polar(minute / minuteStep, R_OUTER, 60 / minuteStep)
    const { idx, inner } = hourPlacement(hour)
    return polar(idx, inner ? R_INNER : R_OUTER)
  }, [mode, hour, minute, minuteStep])

  const minuteMarks = useMemo(
    () => Array.from({ length: 60 / minuteStep }, (_, i) => i * minuteStep),
    [minuteStep]
  )

  return (
    <Popover open={open} onOpenChange={disabled ? undefined : setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          disabled={disabled}
          className={cn(
            'flex h-9 w-full cursor-pointer items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-sm tabular text-ink transition-colors hover:bg-sunken disabled:cursor-not-allowed disabled:opacity-60',
            className
          )}
        >
          <Clock className="size-4 shrink-0 text-ink-faint" aria-hidden="true" />
          {value || '--:--'}
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-[17.5rem] p-3" align="start">
        <div className="mb-3 flex items-center justify-center gap-1">
          <UnitButton active={mode === 'hour'} onClick={() => setMode('hour')} onNudge={nudge}>
            {pad(hour)}
          </UnitButton>
          <span className="pb-0.5 text-2xl font-semibold text-ink-faint">:</span>
          <UnitButton active={mode === 'minute'} onClick={() => setMode('minute')} onNudge={nudge}>
            {pad(minute)}
          </UnitButton>
        </div>

        <div
          ref={faceRef}
          onPointerDown={(e) => {
            if (e.button !== 0) return
            e.preventDefault()
            setDragging(true)
            apply(e)
          }}
          className="relative mx-auto cursor-pointer touch-none select-none rounded-full bg-sunken"
          style={{ width: FACE, height: FACE }}
          role="application"
          aria-label={t('bk.time')}
        >
          {/* Hand and hub */}
          <svg className="pointer-events-none absolute inset-0" width={FACE} height={FACE} aria-hidden="true">
            <line
              x1={CENTER}
              y1={CENTER}
              x2={handTarget.x}
              y2={handTarget.y}
              stroke="var(--accent)"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <circle cx={CENTER} cy={CENTER} r="3.5" fill="var(--accent)" />
            <circle cx={handTarget.x} cy={handTarget.y} r="17" fill="var(--accent)" />
          </svg>

          {mode === 'hour' ? (
            <>
              {IDX.map((idx) => {
                const h = outerHour(idx)
                const { x, y } = polar(idx, R_OUTER)
                return <Mark key={`o${idx}`} x={x} y={y} label={pad(h)} active={h === hour} />
              })}
              {IDX.map((idx) => {
                const h = innerHour(idx)
                const { x, y } = polar(idx, R_INNER)
                return <Mark key={`i${idx}`} x={x} y={y} label={pad(h)} active={h === hour} small />
              })}
            </>
          ) : (
            minuteMarks.map((m) => {
              const { x, y } = polar(m / minuteStep, R_OUTER, 60 / minuteStep)
              return <Mark key={m} x={x} y={y} label={pad(m)} active={m === minute} />
            })
          )}
        </div>

        <p className="mt-2.5 text-center text-[11px] text-ink-faint">{t('bk.clockHint')}</p>
      </PopoverContent>
    </Popover>
  )
}

function Mark({ x, y, label, active, small }) {
  return (
    <span
      className={cn(
        'pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full font-medium tabular',
        small ? 'size-7 text-[11px]' : 'size-8 text-[13px]',
        active ? 'text-white' : 'text-ink-soft'
      )}
      style={{ left: x, top: y }}
    >
      {label}
    </span>
  )
}

function UnitButton({ active, onClick, onNudge, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          onNudge(1)
        } else if (e.key === 'ArrowDown') {
          e.preventDefault()
          onNudge(-1)
        }
      }}
      className={cn(
        'cursor-pointer rounded-lg px-2.5 py-1 text-2xl font-semibold tabular transition-colors',
        active ? 'bg-accent-soft text-accent' : 'text-ink-faint hover:text-ink'
      )}
    >
      {children}
    </button>
  )
}
