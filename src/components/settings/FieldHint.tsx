'use client';

import { useId, useState } from 'react';
import { Info } from 'lucide-react';

/**
 * Small info affordance shown next to a form label. Reveals a short explanation
 * on hover and on keyboard focus (so it isn't mouse-only), wired to the trigger
 * via `aria-describedby`. Deliberately dependency-free rather than pulling in a
 * full popover primitive for one line of copy.
 */
export function FieldHint({ field, label, text }: { field: string; label: string; text: string }) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={`What does ${label} mean?`}
        aria-describedby={open ? tooltipId : undefined}
        data-testid={`ai-config-${field}-hint`}
        className="text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        <Info className="size-3.5" aria-hidden="true" />
      </button>
      {open ? (
        <span
          id={tooltipId}
          role="tooltip"
          className="absolute top-full left-0 z-20 mt-1.5 w-64 rounded-md border bg-popover px-3 py-2 text-xs leading-relaxed font-normal text-popover-foreground shadow-md"
        >
          {text}
        </span>
      ) : null}
    </span>
  );
}
