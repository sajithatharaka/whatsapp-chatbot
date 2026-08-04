-- Ownership note: this migration history (supabase/migrations) owns every table
-- created from here on (WhatsApp/AI platform tables). It never touches the
-- Clerk/Stripe SaaS tables owned by prisma/schema.prisma, even though both
-- point at the same Supabase Postgres instance. See prisma/schema.prisma for
-- the mirrored note.

create extension if not exists vector with schema extensions;
