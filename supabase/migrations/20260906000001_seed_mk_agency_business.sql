-- Hard-cut migration decision (docs/requirements/mixed-language-multi-tenant-architecture-plan.md
-- §4.2): every row created before multi-tenancy existed belongs to exactly one seeded business,
-- "MK Agency" / slug "mk-agency". The next migration backfills business_id on every existing
-- table by looking up this row's id via its slug.
insert into public.businesses (name, slug, default_language, timezone)
values ('MK Agency', 'mk-agency', 'en', 'UTC');
