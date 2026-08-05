'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DEFAULT_STATUSES } from '@/lib/escalations/constants';
import type { EscalationStatus } from '@/lib/escalations/types';

const STATUS_OPTIONS: { value: EscalationStatus; label: string }[] = [
  { value: 'needs_attention', label: 'Needs attention' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'responded', label: 'Responded' },
];

function statusTriggerLabel(statuses: EscalationStatus[]): string {
  if (statuses.length === 0) return 'Status: none';
  if (statuses.length === STATUS_OPTIONS.length) return 'Status: all';
  return `Status: ${statuses.map((s) => STATUS_OPTIONS.find((o) => o.value === s)?.label).join(', ')}`;
}

export function EscalationFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const initialStatuses = (searchParams.get('status')?.split(',') ??
    DEFAULT_STATUSES) as EscalationStatus[];
  const [statuses, setStatuses] = useState<EscalationStatus[]>(initialStatuses);
  const [from, setFrom] = useState(searchParams.get('from')?.slice(0, 10) ?? '');
  const [to, setTo] = useState(searchParams.get('to')?.slice(0, 10) ?? '');

  function toggleStatus(value: EscalationStatus) {
    setStatuses((prev) =>
      prev.includes(value) ? prev.filter((s) => s !== value) : [...prev, value]
    );
  }

  function applyFilters() {
    const params = new URLSearchParams();
    if (statuses.length > 0) params.set('status', statuses.join(','));
    if (from) params.set('from', `${from}T00:00:00.000Z`);
    if (to) params.set('to', `${to}T23:59:59.999Z`);
    // Push to the current pathname (not a hardcoded index route) so applying
    // filters while a detail pane is open doesn't discard it.
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div
      className="flex flex-wrap items-center gap-3 rounded-md border p-3"
      data-testid="escalation-filters"
    >
      {/* modal={false}: keeps the rest of the bar (the Apply button in
          particular) clickable while the status menu is open, instead of
          Radix's default modal behavior which blocks outside pointer events. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="justify-between font-normal"
            data-testid="escalation-filter-status-trigger"
          >
            {statusTriggerLabel(statuses)}
            <ChevronDown className="size-4 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {STATUS_OPTIONS.map((option) => (
            <DropdownMenuCheckboxItem
              key={option.value}
              data-testid={`escalation-filter-status-${option.value}-checkbox`}
              checked={statuses.includes(option.value)}
              onCheckedChange={() => toggleStatus(option.value)}
              onSelect={(event) => event.preventDefault()}
            >
              {option.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="flex items-center gap-1.5">
        <Label htmlFor="escalation-filter-from" className="text-xs text-muted-foreground">
          From
        </Label>
        <Input
          id="escalation-filter-from"
          data-testid="escalation-filter-from-input"
          type="date"
          className="w-auto"
          value={from}
          onChange={(event) => setFrom(event.target.value)}
        />
      </div>

      <div className="flex items-center gap-1.5">
        <Label htmlFor="escalation-filter-to" className="text-xs text-muted-foreground">
          To
        </Label>
        <Input
          id="escalation-filter-to"
          data-testid="escalation-filter-to-input"
          type="date"
          className="w-auto"
          value={to}
          onChange={(event) => setTo(event.target.value)}
        />
      </div>

      <Button onClick={applyFilters} data-testid="escalation-filter-apply-button">
        Apply filters
      </Button>
    </div>
  );
}
