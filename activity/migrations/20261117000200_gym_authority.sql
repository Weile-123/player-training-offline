-- Application business data only; never modifies Timeflow platform tables.
create table if not exists public.gym_authority_actors(
 actor_key text primary key check(actor_key ~ '^[0-9a-f]{64}$'),
 document jsonb,version bigint not null default 0,fence bigint not null default 0,
 lease_owner uuid,lease_until timestamptz,
 rate_started timestamptz not null default now(),rate_count integer not null default 0,
 updated_at timestamptz not null default now()
);
create table if not exists public.gym_authority_alumni_records(
 actor_key text not null references public.gym_authority_actors(actor_key),
 epoch text not null,sequence bigint not null check(sequence>=0),player jsonb not null,
 primary key(actor_key,epoch,sequence)
);
create table if not exists public.gym_authority_limits(
 key text primary key,started_at timestamptz not null,count integer not null
);
create unique index if not exists gym_authority_scope_owner on public.gym_authority_actors((document->>'workspaceId'),(document->>'scopeType'),(document->>'scopeId')) where document is not null;
create unique index if not exists gym_authority_epoch on public.gym_authority_actors((document->>'epoch')) where document is not null;
revoke all on public.gym_authority_actors,public.gym_authority_alumni_records,public.gym_authority_limits from public,anon,authenticated;
grant all on public.gym_authority_actors,public.gym_authority_alumni_records,public.gym_authority_limits to service_role;
alter table public.gym_authority_actors enable row level security;
alter table public.gym_authority_alumni_records enable row level security;
alter table public.gym_authority_limits enable row level security;

create or replace function public.gym_authority_claim(p_actor_key text,p_owner uuid,p_lease_ms integer default 120000)
returns jsonb language plpgsql security definer set search_path=public as $$
declare current public.gym_authority_actors;global_count integer;begin
 if p_actor_key !~ '^[0-9a-f]{64}$' or p_owner is null or p_lease_ms<30000 or p_lease_ms>180000 then raise exception 'REQUEST_INVALID';end if;
 insert into gym_authority_limits(key,started_at,count) values('application',clock_timestamp(),1)
 on conflict(key) do update set count=case when gym_authority_limits.started_at<clock_timestamp()-interval '1 minute' then 1 else gym_authority_limits.count+1 end,
 started_at=case when gym_authority_limits.started_at<clock_timestamp()-interval '1 minute' then clock_timestamp() else gym_authority_limits.started_at end
 returning count into global_count;
 if global_count>10000 then raise exception 'RATE_LIMITED';end if;
 insert into gym_authority_actors(actor_key) values(p_actor_key) on conflict do nothing;
 select * into current from gym_authority_actors where actor_key=p_actor_key for update;
 if current.rate_started<clock_timestamp()-interval '1 minute' then current.rate_count:=0;current.rate_started:=clock_timestamp();end if;
 if current.rate_count>=120 then raise exception 'RATE_LIMITED';end if;
 if current.lease_owner is not null and current.lease_until>clock_timestamp() then raise exception 'GYM_BUSY';end if;
 update gym_authority_actors set lease_owner=p_owner,lease_until=clock_timestamp()+make_interval(secs=>p_lease_ms/1000.0),
 fence=fence+1,rate_started=current.rate_started,rate_count=current.rate_count+1 where actor_key=p_actor_key
 returning * into current;
 return jsonb_build_object('document',current.document,'version',current.version,'fence',current.fence);
end $$;

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

create or replace function public.gym_authority_release(p_actor_key text,p_owner uuid,p_fence bigint)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
 update gym_authority_actors set lease_owner=null,lease_until=null where actor_key=p_actor_key and lease_owner=p_owner and fence=p_fence;
 return jsonb_build_object('released',found);
end $$;

create or replace function public.gym_authority_alumni(p_actor_key text,p_epoch text,p_offset bigint default 0,p_limit integer default 20)
returns jsonb language plpgsql security definer set search_path=public as $$
declare document jsonb;hot jsonb;hot_count bigint;cold_count bigint;players jsonb;begin
 if p_offset<0 or p_limit<1 or p_limit>100 then raise exception 'REQUEST_INVALID';end if;
 select a.document into document from gym_authority_actors a where actor_key=p_actor_key;
 if document is null or document->>'epoch' is distinct from p_epoch then raise exception 'EPOCH_MISMATCH';end if;
 hot:=coalesce(document#>'{state,alumni}','[]'::jsonb);hot_count:=jsonb_array_length(hot);cold_count:=coalesce((document#>>'{state,alumniArchive,count}')::bigint,0);
 select coalesce(jsonb_agg(page.player order by page.position),'[]'::jsonb) into players from(
  select combined.position,combined.player from(
   select hot_count-item.ordinality as position,item.value as player from jsonb_array_elements(hot) with ordinality item(value,ordinality)
   union all
   select hot_count+cold_count-1-record.sequence as position,record.player from gym_authority_alumni_records record
   where record.actor_key=p_actor_key and record.epoch=p_epoch and record.sequence<cold_count
  )combined order by combined.position offset p_offset limit p_limit
 )page;
 return jsonb_build_object('players',players,'total',hot_count+cold_count);
end $$;

revoke all on function public.gym_authority_claim(text,uuid,integer),public.gym_authority_commit(text,uuid,bigint,bigint,jsonb,jsonb,bigint),public.gym_authority_release(text,uuid,bigint),public.gym_authority_alumni(text,text,bigint,integer) from public,anon,authenticated;
grant execute on function public.gym_authority_claim(text,uuid,integer),public.gym_authority_commit(text,uuid,bigint,bigint,jsonb,jsonb,bigint),public.gym_authority_release(text,uuid,bigint),public.gym_authority_alumni(text,text,bigint,integer) to service_role;
