-- Keep the existing player/fame boards and both submission contracts.
alter table public.gym_verified_progress
 add column if not exists challenge_stage bigint not null default 0,
 add column if not exists challenge_reached_at timestamptz;
alter table public.gym_local_rank_checkpoints add column if not exists challenge_stage bigint not null default 0;

-- A still-valid pre-update submission can publish an existing canonical record.
-- Older rules retain one move per rewarded stage and the record ends on a win.
with earlier as (
 select document->>'actorId' as puid, document->'ranking' as ranking,
  case when jsonb_typeof(document#>'{state,challenge,record,moves}')='array'
   then jsonb_array_length(document#>'{state,challenge,record,moves}')::bigint+1 end as stage
 from public.gym_authority_actors
 where document->>'provenance'='server-created' and document->>'applicationId'='app_847cdb589a'
  and coalesce(document#>>'{state,challenge,record,rulesVersion}','1') in ('1','2','3','4','5')
)
update public.gym_verified_progress as verified
 set challenge_stage=earlier.stage,challenge_reached_at=verified.created_at
 from earlier where earlier.puid=verified.puid and earlier.ranking->>'runId'=verified.run_id
  and earlier.ranking->>'revision'=verified.revision::text and earlier.ranking->>'evidenceId'=verified.evidence_id
  and verified.challenge_stage=0 and earlier.stage>0 and earlier.stage<=verified.fame/6;

create or replace function public.upsert_gym_challenge_rank(p_puid text,p_name text,p_stage bigint,p_reached_at timestamptz)
returns void language sql security definer set search_path=public as $$
 insert into leaderboard_entries(puid,board,score,best,display_name,updated_at)
 select p_puid,'challenge',p_stage,null,coalesce(nullif(btrim(p_name),''),'匿名训练师'),p_reached_at where p_stage>0
 on conflict(puid,board) do update set score=excluded.score,updated_at=excluded.updated_at
 where leaderboard_entries.score<excluded.score;
$$;

-- gym_authority_commit records existing evidence before updating the authority
-- document. Extend that transaction without replacing its lease/history logic.
create or replace function public.record_canonical_gym_challenge_rank()
returns trigger language plpgsql security definer set search_path=public as $$
declare ranking jsonb:=new.document->'ranking'; stage bigint; current public.gym_verified_progress;
 previous public.gym_verified_progress; reached_at timestamptz;begin
 if ranking is null or not (ranking ? 'challenge') then return new;end if;
 if new.document->>'provenance' is distinct from 'server-created'
  or new.document->>'applicationId' is distinct from 'app_847cdb589a'
  or jsonb_typeof(ranking->'challenge') is distinct from 'number'
  or coalesce(ranking->>'challenge','') !~ '^(0|[1-9][0-9]{0,15})$'
 then raise exception 'invalid-verified-challenge';end if;
 stage:=(ranking->>'challenge')::bigint;
 select * into current from gym_verified_progress where puid=new.document->>'actorId' and run_id=ranking->>'runId'
  and revision=(ranking->>'revision')::bigint and evidence_id=ranking->>'evidenceId';
 if not found or stage>current.fame/6 then raise exception 'invalid-verified-challenge';end if;
 if current.challenge_reached_at is not null then
  if current.challenge_stage<>stage then raise exception 'verified-challenge-conflict';end if;
  return new;
 end if;
 select * into previous from gym_verified_progress where puid=current.puid and run_id=current.run_id
  and revision<current.revision and challenge_reached_at is not null order by revision desc limit 1;
 if found and stage<previous.challenge_stage then raise exception 'verified-challenge-regression';end if;
 if stage=0 then return new;end if;
 reached_at:=case when previous.challenge_stage=stage then previous.challenge_reached_at else now() end;
 update gym_verified_progress set challenge_stage=stage,challenge_reached_at=reached_at
 where puid=current.puid and run_id=current.run_id and revision=current.revision;
 return new;
end $$;
drop trigger if exists gym_authority_challenge_rank on public.gym_authority_actors;
create trigger gym_authority_challenge_rank after update of document on public.gym_authority_actors
 for each row execute function public.record_canonical_gym_challenge_rank();

create or replace function public.submit_gym_rank(p_puid text,p_name text,p_run text,p_revision bigint)
returns jsonb language plpgsql security definer set search_path=public as $$
declare verified public.gym_verified_progress;begin
 if p_puid is null or length(p_puid)=0 or p_revision<0 then raise exception 'invalid-reference';end if;
 p_name:=coalesce(nullif(btrim(p_name),''),'匿名训练师');
 if char_length(p_name)>60 or p_name ~ '[[:cntrl:]]' then raise exception 'invalid-display-name';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_puid,0));
 select * into verified from gym_verified_progress where puid=p_puid and run_id=p_run and revision=p_revision;
 if not found then raise exception 'verified-progress-required';end if;
 -- A retry of a pre-migration revision can now publish its challenge score.
 perform public.upsert_gym_challenge_rank(p_puid,p_name,verified.challenge_stage,verified.challenge_reached_at);
 update leaderboard_entries set display_name=p_name where puid=p_puid and display_name<>p_name;
 if exists(select 1 from gym_rank_events where puid=p_puid and run_id=p_run and revision=p_revision) then
  return jsonb_build_object('accepted',true,'duplicate',true);
 end if;
 if exists(select 1 from gym_rank_events where puid=p_puid and created_at>now()-interval '3 seconds') then raise exception 'rate-limit';end if;
 insert into gym_rank_events(puid,run_id,revision) values(p_puid,p_run,p_revision);
 insert into leaderboard_entries(puid,board,score,best,display_name,updated_at) values(p_puid,'fame',verified.fame,null,p_name,verified.fame_reached_at)
 on conflict(puid,board) do update set score=excluded.score,best=null,updated_at=excluded.updated_at where leaderboard_entries.score<excluded.score;
 if verified.best is not null then
  insert into leaderboard_entries(puid,board,score,best,display_name,updated_at) values(p_puid,'player',(verified.best->>'value')::numeric,verified.best,p_name,verified.best_reached_at)
  on conflict(puid,board) do update set score=excluded.score,best=excluded.best,updated_at=excluded.updated_at where leaderboard_entries.score<excluded.score;
 end if;
 delete from gym_rank_events where puid=p_puid and (run_id,revision) not in
  (select run_id,revision from gym_rank_events where puid=p_puid order by created_at desc,run_id,revision desc limit 256);
 return jsonb_build_object('accepted',true,'duplicate',false);
end $$;

create or replace function public.submit_local_gym_rank_v2(p_puid text,p_name text,p_run text,p_revision bigint,p_updated bigint,p_evidence text,p_fame bigint,p_best jsonb,p_challenge bigint)
returns jsonb language plpgsql security definer set search_path=public as $$
declare previous_stage bigint; result jsonb;begin
 if p_challenge is null or p_challenge<0 or p_fame is null or p_challenge>p_fame/6 then raise exception 'invalid-local-challenge';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_puid,0));
 select challenge_stage into previous_stage from gym_local_rank_checkpoints where puid=p_puid and run_id=p_run;
 if found and p_challenge<previous_stage then raise exception 'local-challenge-regression';end if;
 result:=public.submit_local_gym_rank(p_puid,p_name,p_run,p_revision,p_updated,p_evidence,p_fame,p_best);
 update gym_local_rank_checkpoints set challenge_stage=p_challenge where puid=p_puid and run_id=p_run;
 perform public.upsert_gym_challenge_rank(p_puid,p_name,p_challenge,now());
 return result;
end $$;

create or replace function public.update_gym_rank_name(p_puid text,p_name text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare changed integer;begin
 if p_puid is null or length(p_puid)=0 or length(p_puid)>200 or p_puid<>btrim(p_puid) or p_puid ~ '[[:cntrl:]]'
 then raise exception 'invalid-actor';end if;
 if p_name is null or length(btrim(p_name))=0 or char_length(p_name)>60 or p_name ~ '[[:cntrl:]]'
 then raise exception 'invalid-display-name';end if;
 p_name:=btrim(p_name);
 perform pg_advisory_xact_lock(hashtextextended(p_puid,0));
 update leaderboard_entries set display_name=p_name where puid=p_puid and board in ('player','fame','challenge') and display_name is distinct from p_name;
 get diagnostics changed=row_count;
 return jsonb_build_object('accepted',true,'updated',changed);
end $$;

create or replace function public.read_gym_rank_v2(p_board text,p_limit integer,p_puid text,p_extended boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
 entries jsonb;
 mine public.leaderboard_entries;
 position bigint;
 personal jsonb:=null;
 level_pattern text:=case when p_extended then '^(0|[1-9][0-9]{0,2}|1[0-9]{3}|2000)$' else '^[0-9]{1,2}$' end;
begin
 if p_board not in ('player','fame','challenge') or p_board is null or p_limit<1 or p_limit>100 or p_limit is null or p_extended is null then
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

revoke all on function public.upsert_gym_challenge_rank(text,text,bigint,timestamptz),public.record_canonical_gym_challenge_rank(),
 public.submit_local_gym_rank_v2(text,text,text,bigint,bigint,text,bigint,jsonb,bigint),public.submit_gym_rank(text,text,text,bigint),
 public.update_gym_rank_name(text,text),public.read_gym_rank_v2(text,integer,text,boolean) from public,anon,authenticated;
grant execute on function public.submit_local_gym_rank_v2(text,text,text,bigint,bigint,text,bigint,jsonb,bigint),
 public.submit_gym_rank(text,text,text,bigint),public.update_gym_rank_name(text,text),public.read_gym_rank_v2(text,integer,text,boolean) to service_role;
