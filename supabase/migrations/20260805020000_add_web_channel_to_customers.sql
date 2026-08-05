-- Adds a second customer channel (the website chat widget) alongside
-- WhatsApp. WhatsApp customers are keyed by phone; website visitors have no
-- phone number, only a browser-generated session id persisted in
-- localStorage — so phone becomes optional and session_id is added,
-- disambiguated by `channel`. All existing memory/summary/escalation logic
-- keys off `customer_id` and is untouched by this change.

alter table public.customers
  add column channel text not null default 'whatsapp'
    check (channel in ('whatsapp', 'web'));

alter table public.customers
  alter column phone drop not null;

alter table public.customers
  drop constraint customers_phone_key;

-- Superseded by customers_phone_unique_idx below, which covers every actual
-- lookup (findOrCreateCustomer always queries by a real phone value, never
-- null) while also enforcing uniqueness in one index instead of two.
drop index public.customers_phone_idx;

-- Partial unique indexes: multiple web customers legitimately have
-- phone/session_id = null for the other channel, so a plain unique
-- constraint (which treats every null as distinct anyway in Postgres, but
-- would still apply to the wrong column per row) is replaced with indexes
-- scoped to the rows where the column is actually meaningful.
create unique index customers_phone_unique_idx
  on public.customers (phone)
  where phone is not null;

alter table public.customers
  add column session_id text;

create unique index customers_session_id_unique_idx
  on public.customers (session_id)
  where session_id is not null;
