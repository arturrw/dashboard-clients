import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea, Field } from '@/components/ui/field'
import { useI18n } from '@/i18n'

const ConfirmContext = createContext(null)

/**
 * Promise-based confirmation. Anything destructive or hard to undo — moving a
 * booking, cancelling it, archiving a table — routes through here so the
 * wording, the reason field and the keyboard behaviour stay identical.
 *
 *   const ok = await confirm({ title, body })
 *   const res = await confirm({ requireReason: true })   // → { reason } | false
 */
export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null)
  const [reason, setReason] = useState('')
  const [touched, setTouched] = useState(false)
  const resolver = useRef(null)

  const confirm = useCallback((options) => {
    setReason('')
    setTouched(false)
    setState(options)
    return new Promise((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const settle = (value) => {
    resolver.current?.(value)
    resolver.current = null
    setState(null)
  }

  const value = useMemo(() => ({ confirm }), [confirm])

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <ConfirmSurface
        state={state}
        reason={reason}
        setReason={setReason}
        touched={touched}
        setTouched={setTouched}
        onSettle={settle}
      />
    </ConfirmContext.Provider>
  )
}

function ConfirmSurface({ state, reason, setReason, touched, setTouched, onSettle }) {
  const { t } = useI18n()
  const open = Boolean(state)
  const needsReason = Boolean(state?.requireReason)
  const reasonMissing = needsReason && !reason.trim()

  const accept = () => {
    if (reasonMissing) {
      setTouched(true)
      return
    }
    onSettle(needsReason ? { reason: reason.trim() } : true)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onSettle(false)}>
      <DialogContent className="w-[min(94vw,28rem)]">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <span
              className={
                state?.tone === 'danger'
                  ? 'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-clay-soft text-clay'
                  : 'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent'
              }
            >
              <AlertTriangle className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <DialogTitle>{state?.title ?? t('common.confirm')}</DialogTitle>
              {state?.body && <DialogDescription>{state.body}</DialogDescription>}
            </div>
          </div>
        </DialogHeader>

        {needsReason && (
          <DialogBody>
            <Field
              label={state.reasonLabel ?? t('bk.cancelReason')}
              required
              error={touched && reasonMissing ? t('bk.cancelReasonRequired') : undefined}
            >
              <Textarea
                autoFocus
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={state.reasonPlaceholder ?? ''}
              />
            </Field>
          </DialogBody>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onSettle(false)}>
            {state?.cancelLabel ?? t('common.cancel')}
          </Button>
          <Button
            variant={state?.tone === 'danger' ? 'danger' : 'default'}
            onClick={accept}
            disabled={touched && reasonMissing}
          >
            {state?.confirmLabel ?? t('common.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export const useConfirm = () => {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used inside ConfirmProvider')
  return ctx.confirm
}
