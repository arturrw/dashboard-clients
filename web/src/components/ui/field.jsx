import * as React from 'react'
import * as LabelPrimitive from '@radix-ui/react-label'
import { cn } from '@/lib/utils'

const base =
  'flex w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-ink-faint transition-colors focus-visible:border-accent disabled:cursor-not-allowed disabled:opacity-60'

export const Input = React.forwardRef(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(base, 'h-9', className)} {...props} />
))
Input.displayName = 'Input'

export const Textarea = React.forwardRef(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(base, 'min-h-[72px] py-2 leading-relaxed resize-y', className)} {...props} />
))
Textarea.displayName = 'Textarea'

export const Label = React.forwardRef(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn('text-[11px] font-medium uppercase tracking-[0.07em] text-ink-faint', className)}
    {...props}
  />
))
Label.displayName = 'Label'

export function Field({ label, hint, error, required, className, children }) {
  const id = React.useId()
  const child = React.isValidElement(children)
    ? React.cloneElement(children, { id: children.props.id || id })
    : children
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <Label htmlFor={id}>
          {label}
          {required && <span className="ml-0.5 text-clay">*</span>}
        </Label>
      )}
      {child}
      {error ? (
        <p className="text-xs text-clay">{error}</p>
      ) : hint ? (
        <p className="text-xs text-ink-faint">{hint}</p>
      ) : null}
    </div>
  )
}
