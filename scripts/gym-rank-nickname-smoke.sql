-- Run after migration 20261117000400. Synthetic rows are created, asserted and
-- removed in one atomic statement. Any failed assertion rolls back all writes.
do $qa$
declare suffix text:=gen_random_uuid()::text;actor_a text;actor_b text;missing_actor text;result jsonb;
 original_time timestamptz:=now()-interval '1 hour';begin
 actor_a:='e2e-rank-name-a-'||suffix;actor_b:='e2e-rank-name-b-'||suffix;missing_actor:='e2e-rank-name-empty-'||suffix;
 insert into leaderboard_entries(puid,board,score,best,display_name,updated_at) values
  (actor_a,'fame',99,null,'旧昵称',original_time),(actor_a,'player',320,null,'旧昵称',original_time),
  (actor_b,'fame',100,null,'另一个账号',original_time);
 result:=update_gym_rank_name(actor_a,'新昵称🏀');
 if result->>'accepted'<>'true' or (result->>'updated')::integer<>2 then raise exception 'profile update not acknowledged';end if;
 if (select count(*) from leaderboard_entries where puid=actor_a and display_name='新昵称🏀' and updated_at=original_time)<>2
  or not exists(select 1 from leaderboard_entries where puid=actor_a and board='fame' and score=99)
  or not exists(select 1 from leaderboard_entries where puid=actor_a and board='player' and score=320)
 then raise exception 'profile changed scores or tie timestamps';end if;
 if not exists(select 1 from leaderboard_entries where puid=actor_b and display_name='另一个账号' and score=100 and updated_at=original_time)
 then raise exception 'another actor was changed';end if;
 result:=update_gym_rank_name(missing_actor,'没有成绩');
 if (result->>'updated')::integer<>0 or exists(select 1 from leaderboard_entries where puid=missing_actor)
 then raise exception 'profile invented a score';end if;
 perform record_verified_gym_rank_progress(actor_a,'1800000000000-23',1,'nameqa:'||suffix,77,null);
 perform submit_gym_rank(actor_a,'同分未提升时改名','1800000000000-23',1);
 result:=submit_gym_rank(actor_a,'相同进度重试时改名','1800000000000-23',1);
 if result->>'duplicate'<>'true' or (select count(*) from leaderboard_entries where puid=actor_a and display_name='相同进度重试时改名' and updated_at=original_time)<>2
  or not exists(select 1 from leaderboard_entries where puid=actor_a and board='fame' and score=99)
 then raise exception 'duplicate progress failed to rename without changing highest score';end if;
 if has_function_privilege('anon','public.update_gym_rank_name(text,text)','execute')
  or has_function_privilege('authenticated','public.update_gym_rank_name(text,text)','execute')
  or not has_function_privilege('service_role','public.update_gym_rank_name(text,text)','execute')
 then raise exception 'profile RPC privileges invalid';end if;
 delete from gym_rank_events where puid in (actor_a,actor_b,missing_actor);
 delete from gym_verified_progress where puid in (actor_a,actor_b,missing_actor);
 delete from leaderboard_entries where puid in (actor_a,actor_b,missing_actor);
end $qa$;
