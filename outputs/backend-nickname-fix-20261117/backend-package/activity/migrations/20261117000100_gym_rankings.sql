-- Extend the existing activity_api with game-specific ranking data. Preserve
-- demo_items and its existing contracts/data; it is not a second ranking table.
create table if not exists public.leaderboard_entries(
 id uuid primary key default gen_random_uuid(),puid text not null,created_at timestamptz not null default now()
);
alter table public.leaderboard_entries
 add column if not exists board text not null default 'player',
 add column if not exists score numeric(160,0) not null default 0,
 add column if not exists best jsonb,
 add column if not exists display_name text not null default '虎扑训练师',
 add column if not exists updated_at timestamptz not null default now();
alter table public.leaderboard_entries alter column puid set not null;
alter table public.leaderboard_entries alter column id set default gen_random_uuid();
do $$ begin
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name='leaderboard_entries' and column_name='title') then
  alter table public.leaderboard_entries alter column title set default '';
 end if;
end $$;
create unique index if not exists gym_rank_user_board on public.leaderboard_entries(puid,board);
create index if not exists gym_rank_order on public.leaderboard_entries(board,score desc,updated_at asc,id asc);

-- Written only by trusted game settlement infrastructure, never by the public API.
create table if not exists public.gym_verified_progress(
 puid text not null,run_id text not null,revision bigint not null,evidence_id text not null,
 fame bigint not null check(fame>=0),best jsonb,created_at timestamptz not null default now(),
 fame_reached_at timestamptz not null default now(),best_reached_at timestamptz not null default now(),
 primary key(puid,run_id,revision),unique(evidence_id)
);
alter table public.gym_verified_progress add column if not exists fame_reached_at timestamptz not null default now(),
 add column if not exists best_reached_at timestamptz not null default now();
create index if not exists gym_verified_progress_recent on public.gym_verified_progress(puid,created_at desc,run_id,revision);
create table if not exists public.gym_rank_events(
 puid text not null,run_id text not null,revision bigint not null,created_at timestamptz not null default now(),
 primary key(puid,run_id,revision)
);
create index if not exists gym_rank_event_time on public.gym_rank_events(puid,created_at desc);
revoke all on public.leaderboard_entries,public.gym_verified_progress,public.gym_rank_events from public,anon,authenticated;
grant all on public.leaderboard_entries,public.gym_verified_progress,public.gym_rank_events to service_role;
alter table public.leaderboard_entries enable row level security;
alter table public.gym_verified_progress enable row level security;
alter table public.gym_rank_events enable row level security;

-- Internal transactional write from gym_authority_commit only. There is no
-- browser route for submitting a snapshot, score, account or this evidence.
create or replace function public.record_verified_gym_rank_progress(p_puid text,p_run text,p_revision bigint,p_evidence text,p_fame bigint,p_best jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare previous public.gym_verified_progress;latest public.gym_verified_progress;stat text;fame_time timestamptz:=now();best_time timestamptz:=now();begin
 if p_puid is null or length(p_puid)=0 or length(p_puid)>200 or p_puid<>btrim(p_puid)
  or p_run is null or p_run !~ '^[0-9]{1,16}-[0-9]{1,10}$' or p_revision is null or p_revision<0
  or p_evidence is null or p_evidence !~ '^[A-Za-z0-9_:-]{1,128}$' or p_fame is null or p_fame<0 or p_fame>9007199254740991
 then raise exception 'invalid-verified-progress';end if;
 if p_best='null'::jsonb then p_best:=null;end if;
 if p_best is not null then
  if jsonb_typeof(p_best)<>'object' or jsonb_typeof(p_best->'value') is distinct from 'string'
   or coalesce(p_best->>'value','') !~ '^(0|[1-9][0-9]{0,159})$'
   or coalesce(p_best->>'playerId','') !~ '^[A-Za-z0-9_:-]{1,120}$' or coalesce(p_best->>'templateId','')=''
   or jsonb_typeof(p_best->'level') is distinct from 'number' or coalesce(p_best->>'level','') !~ '^[0-9]{1,2}$'
   or jsonb_typeof(p_best->'stats') is distinct from 'object' then raise exception 'invalid-verified-player';end if;
  foreach stat in array array['three','mid','drive','inside','handle','defense'] loop
   if jsonb_typeof(p_best->'stats'->stat) is distinct from 'number' or coalesce(p_best->'stats'->>stat,'') !~ '^[0-9]{1,2}$'
   then raise exception 'invalid-verified-player';end if;
  end loop;
 end if;
 -- The authority actor lease serializes these writes; the advisory lock also
 -- orders an explicit submit against its canonical evidence transaction.
 perform pg_advisory_xact_lock(hashtextextended(p_puid,0));
 select * into previous from gym_verified_progress where puid=p_puid and run_id=p_run and revision=p_revision;
 if found then
  if previous.evidence_id<>p_evidence or previous.fame<>p_fame or previous.best is distinct from p_best
  then raise exception 'verified-progress-conflict';end if;
  return;
 end if;
 select * into latest from gym_verified_progress where puid=p_puid and run_id=p_run order by revision desc limit 1;
 if found then
  if latest.revision>p_revision or latest.fame>p_fame
   or (latest.best is not null and (p_best is null or (latest.best->>'value')::numeric>(p_best->>'value')::numeric))
  then raise exception 'verified-progress-regression';end if;
  if latest.fame=p_fame then fame_time:=latest.fame_reached_at;end if;
  if latest.best->>'value' is not distinct from p_best->>'value' then best_time:=latest.best_reached_at;end if;
 end if;
 insert into gym_verified_progress(puid,run_id,revision,evidence_id,fame,best,fame_reached_at,best_reached_at)
 values(p_puid,p_run,p_revision,p_evidence,p_fame,p_best,fame_time,best_time);
 -- Only a recent submission window is needed; lifetime bests live in the
 -- ranking and authority checkpoints. Heartbeats cannot grow this table forever.
 delete from gym_verified_progress where puid=p_puid and (run_id,revision) not in
  (select run_id,revision from gym_verified_progress where puid=p_puid order by created_at desc,run_id,revision desc limit 256);
end $$;

create or replace function public.submit_gym_rank(p_puid text,p_name text,p_run text,p_revision bigint)
returns jsonb language plpgsql security definer set search_path=public as $$
declare verified public.gym_verified_progress; begin
 if p_puid is null or length(p_puid)=0 or p_revision<0 then raise exception 'invalid-reference'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_puid,0));
 select * into verified from gym_verified_progress where puid=p_puid and run_id=p_run and revision=p_revision;
 if not found then raise exception 'verified-progress-required'; end if;
 if exists(select 1 from gym_rank_events where puid=p_puid and run_id=p_run and revision=p_revision) then
  return jsonb_build_object('accepted',true,'duplicate',true);
 end if;
 if exists(select 1 from gym_rank_events where puid=p_puid and created_at>now()-interval '3 seconds') then raise exception 'rate-limit'; end if;
 insert into gym_rank_events(puid,run_id,revision) values(p_puid,p_run,p_revision);
 insert into leaderboard_entries(puid,board,score,best,display_name,updated_at) values(p_puid,'fame',verified.fame,null,p_name,verified.fame_reached_at)
 on conflict(puid,board) do update set score=excluded.score,best=null,updated_at=excluded.updated_at
 where leaderboard_entries.score<excluded.score;
 if verified.best is not null then
  insert into leaderboard_entries(puid,board,score,best,display_name,updated_at) values(p_puid,'player',(verified.best->>'value')::numeric,verified.best,p_name,verified.best_reached_at)
  on conflict(puid,board) do update set score=excluded.score,best=excluded.best,updated_at=excluded.updated_at
  where leaderboard_entries.score<excluded.score;
 end if;
 -- Updating a display name never changes the timestamp used to break score ties.
 update leaderboard_entries set display_name=p_name where puid=p_puid and display_name<>p_name;
 delete from gym_rank_events where puid=p_puid and (run_id,revision) not in
  (select run_id,revision from gym_rank_events where puid=p_puid order by created_at desc,run_id,revision desc limit 256);
 return jsonb_build_object('accepted',true,'duplicate',false);
end $$;

create or replace function public.read_gym_rank(p_board text,p_limit integer default 50,p_puid text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare entries jsonb;mine public.leaderboard_entries;position bigint;personal jsonb:=null;begin
 if p_board not in ('player','fame') or p_limit<1 or p_limit>100 then raise exception 'invalid-board';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'coach',r.display_name,'score',r.score::text,'best',r.best) order by r.score desc,r.updated_at,r.id),'[]'::jsonb)
 into entries from(select id,display_name,score,best,updated_at from leaderboard_entries where board=p_board order by score desc,updated_at,id limit p_limit)r;
 if p_puid is not null then
  select * into mine from leaderboard_entries where board=p_board and puid=p_puid;
  if found then
   select count(*)+1 into position from leaderboard_entries where board=p_board and
   (score>mine.score or(score=mine.score and(updated_at<mine.updated_at or(updated_at=mine.updated_at and id<mine.id))));
   personal:=jsonb_build_object('rank',position,'entry',jsonb_build_object('id',mine.id,'coach',mine.display_name,'score',mine.score::text,'best',mine.best));
  end if;
 end if;
 return jsonb_build_object('entries',entries,'me',personal);
end $$;
revoke all on function public.record_verified_gym_rank_progress(text,text,bigint,text,bigint,jsonb),public.submit_gym_rank(text,text,text,bigint),public.read_gym_rank(text,integer,text) from public,anon,authenticated;
grant execute on function public.record_verified_gym_rank_progress(text,text,bigint,text,bigint,jsonb),public.submit_gym_rank(text,text,text,bigint),public.read_gym_rank(text,integer,text) to service_role;
