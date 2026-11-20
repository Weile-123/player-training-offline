-- Accept the same level range as the game while retaining six-dimensional
-- attribute bounds, score persistence and tie ordering.
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
   or jsonb_typeof(p_best->'level') is distinct from 'number' or coalesce(p_best->>'level','') !~ '^(0|[1-9][0-9]{0,2}|1[0-9]{3}|2000)$'
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
   or jsonb_typeof(p_best->'level') is distinct from 'number' or coalesce(p_best->>'level','') !~ '^(0|[1-9][0-9]{0,2}|1[0-9]{3}|2000)$'
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

-- The original procedure remains a compatible view for released clients
-- whose player validator accepts levels 0 through 99. Public and personal positions
-- are computed within the same view. No existing scores are rewritten.
create or replace function public.read_gym_rank_v2(p_board text,p_limit integer,p_puid text,p_extended boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
 entries jsonb;
 mine public.leaderboard_entries;
 position bigint;
 personal jsonb:=null;
 level_pattern text:=case when p_extended then '^(0|[1-9][0-9]{0,2}|1[0-9]{3}|2000)$' else '^[0-9]{1,2}$' end;
begin
 if p_board not in ('player','fame') or p_limit<1 or p_limit>100 or p_extended is null then
  raise exception 'invalid-board';
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'coach',r.display_name,'score',r.score::text,'best',r.best)
  order by r.score desc,r.updated_at,r.id),'[]'::jsonb)
 into entries from (
  select id,display_name,score,best,updated_at from leaderboard_entries
  where board=p_board and (p_board<>'player' or (best->>'level') ~ level_pattern)
  order by score desc,updated_at,id limit p_limit
 )r;
 if p_puid is not null then
  select * into mine from leaderboard_entries where board=p_board and puid=p_puid
   and (p_board<>'player' or (best->>'level') ~ level_pattern);
  if found then
   select count(*)+1 into position from leaderboard_entries
   where board=p_board and (p_board<>'player' or (best->>'level') ~ level_pattern)
    and (score>mine.score or(score=mine.score and(updated_at<mine.updated_at or(updated_at=mine.updated_at and id<mine.id))));
   personal:=jsonb_build_object('rank',position,'entry',jsonb_build_object('id',mine.id,'coach',mine.display_name,'score',mine.score::text,'best',mine.best));
  end if;
 end if;
 return jsonb_build_object('entries',entries,'me',personal);
end $$;

create or replace function public.read_gym_rank(p_board text,p_limit integer default 50,p_puid text default null)
returns jsonb language sql security definer set search_path=public as $$
 select public.read_gym_rank_v2(p_board,p_limit,p_puid,false);
$$;

revoke all on function public.record_verified_gym_rank_progress(text,text,bigint,text,bigint,jsonb),
 public.submit_local_gym_rank(text,text,text,bigint,bigint,text,bigint,jsonb),
 public.read_gym_rank_v2(text,integer,text,boolean),public.read_gym_rank(text,integer,text)
 from public,anon,authenticated;
grant execute on function public.record_verified_gym_rank_progress(text,text,bigint,text,bigint,jsonb),
 public.submit_local_gym_rank(text,text,text,bigint,bigint,text,bigint,jsonb),
 public.read_gym_rank_v2(text,integer,text,boolean),public.read_gym_rank(text,integer,text)
 to service_role;
