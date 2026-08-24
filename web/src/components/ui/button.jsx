import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors duration-150 cursor-pointer disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-accent text-accent-ink hover:bg-accent-hover',
        outline: 'border border-line-strong bg-surface text-ink hover:bg-sunken',
        ghost: 'text-ink-soft hover:bg-sunken hover:text-ink',
        soft: 'bg-accent-soft text-accent hover:brightness-[0.97]',
        danger: 'bg-clay text-white hover:brightness-110',
        'danger-outline': 'border border-clay text-clay hover:bg-clay-soft',
        link: 'text-accent underline-offset-4 hover:underline'
      },
      size: {
        default: 'h-9 px-3.5',
        sm: 'h-8 px-2.5 text-[13px]',
        xs: 'h-7 px-2 text-xs rounded-md',
        lg: 'h-10 px-5',
        icon: 'h-9 w-9',
        'icon-sm': 'h-7 w-7 rounded-md'
      }
    },
    defaultVariants: { variant: 'default', size: 'default' }
  }
)

export const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button'
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />
})
Button.displayName = 'Button'
export { buttonVariants }
