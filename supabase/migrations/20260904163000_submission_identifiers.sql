begin;

-- Advisory hints disclose only a boolean; the unique constraints still decide writes.
create or replace function public.is_profile_handle_available(input_handle text)
returns boolean
language plpgsql stable security definer set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_safety_actor(false);
  normalized_handle text := lower(btrim(input_handle));
begin
  if normalized_handle is null or normalized_handle !~ '^[a-z0-9_]{3,30}$' then
    raise exception using errcode='P0001',message='VALIDATION_FAILED';
  end if;
  return not exists (
    select 1 from public.profiles profile
    where lower(profile.handle)=normalized_handle and profile.id<>actor_id
  );
end;
$function$;

create or replace function public.is_venue_slug_available(input_slug text,input_venue_id uuid)
returns boolean
language plpgsql stable security definer set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_safety_actor(false);
  normalized_slug text := lower(btrim(input_slug));
begin
  if not private.actor_manages_venue(actor_id,input_venue_id) then
    raise exception using errcode='P0001',message='NOT_ALLOWED';
  end if;
  if normalized_slug is null or char_length(normalized_slug) not between 3 and 60
    or normalized_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception using errcode='P0001',message='VALIDATION_FAILED';
  end if;
  return not exists (
    select 1 from public.venues venue
    where venue.slug=normalized_slug and venue.id<>input_venue_id
  );
end;
$function$;

create or replace function public.create_venue_workspace_auto(
  input_name text,
  input_address_text text,
  input_longitude numeric,
  input_latitude numeric,
  input_description text,
  input_main_space_name text,
  input_main_space_capacity integer,
  input_facilities text[],
  input_house_information text,
  input_default_attendance_mode text,
  input_default_requires_approval boolean,
  input_adult_attested boolean,
  input_representation_attested boolean,
  input_rules_version integer,
  audit_request_id uuid default null
)
returns table(venue_id uuid,slug text,verification_status text)
language plpgsql volatile security definer set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_actor(false);
  slug_base text;
  candidate_slug text;
  attempt integer;
begin
  if input_name is null or char_length(btrim(input_name)) not between 2 and 120 then
    raise exception using errcode='P0001',message='VALIDATION_FAILED';
  end if;
  slug_base := rtrim(left(trim(both '-' from regexp_replace(lower(btrim(input_name)),
    '[^a-z0-9]+','-','g')),52),'-');
  if char_length(slug_base)<3 then
    slug_base := 'venue';
  end if;

  -- Each failed attempt rolls back atomically. A competing insert or settings
  -- rename is resolved by venues.slug's unique index, not a racy preflight read.
  for attempt in 1..10000 loop
    candidate_slug := slug_base || case when attempt=1 then '' else '-'||attempt::text end;
    begin
      return query select created.venue_id,created.slug,created.verification_status
      from public.create_venue_workspace_v2(
        input_name=>input_name,input_slug=>candidate_slug,input_address_text=>input_address_text,
        input_longitude=>input_longitude,input_latitude=>input_latitude,input_description=>input_description,
        input_main_space_name=>input_main_space_name,input_main_space_capacity=>input_main_space_capacity,
        input_facilities=>input_facilities,input_house_information=>input_house_information,
        input_default_attendance_mode=>input_default_attendance_mode,
        input_default_requires_approval=>input_default_requires_approval,
        input_adult_attested=>input_adult_attested,input_representation_attested=>input_representation_attested,
        input_rules_version=>input_rules_version,audit_request_id=>audit_request_id
      ) created;
      return;
    exception when sqlstate 'P0001' then
      if sqlerrm<>'VENUE_SLUG_UNAVAILABLE' then raise; end if;
    end;
  end loop;
  raise exception using errcode='P0001',message='VENUE_SLUG_UNAVAILABLE';
end;
$function$;

revoke all on function public.is_profile_handle_available(text) from public,anon,authenticated,service_role;
revoke all on function public.is_venue_slug_available(text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.create_venue_workspace_auto(text,text,numeric,numeric,text,text,integer,text[],text,text,boolean,boolean,boolean,integer,uuid) from public,anon,authenticated,service_role;
grant execute on function public.is_profile_handle_available(text) to authenticated;
grant execute on function public.is_venue_slug_available(text,uuid) to authenticated;
grant execute on function public.create_venue_workspace_auto(text,text,numeric,numeric,text,text,integer,text[],text,text,boolean,boolean,boolean,integer,uuid) to authenticated;

commit;
