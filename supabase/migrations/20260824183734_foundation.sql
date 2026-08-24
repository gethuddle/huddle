begin;

-- Supabase normally creates this schema, but declaring it keeps the migration portable.
create schema if not exists extensions;

create extension if not exists postgis with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists citext with schema extensions;

comment on extension postgis is
  'Geography support for Huddle location-aware discovery.';
comment on extension pg_trgm is
  'Trigram support for bounded fuzzy group-name suggestions.';
comment on extension citext is
  'Case-insensitive storage for normalized public slugs and handles.';

-- Internal helpers stay outside every Data API schema.
create schema if not exists private;
comment on schema private is
  'Non-exposed Huddle database helpers and protected implementation details.';

revoke all on schema private from public;
revoke all on schema private from anon, authenticated;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.updated_at = statement_timestamp();
  return new;
end;
$function$;

comment on function private.set_updated_at() is
  'Sets a mutable row updated_at value using a timezone-aware statement timestamp.';

revoke all on function private.set_updated_at() from public, anon, authenticated;

commit;
