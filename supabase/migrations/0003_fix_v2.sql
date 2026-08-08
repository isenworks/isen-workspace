-- ============================================================
-- 彻底修复：使用 RETURNS SETOF record 避免类型匹配问题
-- 在 Supabase SQL Editor 中执行
-- ============================================================

-- 第 1 步：查看当前函数状态（先执行这个看看结果）
-- select proname, pg_get_functiondef(p.oid) 
-- from pg_proc p join pg_namespace n on p.pronamespace = n.oid 
-- where n.nspname = 'public' and proname in ('list_invite_codes', 'list_all_users');

-- 第 2 步：强制删除旧函数（使用 CASCADE 确保删除）
drop function if exists public.list_invite_codes() cascade;
drop function if exists public.list_all_users() cascade;

-- 第 3 步：重新创建（使用 SETOF record 避免类型匹配问题）
create function public.list_invite_codes(
  out id bigint,
  out code text,
  out created_at timestamptz,
  out is_used boolean,
  out used_by_email text,
  out is_disabled boolean
)
returns setof record
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_email text;
begin
  select au.email into v_admin_email from auth.users au where au.id = auth.uid();
  if v_admin_email is distinct from '1429000825@qq.com' then
    raise exception '无权查看';
  end if;
  return query
    select
      c.id,
      c.code,
      c.created_at,
      (c.used_by is not null)::boolean,
      u.email,
      c.is_disabled
    from public.ethan_invite_codes c
    left join auth.users u on c.used_by = u.id
    order by c.created_at desc;
end;
$$;

create function public.list_all_users(
  out user_id uuid,
  out email text,
  out username text,
  out is_banned boolean,
  out created_at timestamptz
)
returns setof record
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_email text;
begin
  select au.email into v_admin_email from auth.users au where au.id = auth.uid();
  if v_admin_email is distinct from '1429000825@qq.com' then
    raise exception '无权查看';
  end if;
  return query
    select
      au.id,
      au.email,
      coalesce(p.username, split_part(au.email, '@', 1)),
      coalesce(p.is_banned, false)::boolean,
      au.created_at
    from auth.users au
    left join public.ethan_profiles p on au.id = p.id
    order by au.created_at desc;
end;
$$;

-- 第 4 步：验证函数是否创建成功
-- select proname from pg_proc p join pg_namespace n on p.pronamespace = n.oid 
-- where n.nspname = 'public' and proname in ('list_invite_codes', 'list_all_users');
