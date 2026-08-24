import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

export const DialogContent = React.forwardRef(({ className, children, hideClose, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-[#1c1a17]/35 backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed left-1/2 top-1/2 z-50 flex max-h-[92vh] w-[min(96vw,44rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-pop animate-scale-in',
        className
      )}
      {...props}
    >
      {children}
      {!hideClose && (
        <DialogPrimitive.Close className="absolute right-3.5 top-3.5 cursor-pointer rounded-md p-1.5 text-ink-faint transition-colors hover:bg-sunken hover:text-ink">
          <X className="size-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
))
DialogContent.displayName = 'DialogContent'

export const DialogHeader = ({ className, ...props }) => (
  <div className={cn('shrink-0 border-b border-line px-5 py-4 pr-12', className)} {...props} />
)
export const DialogBody = ({ className, ...props }) => (
  <div className={cn('min-h-0 flex-1 overflow-y-auto px-5 py-4', className)} {...props} />
)
export const DialogFooter = ({ className, ...props }) => (
  <div
    className={cn(
      'shrink-0 flex flex-wrap items-center justify-end gap-2 border-t border-line bg-sunken px-5 py-3',
      className
    )}
    {...props}
  />
)
export const DialogTitle = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn('h-display text-lg', className)} {...props} />
))
DialogTitle.displayName = 'DialogTitle'
export const DialogDescription = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn('mt-0.5 text-sm text-ink-soft', className)} {...props} />
))
DialogDescription.displayName = 'DialogDescription'
