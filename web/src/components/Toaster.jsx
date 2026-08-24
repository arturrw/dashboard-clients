import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const ToastContext = createContext(null)

const TONES = {
  success: { icon: CheckCircle2, cls: 'border-accent bg-accent-soft text-accent' },
  error: { icon: AlertTriangle, cls: 'border-clay bg-clay-soft text-clay' },
  info: { icon: Info, cls: 'border-line-strong bg-surface text-ink' }
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), [])
  const toast = useCallback((message, tone = 'info', ttl = 4000) => {
    const id = Math.random().toString(36).slice(2)
    setToasts((list) => [...list, { id, message, tone, ttl }])
    return id
  }, [])

  const value = useMemo(
    () => ({
      toast,
      success: (m) => toast(m, 'success'),
      error: (m) => toast(m, 'error', 6000),
      dismiss
    }),
    [toast, dismiss]
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(92vw,22rem)] flex-col gap-2"
        role="status"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastItem({ toast, onDismiss }) {
  const { icon: Icon, cls } = TONES[toast.tone] ?? TONES.info
  useEffect(() => {
    const id = setTimeout(() => onDismiss(toast.id), toast.ttl)
    return () => clearTimeout(id)
  }, [toast, onDismiss])
  return (
    <div className={cn('pointer-events-auto flex items-start gap-2 rounded-xl border px-3 py-2.5 shadow-pop animate-scale-in', cls)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p className="flex-1 text-sm leading-snug">{toast.message}</p>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="cursor-pointer rounded p-0.5 opacity-60 transition-opacity hover:opacity-100"
        aria-label="Dismiss"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}

export const useToast = () => {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}
