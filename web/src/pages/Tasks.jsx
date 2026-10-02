import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Trash2, CalendarClock, User, Building2, GripVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Textarea, Field } from '@/components/ui/field'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { Spinner, Hint } from '@/components/ui/misc'
import LocationSwitcher from '@/components/LocationSwitcher'
import { TASK_PRIORITIES, TASK_PRIORITY_META } from '@/lib/booking'
import { cn, isoDay } from '@/lib/utils'
import { get, post, patch, del } from '@/lib/api'
import { useSession } from '@/lib/session'
import { useI18n } from '@/i18n'
import { useToast } from '@/components/Toaster'
import { useConfirm } from '@/components/ConfirmDialog'

const COLUMNS = ['open', 'in_progress', 'done']
const EMPTY = { title: '', body: '', priority: 'normal', status: 'open', due_day: '', assignee_id: null, location_id: null }
/** Pointer travel before a press becomes a drag rather than a click. */
const DRAG_THRESHOLD = 5

export default function Tasks() {
  const { t } = useI18n()
  const { locationId, locations, location } = useSession()
  const toast = useToast()
  const confirm = useConfirm()

  const [scope, setScope] = useState('venue')
  const [tasks, setTasks] = useState([])
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState(null)
  const [drag, setDrag] = useState(null)
  const dragRef = useRef(null)

  const columnRefs = useRef(new Map())

  const load = useCallback(async () => {
    if (!locationId) return
    setLoading(true)
    try {
      const [rows, staffRows] = await Promise.all([
        get(`/tasks${scope === 'all' ? '?scope=all' : ''}`),
        get('/staff')
      ])
      setTasks(rows)
      setStaff(staffRows)
    } finally {
      setLoading(false)
    }
  }, [locationId, scope])

  useEffect(() => {
    load()
  }, [load])

  const grouped = useMemo(() => {
    const map = { open: [], in_progress: [], done: [] }
    for (const task of tasks) map[task.status]?.push(task)
    return map
  }, [tasks])

  const move = useCallback(
    async (task, status) => {
      if (task.status === status) return
      // Optimistic: the card lands in the new column immediately, and only
      // rolls back by reloading if the server refuses.
      setTasks((list) => list.map((x) => (x.id === task.id ? { ...x, status } : x)))
      try {
        await patch(`/tasks/${task.id}`, { status })
      } catch {
        toast.error(t('common.error'))
        load()
      }
    },
    [load, t, toast]
  )

  /* --------------------------------- dragging -------------------------------- */

  const beginDrag = (event, task) => {
    // Touch keeps the explicit buttons so the board can still be scrolled.
    if (event.button !== 0 || (event.pointerType !== 'mouse' && event.pointerType !== 'pen')) return
    if (event.target.closest('[data-no-drag]')) return
    const rect = event.currentTarget.getBoundingClientRect()
    dragRef.current = {
      task,
      width: rect.width,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      originX: event.clientX,
      originY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      moved: false,
      over: task.status
    }
    setDrag(dragRef.current)
  }

  useEffect(() => {
    if (!drag) return

    const onMove = (e) => {
      const d = dragRef.current
      if (!d) return
      const far =
        Math.abs(e.clientX - d.originX) > DRAG_THRESHOLD || Math.abs(e.clientY - d.originY) > DRAG_THRESHOLD
      const moved = d.moved || far
      if (moved && !d.moved) document.body.classList.add('is-dragging')

      let over = d.over
      if (moved) {
        for (const [status, el] of columnRefs.current) {
          const r = el.getBoundingClientRect()
          if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
            over = status
            break
          }
        }
      }
      dragRef.current = { ...d, x: e.clientX, y: e.clientY, moved, over }
      setDrag(dragRef.current)
    }

    const finish = (commit) => {
      document.body.classList.remove('is-dragging')
      // Side effects stay out of the state updater: StrictMode runs updaters
      // twice, which would send the status change to the API twice.
      const d = dragRef.current
      dragRef.current = null
      setDrag(null)
      if (!d) return
      if (!d.moved) setDraft({ ...d.task })
      else if (commit && d.over !== d.task.status) move(d.task, d.over)
    }

    const onUp = () => finish(true)
    const onKey = (e) => e.key === 'Escape' && finish(false)

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      window.removeEventListener('keydown', onKey)
    }
  }, [drag, move])

  // The effect above re-binds on every pointer move, so its cleanup must not
  // clear the drag cursor; only leaving the page mid-drag should.
  useEffect(() => () => document.body.classList.remove('is-dragging'), [])

  /* ---------------------------------- saving --------------------------------- */

  const save = async () => {
    if (!draft.title.trim()) return
    const body = { ...draft, location_id: draft.location_id ?? locationId }
    try {
      if (draft.id) await patch(`/tasks/${draft.id}`, body)
      else await post('/tasks', body)
      setDraft(null)
      load()
      toast.success(t('common.save'))
    } catch {
      toast.error(t('common.error'))
    }
  }

  const remove = async (task) => {
    const ok = await confirm({ title: t('common.delete'), body: task.title, tone: 'danger', confirmLabel: t('common.delete') })
    if (!ok) return
    await del(`/tasks/${task.id}`)
    load()
  }

  const today = isoDay(new Date())
  const dragging = drag?.moved ? drag : null

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-2.5 sm:px-4">
        <div className="min-w-0">
          <h1 className="h-display text-base leading-tight">{t('task.title')}</h1>
          <p className="truncate text-xs text-ink-faint">
            {scope === 'all' ? t('common.all.locations') : location?.name}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* One control for both jobs: pick a venue's own board, or see them all. */}
          <LocationSwitcher
            allowAll
            allSelected={scope === 'all'}
            onSelectAll={(next) => setScope(next === false ? 'venue' : 'all')}
          />
          <Button size="sm" onClick={() => setDraft({ ...EMPTY, location_id: locationId })}>
            <Plus className="size-4" />
            <span className="hidden sm:inline">{t('task.new')}</span>
          </Button>
        </div>
      </header>

      <p className="shrink-0 border-b border-line bg-canvas px-4 py-1 text-[11px] text-ink-faint">
        {t('task.dragHint')}
      </p>

      {loading && !tasks.length ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-ink-soft">
          <Spinner /> {t('common.loading')}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto p-3 sm:p-4">
          <div className="grid gap-3 lg:grid-cols-3">
            {COLUMNS.map((col) => {
              const isTarget = dragging && dragging.over === col
              const wouldChange = isTarget && dragging.task.status !== col
              return (
                <section
                  key={col}
                  ref={(el) => {
                    if (el) columnRefs.current.set(col, el)
                    else columnRefs.current.delete(col)
                  }}
                  className={cn(
                    'flex min-h-[10rem] flex-col rounded-xl border bg-sunken/60 transition-colors',
                    wouldChange ? 'border-accent bg-accent-soft/60 ring-2 ring-accent' : 'border-line'
                  )}
                >
                  <header className="flex items-center gap-2 px-3 py-2">
                    <h2 className="text-sm font-medium text-ink">{t(`task.status.${col}`)}</h2>
                    <span className="rounded-md bg-surface px-1.5 text-xs tabular text-ink-faint">
                      {grouped[col].length}
                    </span>
                  </header>

                  <div className="flex-1 space-y-2 px-2 pb-2">
                    {grouped[col].length === 0 && !wouldChange && (
                      <p className="px-1 py-4 text-center text-xs text-ink-faint">{t('common.empty')}</p>
                    )}

                    {grouped[col].map((task) => {
                      const overdue = task.status !== 'done' && task.due_day && task.due_day < today
                      const isDragged = dragging?.task.id === task.id
                      return (
                        <article
                          key={task.id}
                          role="button"
                          tabIndex={0}
                          onPointerDown={(e) => beginDrag(e, task)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              setDraft({ ...task })
                            }
                          }}
                          className={cn(
                            'group relative cursor-grab select-none rounded-lg border border-line bg-surface p-2.5 pl-3 shadow-card transition-colors hover:border-line-strong',
                            task.status === 'done' && 'opacity-60',
                            isDragged && 'opacity-35'
                          )}
                        >
                          <span
                            className={cn('absolute inset-y-2 left-0 w-1 rounded-full', TASK_PRIORITY_META[task.priority]?.bar)}
                            aria-hidden="true"
                          />
                          <div className="flex items-start gap-2">
                            <GripVertical
                              className="mt-0.5 size-3.5 shrink-0 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100"
                              aria-hidden="true"
                            />
                            <p className={cn('min-w-0 flex-1 text-sm font-medium text-ink', task.status === 'done' && 'line-through')}>
                              {task.title}
                            </p>
                            <Hint label={t('common.delete')}>
                              <button
                                type="button"
                                data-no-drag
                                onClick={(e) => {
                                  e.stopPropagation()
                                  remove(task)
                                }}
                                className="cursor-pointer rounded p-1 text-ink-faint opacity-0 transition hover:bg-clay-soft hover:text-clay focus-visible:opacity-100 group-hover:opacity-100"
                                aria-label={t('common.delete')}
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            </Hint>
                          </div>

                          {task.body && <p className="mt-1 line-clamp-2 pl-5 text-xs text-ink-soft">{task.body}</p>}

                          <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-5">
                            <span className={cn('rounded-md border px-1.5 py-0.5 text-[11px] font-medium', TASK_PRIORITY_META[task.priority]?.chip)}>
                              {t(`prio.${task.priority}`)}
                            </span>
                            {task.due_day && (
                              <span className={cn('flex items-center gap-1 text-[11px] tabular', overdue ? 'font-medium text-clay' : 'text-ink-faint')}>
                                <CalendarClock className="size-3" aria-hidden="true" />
                                {task.due_day}
                                {overdue && ` · ${t('task.overdue')}`}
                              </span>
                            )}
                            {task.assignee_name && (
                              <span className="flex items-center gap-1 text-[11px] text-ink-faint">
                                <User className="size-3" aria-hidden="true" />
                                {task.assignee_name}
                              </span>
                            )}
                            {scope === 'all' && task.location_name && (
                              <span className="flex items-center gap-1 text-[11px] text-ink-faint">
                                <Building2 className="size-3" aria-hidden="true" />
                                {task.location_name}
                              </span>
                            )}
                          </div>

                          {/*
                            Keyboard and touch fallback for the drag: hidden until the
                            card is hovered or focused, always shown where there is no
                            hover (phones, the till's touch screen).
                          */}
                          <div
                            data-no-drag
                            className="mt-2 flex gap-1 pl-5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
                          >
                            {COLUMNS.filter((c) => c !== task.status).map((c) => (
                              <Button
                                key={c}
                                variant="ghost"
                                size="xs"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  move(task, c)
                                }}
                              >
                                → {t(`task.status.${c}`)}
                              </Button>
                            ))}
                          </div>
                        </article>
                      )
                    })}

                    {/* Landing strip so an empty column still reads as a valid target. */}
                    {wouldChange && (
                      <p className="rounded-lg border-2 border-dashed border-accent bg-surface/60 px-2 py-3 text-center text-xs font-medium text-accent">
                        {t('task.dropHere', { status: t(`task.status.${col}`) })}
                      </p>
                    )}
                  </div>
                </section>
              )
            })}
          </div>
        </div>
      )}

      {/* The card under the cursor while dragging. */}
      {dragging && (
        <div
          className="pointer-events-none fixed z-[70] rounded-lg border border-accent bg-surface p-2.5 pl-3 shadow-drag"
          style={{
            width: dragging.width,
            left: dragging.x - dragging.offsetX,
            top: dragging.y - dragging.offsetY,
            transform: 'rotate(-1.5deg)'
          }}
        >
          <p className="text-sm font-medium text-ink">{dragging.task.title}</p>
          <span className={cn('mt-1.5 inline-block rounded-md border px-1.5 py-0.5 text-[11px] font-medium', TASK_PRIORITY_META[dragging.task.priority]?.chip)}>
            {t(`prio.${dragging.task.priority}`)}
          </span>
        </div>
      )}

      <Dialog open={Boolean(draft)} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="w-[min(94vw,32rem)]">
          <DialogHeader>
            <DialogTitle>{draft?.id ? t('common.edit') : t('task.new')}</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <Field label={t('task.name')} required>
              <Input autoFocus value={draft?.title ?? ''} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />
            </Field>
            <Field label={t('task.body')}>
              <Textarea value={draft?.body ?? ''} onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('bk.status')}>
                <Select value={draft?.status ?? 'open'} onValueChange={(v) => setDraft((d) => ({ ...d, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COLUMNS.map((c) => (
                      <SelectItem key={c} value={c}>{t(`task.status.${c}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t('task.priority')}>
                <Select value={draft?.priority ?? 'normal'} onValueChange={(v) => setDraft((d) => ({ ...d, priority: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TASK_PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>{t(`prio.${p}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t('task.due')}>
                <Input type="date" value={draft?.due_day ?? ''} onChange={(e) => setDraft((d) => ({ ...d, due_day: e.target.value }))} className="tabular" />
              </Field>
              <Field label={t('task.assignee')}>
                <Select
                  value={draft?.assignee_id ? String(draft.assignee_id) : 'none'}
                  onValueChange={(v) => setDraft((d) => ({ ...d, assignee_id: v === 'none' ? null : Number(v) }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('common.none')}</SelectItem>
                    {staff.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t('task.forLocation')} className="sm:col-span-2">
                <Select
                  value={String(draft?.location_id ?? locationId ?? '')}
                  onValueChange={(v) => setDraft((d) => ({ ...d, location_id: Number(v) }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {locations.map((l) => (
                      <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>{t('common.cancel')}</Button>
            <Button onClick={save} disabled={!draft?.title?.trim()}>{t('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
