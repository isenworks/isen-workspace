-- ============================================================
-- 增量更新：修复邀请码和用户列表函数
-- 在 Supabase Dashboard → SQL Editor 中执行此文件
-- ============================================================

-- 先删除旧函数（CREATE OR REPLACE 不能改变返回表结构）
drop function if exists public.list_invite_codes();
drop function if exists public.list_all_users();

-- 1. 重建 list_invite_codes
create or replace function public.list_invite_codes()
returns table (
  id bigint,
  code text,
  created_at timestamptz,
  is_used boolean,
  used_by_email text,
  is_disabled boolean
)
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
      (c.used_by is not null)::boolean as is_used,
      u.email as used_by_email,
      c.is_disabled
    from public.ethan_invite_codes c
    left join auth.users u on c.used_by = u.id
    order by c.created_at desc;
end;
$$;

-- 2. 重建 list_all_users
create or replace function public.list_all_users()
returns table (
  user_id uuid,
  email text,
  username text,
  is_banned boolean,
  created_at timestamptz
)
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
      au.id as user_id,
      au.email,
      coalesce(p.username, split_part(au.email, '@', 1)) as username,
      coalesce(p.is_banned, false)::boolean as is_banned,
      au.created_at
    from auth.users au
    left join public.ethan_profiles p on au.id = p.id
    order by au.created_at desc;
end;
$$;
