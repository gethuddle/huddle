begin;

create or replace function public.get_public_event_map_points(input_event_ids uuid[])
returns table (
  event_id uuid,
  place_name text,
  latitude double precision,
  longitude double precision
)
language plpgsql
security definer
stable
set search_path = ''
as $function$
begin
  if input_event_ids is null or cardinality(input_event_ids) > 50 then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  return query
  select
    event.id,
    case
      when event.place_kind = 'venue' then host_venue.name
      else event.public_place_name
    end,
    extensions.st_y(
      case
        when event.place_kind = 'venue' then host_venue.location::extensions.geometry
        else event.public_location::extensions.geometry
      end
    )::double precision as latitude,
    extensions.st_x(
      case
        when event.place_kind = 'venue' then host_venue.location::extensions.geometry
        else event.public_location::extensions.geometry
      end
    )::double precision as longitude
  from public.events as event
  left join public.venues as host_venue
    on host_venue.id = event.venue_id
  where event.id = any(input_event_ids)
    and event.status = 'published'
    and event.starts_at > statement_timestamp()
    and event.place_kind in ('venue', 'public_place')
    and event.audience <> 'invite_only'
    and (
      (event.place_kind = 'venue' and host_venue.location is not null)
      or (event.place_kind = 'public_place' and event.public_location is not null)
    )
    and private.event_is_visible_to_actor(event.id, auth.uid())
  order by array_position(input_event_ids, event.id);
end;
$function$;

comment on function public.get_public_event_map_points(uuid[]) is
  'Returns exact coordinates only for currently visible public Venue or public-place discovery events. It never reads the protected home-location domain.';

revoke all on function public.get_public_event_map_points(uuid[]) from public;
revoke all on function public.get_public_event_map_points(uuid[]) from anon, authenticated;
grant execute on function public.get_public_event_map_points(uuid[]) to anon, authenticated;

commit;
