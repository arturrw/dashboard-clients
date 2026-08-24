import * as React from 'react'
import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export const DropdownMenu = DropdownPrimitive.Root
export const DropdownMenuTrigger = DropdownPrimitive.Trigger
export const DropdownMenuGroup = DropdownPrimitive.Group

export const DropdownMenuContent = React.forwardRef(({ className, sideOffset = 6, ...props }, ref) => (
  <DropdownPrimitive.Portal>
    <DropdownPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-50 min-w-[11rem] overflow-hidden rounded-xl border border-line bg-raised p-1 shadow-pop animate-scale-in',
        className
      )}
      {...props}
    />
  </DropdownPrimitive.Portal>
))
DropdownMenuContent.displayName = 'DropdownMenuContent'

export const DropdownMenuItem = React.forwardRef(({ className, inset, ...props }, ref) => (
  <DropdownPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm text-ink outline-none transition-colors data-[highlighted]:bg-sunken data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-ink-faint',
      inset && 'pl-8',
      className
    )}
    {...props}
  />
))
DropdownMenuItem.displayName = 'DropdownMenuItem'

export const DropdownMenuCheckboxItem = React.forwardRef(({ className, children, ...props }, ref) => (
  <DropdownPrimitive.CheckboxItem
    ref={ref}
    className={cn(
      'relative flex cursor-pointer select-none items-center gap-2 rounded-md py-1.5 pl-7 pr-2 text-sm text-ink outline-none data-[highlighted]:bg-sunken',
      className
    )}
    {...props}
  >
    <span className="absolute left-2 flex size-3.5 items-center justify-center">
      <DropdownPrimitive.ItemIndicator>
        <Check className="size-3.5 text-accent" />
      </DropdownPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownPrimitive.CheckboxItem>
))
DropdownMenuCheckboxItem.displayName = 'DropdownMenuCheckboxItem'

export const DropdownMenuLabel = ({ className, ...props }) => (
  <div
    className={cn('px-2 py-1.5 text-[11px] font-medium uppercase tracking-[0.07em] text-ink-faint', className)}
    {...props}
  />
)
export const DropdownMenuSeparator = ({ className, ...props }) => (
  <DropdownPrimitive.Separator className={cn('-mx-1 my-1 h-px bg-line', className)} {...props} />
)
