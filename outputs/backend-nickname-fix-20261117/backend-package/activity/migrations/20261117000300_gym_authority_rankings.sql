-- Upgrade an already-deployed authority function. No table/user-data rebuild.
-- Apply ranking migration 20261117000100 first.
create or replace function public.gym_authority_commit(p_actor_key text,p_owner uuid,p_fence bigint,p_expected_version bigint,p_document jsonb,p_alumni jsonb,p_first_sequence bigint)
returns jsonb language plpgsql security definer set search_path=public as $$
declare current public.gym_authority_actors;old_count bigint;new_count bigint;added integer;new_epoch text;record jsonb;position bigint;begin
 select * into current from gym_authority_actors where actor_key=p_actor_key for update;
 if not found or current.lease_owner is distinct from p_owner or current.fence<>p_fence or current.lease_until<=clock_timestamp() then raise exception 'LEASE_EXPIRED';end if;
 if current.version<>p_expected_version then raise exception 'REVISION_CONFLICT';end if;
 if jsonb_typeof(p_document)<>'object' or p_document->>'version'<>'1' or jsonb_typeof(p_alumni)<>'array' then raise exception 'STATE_INVALID';end if;
 new_epoch:=p_document->>'epoch';
 if new_epoch is null or new_epoch !~ '^[0-9a-f-]{36}$' or (current.document is not null and current.document->>'epoch'<>new_epoch) then raise exception 'EPOCH_MISMATCH';end if;
 old_count:=coalesce((current.document#>>'{state,alumniArchive,count}')::bigint,0);
 new_count:=coalesce((p_document#>>'{state,alumniArchive,count}')::bigint,0);
 added:=jsonb_array_length(p_alumni);
 if p_first_sequence<>old_count or new_count<>old_count+added then raise exception 'HISTORY_CONFLICT';end if;
 position:=p_first_sequence;
 for record in select value from jsonb_array_elements(p_alumni) loop
  insert into gym_authority_alumni_records(actor_key,epoch,sequence,player) values(p_actor_key,new_epoch,position,record);
  position:=position+1;
 end loop;
 -- Evidence and canonical state must commit together. Client-imported legacy
 -- snapshots keep their progress but can never populate the public rankings.
 if p_document->'ranking' is not null and p_document->'ranking'<>'null'::jsonb then
  if p_document->>'provenance' is distinct from 'server-created'
   or p_document->>'applicationId' is distinct from 'app_847cdb589a'
   or p_document#>>'{ranking,puid}' is distinct from p_document->>'actorId'
   or p_document#>>'{ranking,runId}' is distinct from ((p_document#>>'{state,createdAt}')||'-'||(p_document#>>'{state,seed}'))
   or p_document#>>'{ranking,revision}' is distinct from p_document#>>'{state,revision}'
   or p_document#>>'{ranking,fame}' is distinct from p_document#>>'{state,fame}' then raise exception 'RANKING_BINDING_INVALID';end if;
  perform public.record_verified_gym_rank_progress(p_document#>>'{ranking,puid}',p_document#>>'{ranking,runId}',
   (p_document#>>'{ranking,revision}')::bigint,p_document#>>'{ranking,evidenceId}',(p_document#>>'{ranking,fame}')::bigint,p_document#>'{ranking,best}');
 end if;
 update gym_authority_actors set document=p_document,version=version+1,updated_at=clock_timestamp(),lease_until=clock_timestamp()+interval '120 seconds' where actor_key=p_actor_key returning version into p_expected_version;
 return jsonb_build_object('version',p_expected_version);
end $$;


revoke all on function public.gym_authority_commit(text,uuid,bigint,bigint,jsonb,jsonb,bigint) from public,anon,authenticated;
grant execute on function public.gym_authority_commit(text,uuid,bigint,bigint,jsonb,jsonb,bigint) to service_role;
