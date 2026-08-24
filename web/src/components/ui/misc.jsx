import * as React from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import * as SeparatorPrimitive from '@radix-ui/react-separator'
import { cn } from '@/lib/utils'

/* ---------------------------------- badge ---------------------------------- */

const badgeTones = {
  neutral: 'bg-sunken text-ink-soft border-line',
  accent: 'bg-accent-soft text-accent border-transparent',
  gold: 'bg-gold-soft text-gold border-transparent',
  clay: 'bg-clay-soft text-clay border-transparent',
  steel: 'bg-steel-soft text-steel border-transparent',
  solid: 'bg-accent text-accent-ink border-transparent'
}

export function Badge({ tone = 'neutral', className, ...props }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-tight',
        badgeTones[tone] ?? badgeTones.neutral,
        className
      )}
      {...props}
    />
  )
}

/* ---------------------------------- card ----------------------------------- */

export const Card = ({ className, ...props }) => <div className={cn('card', className)} {...props} />
export const CardHeader = ({ className, ...props }) => (
  <div className={cn('flex items-start justify-between gap-3 border-b border-line px-4 py-3', className)} {...props} />
)
export const CardTitle = ({ className, ...props }) => (
  <h2 className={cn('h-display text-[15px]', className)} {...props} />
)
export const CardBody = ({ className, ...props }) => <div className={cn('p-4', className)} {...props} />

/* ---------------------------------- tabs ----------------------------------- */

export const Tabs = TabsPrimitive.Root
export const TabsList = React.forwardRef(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn('inline-flex items-center gap-1 rounded-lg border border-line bg-sunken p-1', className)}
    {...props}
  />
))
TabsList.displayName = 'TabsList'
export const TabsTrigger = React.forwardRef(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium text-ink-soft transition-colors hover:text-ink data-[state=active]:bg-surface data-[state=active]:text-ink data-[state=active]:shadow-card',
      className
    )}
    {...props}
  />
))
TabsTrigger.displayName = 'TabsTrigger'
export const TabsContent = TabsPrimitive.Content

/* --------------------------------- tooltip --------------------------------- */

export const TooltipProvider = TooltipPrimitive.Provider
export const Tooltip = TooltipPrimitive.Root
export const TooltipTrigger = TooltipPrimitive.Trigger
export const TooltipContent = React.forwardRef(({ className, sideOffset = 6, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-50 rounded-md bg-ink px-2 py-1 text-xs text-canvas shadow-pop animate-fade-in',
        className
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
))
TooltipContent.displayName = 'TooltipContent'

export function Hint({ label, children, side = 'top' }) {
  if (!label) return children
  return (
    <Tooltip delayDuration={350}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  )
}

/* --------------------------------- switch ---------------------------------- */

export const Switch = React.forwardRef(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors data-[state=checked]:bg-accent data-[state=unchecked]:bg-line-strong',
      className
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb className="pointer-events-none block size-4 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[18px] data-[state=unchecked]:translate-x-0.5" />
  </SwitchPrimitive.Root>
))
Switch.displayName = 'Switch'

export const Separator = ({ className, orientation = 'horizontal', ...props }) => (
  <SeparatorPrimitive.Root
    orientation={orientation}
    className={cn('bg-line', orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px', className)}
    {...props}
  />
)

/* ------------------------------ status feedback ----------------------------- */

export const Spinner = ({ className }) => (
  <svg className={cn('size-4 animate-spin text-ink-faint', className)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".2" strokeWidth="3" />
    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
)

/** Reserves the same box the loaded content will occupy, so nothing jumps. */
export const Skeleton = ({ className }) => (
  <div className={cn('animate-pulse rounded-md bg-sunken', className)} />
)

export function EmptyState({ icon: Icon, title, body, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      {Icon && <Icon className="size-6 text-ink-faint" aria-hidden="true" />}
      <p className="h-display text-[15px]">{title}</p>
      {body && <p className="max-w-sm text-sm text-ink-soft">{body}</p>}
      {action}
    </div>
  )
}
