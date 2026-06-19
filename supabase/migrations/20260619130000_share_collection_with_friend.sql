-- ===========================================================================
-- Приглашение друзей в коллекцию
-- ===========================================================================

-- Делится коллекцией с другом по его user_id. В отличие от share_collection
-- (по email) email друга приложению недоступен — друзей знаем только по нику.
-- Пригласить можно только принятого друга, делиться может только владелец.
create or replace function public.share_collection_with_user(cid uuid, invitee_id uuid, member_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_collection_member(cid, 'owner') then
    raise exception 'not_owner';
  end if;
  if member_role not in ('editor', 'viewer') then
    raise exception 'bad_role';
  end if;
  if invitee_id = auth.uid() then
    raise exception 'self';
  end if;
  if not public.are_friends(invitee_id) then
    raise exception 'not_friend';
  end if;
  insert into public.collection_members (collection_id, user_id, role)
    values (cid, invitee_id, member_role)
    on conflict (collection_id, user_id) do update set role = excluded.role;
end;
$$;

grant execute on function public.share_collection_with_user(uuid, uuid, text) to authenticated;
