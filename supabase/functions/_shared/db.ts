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

export async function findOrCreateCustomer(
  supabase: SupabaseClient,
  phone: string,
  name?: string
): Promise<Customer> {
  const { data: existing, error: findError } = await supabase
    .from('customers')
    .select('id, phone, name, preferred_language')
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
        .select('id, phone, name, preferred_language')
        .single();
      if (updateError) throw updateError;
      return updated as Customer;
    }
    return existing as Customer;
  }

  const { data: created, error: insertError } = await supabase
    .from('customers')
    .insert({ phone, name: name ?? null })
    .select('id, phone, name, preferred_language')
    .single();

  if (insertError) throw insertError;
  return created as Customer;
}
