import type { EscalationCustomer } from '@/lib/escalations/types';

// Website visitors have no phone number (see customers.channel/session_id in
// supabase/migrations/20260805020000_add_web_channel_to_customers.sql) —
// this is the one fallback string shared between the escalations list and
// detail views so WhatsApp and website conversations read consistently
// side by side.
export function customerDisplayName(customer: EscalationCustomer): string {
  return customer.name ?? customer.phone ?? 'Website visitor';
}

export function channelLabel(channel: EscalationCustomer['channel']): string {
  return channel === 'web' ? 'Website' : 'WhatsApp';
}
