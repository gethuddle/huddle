begin;

create index if not exists events_host_venue_history_page_idx
  on public.events(host_venue_id,starts_at desc,id desc);

create function public.list_venue_calendar_page(
  input_venue_id uuid,
  input_status text default 'all',
  input_limit integer default 20,
  input_offset integer default 0
)
returns table (
  event_id uuid,
  title text,
  status text,
  starts_at timestamptz,
  ends_at timestamptz,
  venue_space_id uuid,
  venue_space_name text,
  attendance_mode text,
  capacity integer,
  approved_attendee_count bigint,
  requires_approval boolean,
  total_count bigint
)
language plpgsql
security definer
volatile
set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_common_actor();
  selected_status text := input_status;
begin
  if input_venue_id is null or input_status is null
    or input_limit is null or input_limit not between 1 and 50
    or input_offset is null or input_offset not between 0 and 10000 then
    raise exception using errcode='P0001',message='VALIDATION_FAILED';
  end if;
  if not private.actor_manages_venue(actor_id,input_venue_id) then
    raise exception using errcode='P0001',message='NOT_FOUND';
  end if;
  if selected_status not in ('all','draft','published','full','cancelled','completed') then
    raise exception using errcode='P0001',message='VALIDATION_FAILED';
  end if;

  return query
  with projected as (
    select event.id,event.title,
      private.event_history_status(event,statement_timestamp())::text as projected_status,
      event.starts_at,event.ends_at,event.venue_space_id,space.name as venue_space_name,
      event.attendance_mode::text as attendance_mode,event.capacity,
      (select count(*) from public.event_attendance attendance
       where attendance.event_id=event.id and attendance.status='approved') as approved_count,
      event.requires_approval
    from public.events event
    left join public.venue_spaces space on space.id=event.venue_space_id
    where event.host_venue_id=input_venue_id
  ), filtered as (
    select * from projected
    where selected_status='all'
      or (selected_status='full' and projected.projected_status='published'
          and projected.attendance_mode='reservations' and projected.capacity is not null
          and projected.approved_count>=projected.capacity)
      or (selected_status='published' and projected.projected_status='published'
          and not (projected.attendance_mode='reservations' and projected.capacity is not null
            and projected.approved_count>=projected.capacity))
      or (selected_status in ('draft','cancelled','completed')
        and projected.projected_status=selected_status)
  )
  select filtered.id,filtered.title,filtered.projected_status,filtered.starts_at,filtered.ends_at,
    filtered.venue_space_id,filtered.venue_space_name,filtered.attendance_mode,filtered.capacity,
    filtered.approved_count,filtered.requires_approval,count(*) over ()
  from filtered
  order by filtered.starts_at desc,filtered.id desc
  offset input_offset limit input_limit;
end;
$function$;

revoke all on function public.list_venue_calendar_page(uuid,text,integer,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.list_venue_calendar_page(uuid,text,integer,integer) to authenticated;
comment on function public.list_venue_calendar_page(uuid,text,integer,integer) is
  'Returns one bounded, pre-filtered Venue owner/admin event-history page with elapsed status projection.';

commit;
