import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Customer } from './types.ts';

export function getServiceClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceRoleKey) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set');
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

const CUSTOMER_COLUMNS = 'id, phone, name, preferred_language, channel, session_id';

export async function findOrCreateCustomer(
  supabase: SupabaseClient,
  phone: string,
  name?: string
): Promise<Customer> {
  const { data: existing, error: findError } = await supabase
    .from('customers')
    .select(CUSTOMER_COLUMNS)
    .eq('phone', phone)
    .maybeSingle();

  if (findError) throw findError;

  if (existing) {
    // Backfill name if we now have one and didn't before (e.g. Twilio's
    // WhatsApp ProfileName wasn't available on an earlier message).
    if (name && !existing.name) {
      const { data: updated, error: updateError } = await supabase
        .from('customers')
        .update({ name, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select(CUSTOMER_COLUMNS)
        .single();
      if (updateError) throw updateError;
      return updated as Customer;
    }
    return existing as Customer;
  }

  const { data: created, error: insertError } = await supabase
    .from('customers')
    .insert({ phone, name: name ?? null, channel: 'whatsapp' })
    .select(CUSTOMER_COLUMNS)
    .single();

  if (insertError) throw insertError;
  return created as Customer;
}

// Website widget counterpart to findOrCreateCustomer: visitors have no
// phone number, only a browser-generated session id (see
// src/lib/widget/buildWidgetScript.ts, persisted client-side in
// localStorage) so returning visitors keep their conversation history/memory
// the same way returning WhatsApp customers do.
export async function findOrCreateWebCustomer(
  supabase: SupabaseClient,
  sessionId: string
): Promise<Customer> {
  const { data: existing, error: findError } = await supabase
    .from('customers')
    .select(CUSTOMER_COLUMNS)
    .eq('channel', 'web')
    .eq('session_id', sessionId)
    .maybeSingle();

  if (findError) throw findError;
  if (existing) return existing as Customer;

  const { data: created, error: insertError } = await supabase
    .from('customers')
    .insert({ channel: 'web', session_id: sessionId })
    .select(CUSTOMER_COLUMNS)
    .single();

  if (insertError) throw insertError;
  return created as Customer;
}
