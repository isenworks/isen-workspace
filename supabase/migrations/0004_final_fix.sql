-- ============================================================
-- 全新修复：使用新函数名 + OUT 参数，彻底避开旧定义
-- 在 Supabase SQL Editor 中执行
-- ============================================================

-- 删除旧函数（不影响新函数）
DROP FUNCTION IF EXISTS public.list_invite_codes() CASCADE;
DROP FUNCTION IF EXISTS public.list_all_users() CASCADE;

-- 新函数 1：管理员列出邀请码
CREATE OR REPLACE FUNCTION public.admin_invite_codes(
  OUT id bigint,
  OUT code text,
  OUT created_at timestamptz,
  OUT is_used boolean,
  OUT used_by_email text,
  OUT is_disabled boolean
)
RETURNS SETOF record
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.code,
    c.created_at,
    CASE WHEN c.used_by IS NOT NULL THEN true ELSE false END AS is_used,
    u.email AS used_by_email,
    c.is_disabled
  FROM public.ethan_invite_codes c
  LEFT JOIN auth.users u ON c.used_by = u.id
  WHERE EXISTS (
    SELECT 1 FROM auth.users au
    WHERE au.id = auth.uid()
    AND au.email = '1429000825@qq.com'
  )
  ORDER BY c.created_at DESC;
$$;

-- 新函数 2：管理员列出所有用户
CREATE OR REPLACE FUNCTION public.admin_all_users(
  OUT user_id uuid,
  OUT email text,
  OUT username text,
  OUT is_banned boolean,
  OUT created_at timestamptz
)
RETURNS SETOF record
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    au.id,
    au.email,
    COALESCE(p.username, split_part(au.email, '@', 1)) AS username,
    COALESCE(p.is_banned, false) AS is_banned,
    au.created_at
  FROM auth.users au
  LEFT JOIN public.ethan_profiles p ON au.id = p.id
  WHERE EXISTS (
    SELECT 1 FROM auth.users au2
    WHERE au2.id = auth.uid()
    AND au2.email = '1429000825@qq.com'
  )
  ORDER BY au.created_at DESC;
$$;

-- 验证：执行后应能看到这两个新函数
-- SELECT proname FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid 
-- WHERE n.nspname = 'public' AND proname IN ('admin_invite_codes', 'admin_all_users');
