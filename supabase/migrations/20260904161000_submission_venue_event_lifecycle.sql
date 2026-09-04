begin;

-- A narrow management DTO: no private-person events, attendee identities or billing payloads.
create or replace function public.get_venue_event_for_management(input_event_id uuid)
returns table (
  event_id uuid, venue_id uuid, venue_slug text, match_id uuid, attendance_mode text,
  venue_space_id uuid, venue_space_name text, audience text, audience_team_id uuid,
  capacity integer, title text, description text, expected_activity text,
  cost_description text, event_rules text, commercial_affiliation text,
  host_presence_confirmed boolean, requires_approval boolean, status text,
  starts_at timestamptz, ends_at timestamptz
)
language plpgsql volatile security definer set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_common_actor();
  target_venue_id uuid;
begin
  select event.host_venue_id into target_venue_id from public.events event where event.id=input_event_id;
  if not private.actor_manages_venue(actor_id,target_venue_id) then
    raise exception using errcode='P0001',message='NOT_ALLOWED';
  end if;
  return query select event.id,event.host_venue_id,venue.slug,event.match_id,event.attendance_mode::text,
    event.venue_space_id,space.name,event.audience::text,event.audience_team_id,event.capacity,
    event.title,event.description,event.expected_activity,event.cost_description,event.event_rules,
    event.commercial_affiliation,event.host_presence_confirmed_at is not null,event.requires_approval,
    private.event_history_status(event,statement_timestamp())::text,event.starts_at,event.ends_at
  from public.events event join public.venues venue on venue.id=event.host_venue_id
  left join public.venue_spaces space on space.id=event.venue_space_id
  where event.id=input_event_id;
end;
$function$;
revoke all on function public.get_venue_event_for_management(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_venue_event_for_management(uuid) to authenticated;
comment on function public.get_venue_event_for_management(uuid) is
  'Current active Venue owner/admin edit projection. Never returns private-person events or protected addresses.';

create or replace function public.save_venue_event(input_event_id uuid,input_values jsonb,input_intent text,audit_request_id uuid default null)
returns table(event_id uuid,status text)
language plpgsql volatile security definer set search_path = ''
as $function$
declare
  actor_id uuid := private.serialize_actor_transaction();
  target public.events%rowtype;
  space public.venue_spaces%rowtype;
  requested_capacity integer;
  requested_approval boolean;
  target_status public.event_status;
  text_key text;
  text_min integer;
  text_max integer;
begin
  perform private.lock_event_venue_billing(input_event_id);
  actor_id := private.assert_common_actor();
  select event.* into target from public.events event where event.id=input_event_id for update;
  if target.id is null or target.host_venue_id is null
    or not private.actor_manages_venue(actor_id,target.host_venue_id) then
    raise exception using errcode='P0001',message='NOT_ALLOWED';
  end if;
  if not private.venue_allows_draft_work(target.host_venue_id,statement_timestamp()) then
    raise exception using errcode='P0001',message='NOT_ALLOWED';
  end if;
  -- Hold membership and venue state through the write as well as billing/actor state.
  perform 1 from public.venue_memberships membership
    where membership.venue_id=target.host_venue_id and membership.user_id=actor_id
      and membership.status='active' and membership.revoked_at is null and membership.role in ('owner','admin')
    for share;
  if not found then raise exception using errcode='P0001',message='NOT_ALLOWED'; end if;
  perform 1 from public.venues venue where venue.id=target.host_venue_id
    and venue.archived_at is null and venue.suspended_at is null and venue.verification_status<>'suspended' for share;
  if not found then raise exception using errcode='P0001',message='NOT_ALLOWED'; end if;
  if input_intent is null or input_intent not in ('draft','publish','cancel')
    or input_values is null or jsonb_typeof(input_values)<>'object' then
    raise exception using errcode='P0001',message='VALIDATION_FAILED';
  end if;
  if target.status not in ('draft','published') then
    raise exception using errcode='P0001',message='INVALID_TRANSITION';
  end if;
  if input_intent='cancel' then
    if target.status<>'draft' then raise exception using errcode='P0001',message='INVALID_TRANSITION'; end if;
    if input_values<>'{}'::jsonb then raise exception using errcode='P0001',message='VALIDATION_FAILED'; end if;
    update public.events event set status='cancelled',cancelled_at=statement_timestamp(),cancel_reason='Cancelled by venue.'
      where event.id=target.id;
    perform private.write_security_audit(actor_id,'event.cancel','event',target.id,'succeeded',audit_request_id,jsonb_build_object('previous_status','draft'));
    return query select target.id,'cancelled'::text;
    return;
  end if;
  if target.starts_at<=statement_timestamp() then raise exception using errcode='P0001',message='EVENT_STARTED'; end if;
  -- The catalog may have changed since the draft was saved. Serialize with a
  -- concurrent sync and retain the same future-fixture gate as event creation.
  perform 1 from public.matches fixture where fixture.id=target.match_id
    and fixture.starts_at>statement_timestamp()
    and fixture.status in ('scheduled','timed','postponed') for share;
  if not found then raise exception using errcode='P0001',message='NOT_FOUND'; end if;
  if target.status='published' and input_intent='draft' then
    raise exception using errcode='P0001',message='INVALID_TRANSITION';
  end if;
  if exists(select 1 from jsonb_object_keys(input_values) supplied(key)
    where key<>all(array['title','description','expectedActivity','costDescription','eventRules','commercialAffiliation','hostPresenceConfirmed','capacity','requiresApproval']))
    or jsonb_typeof(input_values->'hostPresenceConfirmed') is distinct from 'boolean'
    or (input_values->>'hostPresenceConfirmed')::boolean is distinct from true
    or jsonb_typeof(input_values->'requiresApproval') is distinct from 'boolean'
    or not (input_values ? 'capacity') then
    raise exception using errcode='P0001',message='VALIDATION_FAILED';
  end if;
  for text_key,text_min,text_max in select * from (values
    ('title',3,120),('description',10,2000),('expectedActivity',3,500),
    ('costDescription',2,300),('eventRules',3,1000),('commercialAffiliation',2,300)
  ) bounds(key,minimum,maximum) loop
    if jsonb_typeof(input_values->text_key) is distinct from 'string'
      or char_length(btrim(input_values->>text_key)) not between text_min and text_max then
      raise exception using errcode='P0001',message='VALIDATION_FAILED';
    end if;
  end loop;
  requested_approval := (input_values->>'requiresApproval')::boolean;
  if target.attendance_mode='open_door' then
    if input_values->'capacity'<>'null'::jsonb or requested_approval then
      raise exception using errcode='P0001',message='VALIDATION_FAILED';
    end if;
  else
    if jsonb_typeof(input_values->'capacity') is distinct from 'number'
      or (input_values->>'capacity') !~ '^[0-9]{1,6}$' then
      raise exception using errcode='P0001',message='VALIDATION_FAILED';
    end if;
    requested_capacity := (input_values->>'capacity')::integer;
    if requested_capacity not between 1 and 100000 then raise exception using errcode='P0001',message='VALIDATION_FAILED'; end if;
  end if;
  if target.venue_space_id is not null then
    select candidate.* into space from public.venue_spaces candidate where candidate.id=target.venue_space_id for share;
    if space.venue_id is distinct from target.host_venue_id or not space.active then
      raise exception using errcode='P0001',message='VENUE_DEFAULTS_INCOMPLETE';
    end if;
    if target.attendance_mode='reservations' and (space.capacity is null or requested_capacity>space.capacity) then
      raise exception using errcode='P0001',message='VALIDATION_FAILED';
    end if;
  end if;
  target_status := case when input_intent='publish' then 'published'::public.event_status else 'draft'::public.event_status end;
  if target_status='published' and not private.venue_allows_publishing(target.host_venue_id,target.starts_at,statement_timestamp())
    and not (target.status='published' and private.venue_billing_effective_state(target.host_venue_id,statement_timestamp()) in ('past_due','provider_stale','legacy_grace')) then
    raise exception using errcode='P0001',message='NOT_ALLOWED';
  end if;
  -- The existing event trigger independently protects capacity and immutable fields.
  update public.events event set title=btrim(input_values->>'title'),description=btrim(input_values->>'description'),
    expected_activity=btrim(input_values->>'expectedActivity'),cost_description=btrim(input_values->>'costDescription'),
    event_rules=btrim(input_values->>'eventRules'),commercial_affiliation=btrim(input_values->>'commercialAffiliation'),
    host_presence_confirmed_at=statement_timestamp(),capacity=requested_capacity,requires_approval=requested_approval,
    status=target_status,published_at=case when target_status='published' then coalesce(event.published_at,statement_timestamp()) else event.published_at end
  where event.id=target.id;
  perform private.write_security_audit(actor_id,'event.update','event',target.id,'succeeded',audit_request_id,
    jsonb_build_object('status',target_status::text,'venue_id',target.host_venue_id));
  return query select target.id,target_status::text;
end;
$function$;
revoke all on function public.save_venue_event(uuid,jsonb,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.save_venue_event(uuid,jsonb,text,uuid) to authenticated;
comment on function public.save_venue_event(uuid,jsonb,text,uuid) is
  'Owner/admin edit, draft publication and retained draft cancellation under actor/venue locks and current Sandbox entitlement. Fixture/place/audience/mode are immutable.';

commit;
