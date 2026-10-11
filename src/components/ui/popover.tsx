'use client';

import type * as React from 'react';

import { cn } from '@/lib/utils';

export {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from '@saas-maker/ui/components/popover';

function PopoverHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="popover-header"
      className={cn('flex flex-col gap-1 text-sm', className)}
      {...props}
    />
  );
}

function PopoverTitle({ className, ...props }: React.ComponentProps<'h2'>) {
  return <div data-slot="popover-title" className={cn('font-medium', className)} {...props} />;
}

function PopoverDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      data-slot="popover-description"
      className={cn('text-muted-foreground', className)}
      {...props}
    />
  );
}

export { PopoverDescription, PopoverHeader, PopoverTitle };
