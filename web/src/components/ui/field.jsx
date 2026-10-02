import * as React from 'react'
import * as LabelPrimitive from '@radix-ui/react-label'
import { cn } from '@/lib/utils'

/**
 * The id a Field's label points at. Controls pick it up from context rather
 * than from cloneElement, so the label still reaches an input wrapped in an
 * icon container, or a Radix Select whose Root renders no element of its own.
 */
const FieldIdContext = React.createContext(undefined)
export const useFieldId = (id) => id ?? React.useContext(FieldIdContext)

const base =
  'flex w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-ink-faint transition-colors focus-visible:border-accent disabled:cursor-not-allowed disabled:opacity-60'

export const Input = React.forwardRef(({ className, id, ...props }, ref) => (
  <input ref={ref} id={useFieldId(id)} className={cn(base, 'h-9', className)} {...props} />
))
Input.displayName = 'Input'

export const Textarea = React.forwardRef(({ className, id, ...props }, ref) => (
  <textarea ref={ref} id={useFieldId(id)} className={cn(base, 'min-h-[72px] py-2 leading-relaxed resize-y', className)} {...props} />
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
  // Plain DOM controls still take the id directly; components read it from context.
  const child =
    React.isValidElement(children) && ['input', 'textarea', 'select'].includes(children.type)
      ? React.cloneElement(children, { id: children.props.id || id })
      : children
  return (
    <FieldIdContext.Provider value={id}>
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
    </FieldIdContext.Provider>
  )
}
