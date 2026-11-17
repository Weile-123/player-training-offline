-- Apply to this application's inspected demo baseline; never erase existing rows.
do $$ begin
 if to_regclass('public.leaderboard_entries') is null then
  if to_regclass('public.demo_items') is null then raise exception 'Inspect demo baseline first'; end if;
  if exists(select 1 from public.demo_items limit 1) then raise exception 'demo_items contains data; review required'; end if;
  alter table public.demo_items rename to leaderboard_entries;
 end if;
end $$;
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
 primary key(puid,run_id,revision),unique(evidence_id)
);
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
 insert into leaderboard_entries(puid,board,score,best,display_name) values(p_puid,'fame',verified.fame,null,p_name)
 on conflict(puid,board) do update set score=excluded.score,best=null,updated_at=now()
 where leaderboard_entries.score<excluded.score;
 if verified.best is not null then
  insert into leaderboard_entries(puid,board,score,best,display_name) values(p_puid,'player',(verified.best->>'value')::numeric,verified.best,p_name)
  on conflict(puid,board) do update set score=excluded.score,best=excluded.best,updated_at=now()
  where leaderboard_entries.score<excluded.score;
 end if;
 -- Updating a display name never changes the timestamp used to break score ties.
 update leaderboard_entries set display_name=p_name where puid=p_puid and display_name<>p_name;
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
revoke all on function public.submit_gym_rank(text,text,text,bigint),public.read_gym_rank(text,integer,text) from public,anon,authenticated;
grant execute on function public.submit_gym_rank(text,text,text,bigint),public.read_gym_rank(text,integer,text) to service_role;
