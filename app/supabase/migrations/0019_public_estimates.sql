-- Rate limiting for the public "what's my yard worth" lookup.
--
-- Opening traffic lookups to anonymous visitors means anyone can make Yardtize
-- query MoDOT, KDOT and FHWA on their behalf. That is a good feature and a bad
-- liability at the same time: the state servers are free, slow, and not ours to
-- hammer, and being the origin of a flood aimed at MoDOT is the sort of thing
-- that ends with a phone call.
--
-- So every anonymous lookup is counted, twice: per visitor and in total. The
-- per-visitor limit stops one person scripting it; the global one bounds the
-- worst case across everybody, including a distributed flood the per-visitor
-- count cannot see.

create table lookup_quota (
  -- A salted hash, never an address. We need to know that two requests came
  -- from the same place, not where that place is — and an IP is personal data
  -- in several of the jurisdictions this will eventually operate in.
  visitor  text not null,
  day      date not null,
  count    integer not null default 0 check (count >= 0),
  first_at timestamptz not null default now(),
  last_at  timestamptz not null default now(),

  primary key (visitor, day)
);

comment on table lookup_quota is
  'Anonymous lookup counts per visitor per day. Rows are disposable; anything
   older than a week can be deleted without loss.';

alter table lookup_quota enable row level security;
-- No policies at all: only the service role touches this. A visitor being able
-- to read or reset their own counter would defeat the point of having one.

-- ---------------------------------------------------------------------------
-- Counting, atomically.
--
-- Read-then-write loses under concurrency, which is exactly the condition a
-- rate limiter exists for — the moment it matters most is the moment a plain
-- upsert would undercount. One statement, and the answer comes back with it.
-- ---------------------------------------------------------------------------
create function public.bump_lookup_quota(
  p_visitor text,
  p_day date,
  p_limit integer
)
returns table (allowed boolean, used integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  insert into public.lookup_quota as q (visitor, day, count)
  values (p_visitor, p_day, 1)
  on conflict (visitor, day) do update
    set count = q.count + 1,
        last_at = now()
    -- Stop incrementing once the limit is passed, so a script hammering the
    -- endpoint cannot inflate the number without bound.
    where q.count < p_limit
  returning q.count into v_count;

  if v_count is null then
    -- The update was filtered out: already at the limit.
    select q.count into v_count from public.lookup_quota q
      where q.visitor = p_visitor and q.day = p_day;
    return query select false, coalesce(v_count, p_limit);
  end if;

  return query select v_count <= p_limit, v_count;
end;
$$;

revoke execute on function public.bump_lookup_quota(text, date, integer) from public;

-- ---------------------------------------------------------------------------
-- The global ceiling, across everybody.
-- ---------------------------------------------------------------------------
create function public.lookups_today(p_day date)
returns integer
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce(sum(count), 0)::integer from public.lookup_quota where day = p_day;
$$;

revoke execute on function public.lookups_today(date) from public;

create index lookup_quota_day_idx on lookup_quota (day);
