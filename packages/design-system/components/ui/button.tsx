import { Slot } from '@radix-ui/react-slot';
import { cn } from '@repo/design-system/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';

const baseClassNames = [
  'inline-flex',
  'items-center',
  'justify-center',
  'gap-1',
  'whitespace-nowrap',
  'text-xl',
  'font-semibold',
  'transition-all',
  'disabled:pointer-events-none',
  '[&_svg]:pointer-events-none',
  "[&_svg:not([class*='size-'])]:size-4",
  'shrink-0',
  '[&_svg]:shrink-0',
  'outline-none',
  'focus-visible:border-ring',
  'focus-visible:ring-ring/50',
  'focus-visible:ring-[3px]',
  'aria-invalid:ring-destructive/20',
  'dark:aria-invalid:ring-destructive/40',
  'aria-invalid:border-destructive',
];

const buttonVariants = cva(baseClassNames, {
  variants: {
    variant: {
      primary: [
        'uppercase',
        'bg-button-primary',
        'text-button-primary-foreground',
        'hover:bg-chief-blue-500',
        'dark:hover:bg-yakima-red-400',
        'active:bg-chief-blue-900',
        'focus:bg-button-primary',
        'focus-visible:ring-chief-blue-300',
        'disabled:bg-neutral-400',
        'disabled:text-neutral-300',
        'dark:active:bg-yakima-red-600',
        'yakima-red-theme:disabled:bg-neutral-300',
        'yakima-red-theme:disabled:text-neutral-400',
        'image-theme:hover:bg-yakima-red-400',
      ],
      secondary: [
        'uppercase',
        'border-2',
        'border-button-primary-border',
        'text-foreground',
        'hover:border-chief-blue-500',
        'hover:text-chief-blue-500',
        'focus-visible:ring-chief-blue-300',
        'active:border-button-secondary-foreground',
        'active:text-button-secondary-foreground',
        'disabled:border-neutral-400',
        'disabled:text-neutral-400',
        'dark:hover:bg-base-white',
        'dark:hover:border-base-white',
        'dark:hover:text-chief-blue-950',
        'dark:active:border-yakima-red-400',
        'dark:active:text-yakima-red-400',
        'dark:active:bg-transparent',
        'yakima-red-theme:hover:bg-base-white',
        'yakima-red-theme:hover:border-base-white',
        'yakima-red-theme:hover:text-chief-blue-950',
        'yakima-red-theme:active:bg-transparent',
        'yakima-red-theme:active:text-chief-blue-950',
        'yakima-red-theme:active:border-chief-blue-950',
        'yakima-red-theme:disabled:border-yakima-red-200',
        'yakima-red-theme:disabled:text-yakima-red-200',
        'image-theme:hover:bg-base-white',
        'image-theme:hover:border-base-white',
        'image-theme:hover:text-chief-blue-950',
        'image-theme:active:border-french-paper-600',
        'image-theme:active:text-french-paper-600',
        'image-theme:active:bg-transparent',
      ],
      tertiary: [
        'uppercase',
        'rounded-full',
        'px-2',
        'text-foreground',
        'hover:text-chief-blue-500',
        'active:text-chief-blue-800',
        'hover:underline',
        'active:text-chief-blue-800',
        'focus-visible:ring-chief-blue-300',
        'disabled:text-neutral-400',
        'dark:hover:text-yakima-red-200',
        'dark:active:text-yakima-red-400',
        'yakima-red-theme:hover:text-french-paper-500',
        'yakima-red-theme:active:text-chief-blue-950',
        'yakima-red-theme:disabled:text-yakima-red-300',
      ],
      link: [
        'rounded-full',
        'px-1',
        'hover:underline',
        'hover:text-chief-blue-500',
        'focus-visible',
        'focus-visible:underline',
        'focus-visible:ring-chief-blue-300',
        'active:underline',
        'active:text-chief-blue-800',
        'disabled:underline',
        'disabled:text-neutral-400',
        'dark:underline',
        'dark:hover:text-yakima-red-200',
        'dark:active:text-yakima-red-400',
        'yakima-red-theme:hover:text-french-paper-500',
        'yakima-red-theme:active:text-chief-blue-950',
        'yakima-red-theme:disabled:text-yakima-red-300',
      ],
    },
    size: {
      lg: ['h-10', 'py-1', 'px-5', 'rounded-full', 'has-[>svg]:pr-2.5'],
      md: ['h-8', 'py-1', 'px-5', 'rounded-full', 'has-[>svg]:pr-2.5'],
      sm: ['h-6', 'py-1', 'px-4', 'rounded-full', 'has-[>svg]:pr-1', 'text-base'],
    },
  },
  defaultVariants: {
    variant: 'primary',
  },
});

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : 'button';

  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };
