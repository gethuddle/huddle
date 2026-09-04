begin;

-- These projections do not mutate product state. Running them as STABLE makes
-- PostgREST execute them in read-only transactions, so the shared actor guard
-- keeps every eligibility check but does not take the write-serialization
-- advisory lock. Independent page reads can therefore run concurrently.
alter function public.list_attention_items(integer) stable;
alter function public.list_my_events(text, integer, integer) stable;
alter function public.list_my_group_relationships(text, integer, integer) stable;
alter function public.list_my_saved_items(text, integer, integer) stable;
alter function public.list_people_hub(text, text, integer, integer) stable;
alter function public.list_my_groups(integer, integer) stable;
alter function public.list_my_group_invitations() stable;

alter function public.get_venue_workspace(uuid) stable;
alter function public.list_venue_calendar(uuid, integer) stable;
alter function public.get_venue_for_management(text) stable;
alter function public.list_managed_venue_events(uuid, integer) stable;
alter function public.get_venue_today(uuid, integer) stable;
alter function public.get_venue_settings(uuid) stable;
alter function public.list_venue_calendar_page(uuid, text, integer, integer) stable;

comment on function public.list_people_hub(text, text, integer, integer) is
  'Read-only, membership-authorized People projection. STABLE keeps actor checks while allowing independent buckets to execute concurrently.';
comment on function public.get_venue_today(uuid, integer) is
  'Read-only, membership-authorized Venue Today projection. STABLE avoids taking the write-only actor serializer.';
comment on function public.list_venue_calendar_page(uuid, text, integer, integer) is
  'Read-only, membership-authorized Venue history projection with bounded paging and no write-serialization lock.';

commit;
