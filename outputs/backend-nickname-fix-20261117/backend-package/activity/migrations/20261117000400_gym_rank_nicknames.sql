-- Display-name maintenance only. No scores, first-achievement timestamps,
-- existing account identities or ranking entries are created by profile sync.
alter table public.leaderboard_entries alter column display_name set default '匿名训练师';

create or replace function public.update_gym_rank_name(p_puid text,p_name text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare changed integer;begin
 if p_puid is null or length(p_puid)=0 or length(p_puid)>200 or p_puid<>btrim(p_puid) or p_puid ~ '[[:cntrl:]]'
 then raise exception 'invalid-actor';end if;
 if p_name is null or length(btrim(p_name))=0 or char_length(p_name)>60 or p_name ~ '[[:cntrl:]]'
 then raise exception 'invalid-display-name';end if;
 p_name:=btrim(p_name);
 perform pg_advisory_xact_lock(hashtextextended(p_puid,0));
 update leaderboard_entries set display_name=p_name where puid=p_puid and board in ('player','fame') and display_name is distinct from p_name;
 get diagnostics changed=row_count;
 return jsonb_build_object('accepted',true,'updated',changed);
end $$;

create or replace function public.submit_gym_rank(p_puid text,p_name text,p_run text,p_revision bigint)
returns jsonb language plpgsql security definer set search_path=public as $$
declare verified public.gym_verified_progress;begin
 if p_puid is null or length(p_puid)=0 or p_revision<0 then raise exception 'invalid-reference';end if;
 p_name:=coalesce(nullif(btrim(p_name),''),'匿名训练师');
 if char_length(p_name)>60 or p_name ~ '[[:cntrl:]]' then raise exception 'invalid-display-name';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_puid,0));
 select * into verified from gym_verified_progress where puid=p_puid and run_id=p_run and revision=p_revision;
 if not found then raise exception 'verified-progress-required';end if;
 -- A same-revision retry still refreshes the submitted nickname. The update
 -- touches display_name alone, preserving score tie order and lifetime bests.
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

revoke all on function public.update_gym_rank_name(text,text),public.submit_gym_rank(text,text,text,bigint) from public,anon,authenticated;
grant execute on function public.update_gym_rank_name(text,text),public.submit_gym_rank(text,text,text,bigint) to service_role;
