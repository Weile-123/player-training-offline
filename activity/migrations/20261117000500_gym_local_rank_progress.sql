-- Independent local-first business checkpoints. Never upgrade imported saves
-- into server-created authority state or modify a player's existing game.
create table if not exists public.gym_local_rank_checkpoints(
 puid text not null,run_id text not null,revision bigint not null,updated_ms bigint not null,
 evidence_hash text not null,fame bigint not null,best jsonb,
 submitted_at timestamptz not null default now(),source text not null default 'local-validated',
 primary key(puid,run_id),check(source='local-validated')
);
revoke all on public.gym_local_rank_checkpoints from public,anon,authenticated;
grant all on public.gym_local_rank_checkpoints to service_role;
alter table public.gym_local_rank_checkpoints enable row level security;
create index if not exists gym_local_rank_submitted on public.gym_local_rank_checkpoints(puid,submitted_at desc);

create or replace function public.submit_local_gym_rank(p_puid text,p_name text,p_run text,p_revision bigint,p_updated bigint,p_evidence text,p_fame bigint,p_best jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare previous public.gym_local_rank_checkpoints;stat text;duplicate boolean:=false;unchanged_scores boolean:=false;begin
 if p_puid is null or length(p_puid)=0 or length(p_puid)>200 or p_puid<>btrim(p_puid) or p_puid ~ '[[:cntrl:]]'
  or p_run is null or p_run !~ '^[0-9]{1,16}-[0-9]{1,10}$' or p_revision is null or p_revision<0
  or p_updated is null or p_updated<0 or p_updated>extract(epoch from now())*1000+300000
  or p_evidence is null or p_evidence !~ '^[a-f0-9]{64}$' or p_fame is null or p_fame<0 or p_fame>9007199254740991
 then raise exception 'local-progress-invalid';end if;
 p_name:=coalesce(nullif(btrim(p_name),''),'匿名训练师');
 if char_length(p_name)>60 or p_name ~ '[[:cntrl:]]' then raise exception 'local-progress-name';end if;
 if p_best='null'::jsonb then p_best:=null;end if;
 if p_best is not null then
  if jsonb_typeof(p_best)<>'object' or jsonb_typeof(p_best->'value') is distinct from 'string'
   or coalesce(p_best->>'value','') !~ '^(0|[1-9][0-9]{0,159})$'
   or coalesce(p_best->>'playerId','') !~ '^[A-Za-z0-9_:-]{1,120}$' or coalesce(p_best->>'templateId','')=''
   or jsonb_typeof(p_best->'level') is distinct from 'number' or coalesce(p_best->>'level','') !~ '^[0-9]{1,2}$'
   or jsonb_typeof(p_best->'stats') is distinct from 'object' then raise exception 'local-progress-player';end if;
  foreach stat in array array['three','mid','drive','inside','handle','defense'] loop
   if jsonb_typeof(p_best->'stats'->stat) is distinct from 'number' or coalesce(p_best->'stats'->>stat,'') !~ '^[0-9]{1,2}$'
   then raise exception 'local-progress-player';end if;
  end loop;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_puid,0));
 select * into previous from gym_local_rank_checkpoints where puid=p_puid and run_id=p_run;
 if found then
  if p_revision<previous.revision or p_updated<previous.updated_ms or p_fame<previous.fame then raise exception 'local-progress-regression';end if;
  if p_revision=previous.revision then
   if p_evidence<>previous.evidence_hash then raise exception 'local-progress-conflict';end if;
   duplicate:=true;
  end if;
  unchanged_scores:=p_fame=previous.fame and p_best is not distinct from previous.best;
 end if;
 -- Export flush advances time/revision even when no ranking result changes.
 -- Opening the board after the home sync must not turn that harmless refresh
 -- into a failed score update. Changed results still use the actor rate limit.
 if not duplicate and not unchanged_scores and exists(select 1 from gym_local_rank_checkpoints where puid=p_puid and submitted_at>now()-interval '3 seconds') then raise exception 'rate-limit';end if;
 insert into gym_local_rank_checkpoints(puid,run_id,revision,updated_ms,evidence_hash,fame,best)
 values(p_puid,p_run,p_revision,p_updated,p_evidence,p_fame,p_best)
 on conflict(puid,run_id)do update set revision=excluded.revision,updated_ms=excluded.updated_ms,evidence_hash=excluded.evidence_hash,
  fame=excluded.fame,best=excluded.best,submitted_at=case when duplicate then gym_local_rank_checkpoints.submitted_at else now() end;
 insert into leaderboard_entries(puid,board,score,best,display_name,updated_at) values(p_puid,'fame',p_fame,null,p_name,now())
 on conflict(puid,board)do update set score=excluded.score,best=null,updated_at=excluded.updated_at where leaderboard_entries.score<excluded.score;
 if p_best is not null then
  insert into leaderboard_entries(puid,board,score,best,display_name,updated_at) values(p_puid,'player',(p_best->>'value')::numeric,p_best,p_name,now())
  on conflict(puid,board)do update set score=excluded.score,best=excluded.best,updated_at=excluded.updated_at where leaderboard_entries.score<excluded.score;
 end if;
 update leaderboard_entries set display_name=p_name where puid=p_puid and display_name<>p_name;
 -- Only a recent bounded checkpoint window is required; lifetime highs stay
 -- in leaderboard_entries and are never reduced by an old device/new gym.
 delete from gym_local_rank_checkpoints where puid=p_puid and run_id not in
  (select run_id from gym_local_rank_checkpoints where puid=p_puid order by submitted_at desc limit 32);
 return jsonb_build_object('accepted',true,'duplicate',duplicate,'source','local-validated');
end $$;
revoke all on function public.submit_local_gym_rank(text,text,text,bigint,bigint,text,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.submit_local_gym_rank(text,text,text,bigint,bigint,text,bigint,jsonb) to service_role;
