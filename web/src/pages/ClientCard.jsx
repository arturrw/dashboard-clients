import React, { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Pin, Plus, Trash2, Ban, Phone, Mail, Tag, Percent, MapPin, Save
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Textarea, Field } from '@/components/ui/field'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Card, CardHeader, CardTitle, CardBody, Badge, Spinner, Switch, EmptyState } from '@/components/ui/misc'
import { STATUS_META, formatPhone } from '@/lib/booking'
import { cn, hhmm, money } from '@/lib/utils'
import { get, patch, post, del } from '@/lib/api'
import { useI18n } from '@/i18n'
import { useToast } from '@/components/Toaster'
import { useConfirm } from '@/components/ConfirmDialog'

export default function ClientCard() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t } = useI18n()
  const toast = useToast()
  const confirm = useConfirm()

  const [client, setClient] = useState(null)
  const [loading, setLoading] = useState(true)
  const [edit, setEdit] = useState(null)
  const [note, setNote] = useState({ body: '', kind: 'note' })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const c = await get(`/clients/${id}`)
      setClient(c)
      setEdit({
        name: c.name, phone: c.phone, email: c.email, birthday: c.birthday,
        tags: c.tags, permanent_note: c.permanent_note, blacklisted: Boolean(c.blacklisted)
      })
    } catch {
      toast.error(t('common.error'))
    } finally {
      setLoading(false)
    }
  }, [id, toast, t])

  useEffect(() => {
    load()
  }, [load])

  const saveClient = async () => {
    try {
      await patch(`/clients/${id}`, { ...edit, blacklisted: edit.blacklisted ? 1 : 0 })
      toast.success(t('common.save'))
      load()
    } catch {
      toast.error(t('common.error'))
    }
  }

  const addNote = async () => {
    if (!note.body.trim()) return
    await post(`/clients/${id}/notes`, note)
    setNote({ body: '', kind: 'note' })
    load()
  }

  const removeNote = async (n) => {
    const ok = await confirm({ title: t('common.delete'), body: n.body, tone: 'danger', confirmLabel: t('common.delete') })
    if (!ok) return
    await del(`/clients/${id}/notes/${n.id}`)
    load()
  }

  if (loading && !client) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-ink-soft">
        <Spinner /> {t('common.loading')}
      </div>
    )
  }
  if (!client) return null

  return (
    <div className="h-full overflow-y-auto px-3 py-4 sm:px-5">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="size-4" />
            {t('cl.title')}
          </Button>
        </div>

        <header className="card p-4">
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="h-display text-xl">{client.name}</h1>
                {client.is_new && <Badge tone="accent">{t('cl.newBadge')}</Badge>}
                {Boolean(client.blacklisted) && (
                  <Badge tone="clay"><Ban className="size-3" /> {t('cl.blacklist')}</Badge>
                )}
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-soft">
                <span className="flex items-center gap-1.5 tabular">
                  <Phone className="size-3.5 text-ink-faint" aria-hidden="true" />
                  {formatPhone(client.phone)}
                </span>
                {client.email && (
                  <span className="flex items-center gap-1.5">
                    <Mail className="size-3.5 text-ink-faint" aria-hidden="true" />
                    {client.email}
                  </span>
                )}
              </p>
            </div>

            <dl className="flex gap-5 text-right">
              <Stat label={t('cl.visits')} value={client.visits} />
              <Stat label={t('cl.spend')} value={money(client.spend)} />
              <Stat label={t('cl.last')} value={client.last_day ?? '—'} />
              {client.no_shows > 0 && <Stat label={t('cl.noShows')} value={client.no_shows} tone="clay" />}
            </dl>
          </div>

          {client.permanent_note && (
            <p className="mt-3 flex items-start gap-2 rounded-lg bg-clay-soft px-3 py-2 text-sm font-medium text-clay">
              <Pin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {client.permanent_note}
            </p>
          )}
        </header>

        <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle>{t('cl.history')}</CardTitle></CardHeader>
              {client.history.length === 0 ? (
                <EmptyState title={t('cl.noHistory')} />
              ) : (
                <ul className="divide-y divide-line">
                  {client.history.map((b) => {
                    const meta = STATUS_META[b.status] ?? STATUS_META.booked
                    return (
                      <li key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                        <span className="w-28 shrink-0 text-sm tabular text-ink">{b.day}</span>
                        <span className="w-24 shrink-0 text-xs tabular text-ink-faint">
                          {hhmm(b.start_min)}–{hhmm(b.end_min)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-ink">{b.services || '—'}</span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-faint">
                            <span className="flex items-center gap-1">
                              <MapPin className="size-3" aria-hidden="true" />
                              {b.location_name}
                            </span>
                            {b.resource_name && <span>{b.resource_name}</span>}
                            {b.staff_name && <span>· {b.staff_name}</span>}
                          </span>
                        </span>
                        {b.total_sum > 0 && (
                          <span className="shrink-0 text-sm tabular text-ink-soft">{money(b.total_sum)}</span>
                        )}
                        <span className={cn('shrink-0 rounded-md border px-1.5 py-0.5 text-[11px] font-medium', meta.chip)}>
                          {t(`status.${b.status}`)}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </Card>

            <Card>
              <CardHeader><CardTitle>{t('cl.adjustments')}</CardTitle></CardHeader>
              {client.adjustments.length === 0 ? (
                <EmptyState icon={Percent} title={t('common.empty')} />
              ) : (
                <ul className="divide-y divide-line">
                  {client.adjustments.map((a) => (
                    <li key={a.booking_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
                      <span className="w-28 shrink-0 text-sm tabular text-ink-soft">{a.day}</span>
                      <span className="min-w-0 flex-1 text-sm">
                        {a.discount_type && (
                          <span className="text-ink">
                            {t(`bk.discount.${a.discount_type}`)}{' '}
                            <span className="font-medium tabular">
                              {a.discount_type === 'percent' ? `${a.discount_value}%` : money(a.discount_value)}
                            </span>
                            {a.discount_reason ? ` — ${a.discount_reason}` : ''}
                          </span>
                        )}
                        {a.cancel_reason && (
                          <span className="block text-clay">
                            {t('bk.cancelReason')}: {a.cancel_reason}
                          </span>
                        )}
                        {a.gift_card && <span className="block text-ink-soft">{t('bk.giftCard')}: {a.gift_card}</span>}
                        {a.deposit > 0 && <span className="block text-ink-soft">{t('bk.deposit')}: {money(a.deposit)}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle>{t('common.edit')}</CardTitle></CardHeader>
              <CardBody className="space-y-3">
                <Field label={t('bk.name')}>
                  <Input value={edit.name} onChange={(e) => setEdit((d) => ({ ...d, name: e.target.value }))} />
                </Field>
                <Field label={t('bk.phone')}>
                  <Input value={edit.phone} onChange={(e) => setEdit((d) => ({ ...d, phone: e.target.value }))} className="tabular" />
                </Field>
                <Field label={t('bk.email')}>
                  <Input type="email" value={edit.email} onChange={(e) => setEdit((d) => ({ ...d, email: e.target.value }))} />
                </Field>
                <Field label={t('cl.tags')} hint="vip, allergy, corporate">
                  <div className="relative">
                    <Tag className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
                    <Input className="pl-9" value={edit.tags} onChange={(e) => setEdit((d) => ({ ...d, tags: e.target.value }))} />
                  </div>
                </Field>
                <Field label={t('cl.permanent')} hint={t('bk.permanentHint')}>
                  <Textarea
                    value={edit.permanent_note}
                    onChange={(e) => setEdit((d) => ({ ...d, permanent_note: e.target.value }))}
                    className="border-clay/40 bg-clay-soft/40"
                  />
                </Field>
                <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-line px-3 py-2">
                  <span className="flex items-center gap-2 text-sm text-ink">
                    <Ban className="size-4 text-clay" aria-hidden="true" />
                    {t('cl.blacklist')}
                  </span>
                  <Switch checked={edit.blacklisted} onCheckedChange={(v) => setEdit((d) => ({ ...d, blacklisted: v }))} />
                </label>
                <Button onClick={saveClient} className="w-full">
                  <Save className="size-4" />
                  {t('common.save')}
                </Button>
              </CardBody>
            </Card>

            <Card>
              <CardHeader><CardTitle>{t('common.notes')}</CardTitle></CardHeader>
              <CardBody className="space-y-2.5">
                <Textarea
                  value={note.body}
                  onChange={(e) => setNote((n) => ({ ...n, body: e.target.value }))}
                  placeholder={t('cl.addNote')}
                  className="min-h-[60px]"
                />
                <div className="flex items-center gap-2">
                  <Select value={note.kind} onValueChange={(v) => setNote((n) => ({ ...n, kind: v }))}>
                    <SelectTrigger className="h-8 flex-1 text-[13px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="note">{t('cl.note.note')}</SelectItem>
                      <SelectItem value="permanent">{t('cl.note.permanent')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button size="sm" onClick={addNote} disabled={!note.body.trim()}>
                    <Plus className="size-4" />
                    {t('common.add')}
                  </Button>
                </div>

                <ul className="space-y-1.5 pt-1">
                  {client.notes.map((n) => (
                    <li
                      key={n.id}
                      className={cn(
                        'group flex items-start gap-2 rounded-lg px-2.5 py-2 text-sm',
                        n.kind === 'permanent' ? 'bg-clay-soft text-clay' : 'bg-sunken text-ink-soft'
                      )}
                    >
                      {n.kind === 'permanent' && <Pin className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />}
                      <span className="min-w-0 flex-1">
                        <span className="block">{n.body}</span>
                        <span className="mt-0.5 block text-[11px] opacity-70">
                          {n.author_name} · {n.location_name} · {n.created_at}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => removeNote(n)}
                        className="cursor-pointer rounded p-1 opacity-0 transition-opacity hover:bg-surface group-hover:opacity-100"
                        aria-label={t('common.delete')}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </li>
                  ))}
                  {client.notes.length === 0 && (
                    <li className="px-1 py-2 text-xs text-ink-faint">{t('common.empty')}</li>
                  )}
                </ul>
              </CardBody>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, tone }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-[0.06em] text-ink-faint">{label}</dt>
      <dd className={cn('mt-0.5 text-lg font-semibold tabular', tone === 'clay' ? 'text-clay' : 'text-ink')}>{value}</dd>
    </div>
  )
}
