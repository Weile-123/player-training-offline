-- A cloud save restore can rewind the whole-gym revision while keeping the
-- gym identity. Its replay-validated challenge result can still be a new high.
create or replace function public.submit_local_gym_rank_v2(p_puid text,p_name text,p_run text,p_revision bigint,p_updated bigint,p_evidence text,p_fame bigint,p_best jsonb,p_challenge bigint)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
 previous_stage bigint;
 rank_stage numeric;
 rank_reached_at timestamptz;
 challenge_only boolean:=false;
 result jsonb;
begin
 if p_challenge is null or p_challenge<0 or p_fame is null or p_challenge>p_fame/6 then raise exception 'invalid-local-challenge';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_puid,0));
 select challenge_stage into previous_stage from gym_local_rank_checkpoints where puid=p_puid and run_id=p_run;
 if found and p_challenge<previous_stage then raise exception 'local-challenge-regression';end if;
 select score,updated_at into rank_stage,rank_reached_at from leaderboard_entries where puid=p_puid and board='challenge';

 begin
  result:=public.submit_local_gym_rank(p_puid,p_name,p_run,p_revision,p_updated,p_evidence,p_fame,p_best);
 exception when raise_exception then
  -- The base function checks all submitted fields before comparing the prior
  -- checkpoint. Only recover these exact conflicts, after the RPC's caller
  -- has validated the complete portable archive and replayed the challenge.
  if p_challenge=0 or sqlerrm not in ('local-progress-regression','local-progress-conflict') then raise;end if;
  if p_challenge<rank_stage then raise exception 'local-challenge-regression';end if;
  if p_challenge=rank_stage then
   return jsonb_build_object('accepted',true,'duplicate',true,'source','local-validated');
  end if;
  challenge_only:=true;
  result:=jsonb_build_object('accepted',true,'duplicate',false,'source','local-validated');
 end;

 if p_challenge>coalesce(rank_stage,0) and (
  rank_reached_at>now()-interval '3 seconds'
  or challenge_only and exists(select 1 from gym_local_rank_checkpoints where puid=p_puid and submitted_at>now()-interval '3 seconds')
 ) then raise exception 'rate-limit';end if;

 if not challenge_only then
  update gym_local_rank_checkpoints set challenge_stage=p_challenge where puid=p_puid and run_id=p_run;
 end if;
 perform public.upsert_gym_challenge_rank(p_puid,p_name,p_challenge,now());
 return result;
end $$;

revoke all on function public.submit_local_gym_rank_v2(text,text,text,bigint,bigint,text,bigint,jsonb,bigint) from public,anon,authenticated;
grant execute on function public.submit_local_gym_rank_v2(text,text,text,bigint,bigint,text,bigint,jsonb,bigint) to service_role;
