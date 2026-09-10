// ============================================================
// Cloudflare Pages Functions — 单文件通配路由入口（薄路由版）
// 文件位置：/functions/api/[[route]].js
// 处理：GET|POST /api/*
// 环境绑定：env.DB = D1 (Variable=DB 在 Pages Settings→Functions 绑定)
// 多用户体系（2026-09 升级）新增 Secrets（推荐在 Cloudflare Worker Secrets 设置）：
//   HMAC_SECRET             → token 签名密钥（不设会用 REGISTER_INVITE_CODE + 默认串降级）
//   REGISTER_INVITE_CODE    → 新注册必须匹配的邀请码（不设则关闭注册，只有 owner 能用）
//   BOOTSTRAP_OWNER_CODE    → 一次性初始化 owner 账号的口令（部署后首次使用）
//
// 路由分发：本文件只负责 path/method → handler 的映射，
//   具体业务逻辑见 _lib/handlers/*.js，共享工具见 _lib/core.js，鉴权上下文见 _lib/context.js
// ============================================================
import { json, safeUser } from '../_lib/core.js';
import { resolveUser, isPublicPath } from '../_lib/context.js';
import {
  handleAuthBootstrapOwner,
  handleAuthRegister,
  handleAuthLogin,
  handleAuthUpdateMe,
} from '../_lib/handlers/auth.js';
import {
  handleHabitsList, handleHabitsArchivedList, handleHabitsCreate, handleHabitsUpdate,
  handleHabitsReorder, handleHabitsArchive, handleHabitsRemove, handleHabitsToggle,
  handleHabitsLogSleep, handleHabitsLogCount, handleHabitsStats,
} from '../_lib/handlers/habits.js';
import {
  handleTasksList, handleTasksGet, handleTasksCreate, handleTasksUpdate, handleTasksRemove,
} from '../_lib/handlers/tasks.js';
import {
  handleInboxList, handleInboxCreate, handleInboxUpdate, handleInboxProcess, handleInboxRemove,
} from '../_lib/handlers/inbox.js';
import {
  handleSchedulesList, handleSchedulesGet, handleSchedulesCreate, handleSchedulesUpdate,
  handleSchedulesRemove, handleSchedulesSync,
} from '../_lib/handlers/schedules.js';
import {
  handleSummariesGet, handleSummariesRange, handleSummariesUpsert, handleSummariesRemove,
} from '../_lib/handlers/summaries.js';
import {
  handleFixedSchedulesList, handleFixedSchedulesCreate, handleFixedSchedulesUpdate,
  handleFixedSchedulesRemove,
} from '../_lib/handlers/fixedSchedules.js';
import {
  handleRecycleBinList, handleRecycleBinRestore, handleRecycleBinRemove, handleRecycleBinClear,
} from '../_lib/handlers/recycleBin.js';
import {
  handleFinanceBootstrap,
  handleFinanceAccountCreate, handleFinanceAccountUpdate, handleFinanceAccountRemove,
  handleFinanceCategoryCreate, handleFinanceCategoryUpdate, handleFinanceCategoryRemove,
  handleFinanceTxCreate, handleFinanceTxUpdate, handleFinanceTxRemove,
  handleFinanceGoalCreate, handleFinanceGoalUpdate, handleFinanceGoalRemove, handleFinanceGoalDeposit,
} from '../_lib/handlers/finance.js';
import {
  handleInviteCodeCreate, handleInviteCodeList, handleInviteCodeDisable,
} from '../_lib/handlers/inviteCodes.js';
import { handleUsersList, handleUsersBan } from '../_lib/handlers/users.js';
import { handleUserSettingsGet, handleUserSettingsSet } from '../_lib/handlers/userSettings.js';
import { handleWereadSync, handleWereadSearch } from '../_lib/handlers/weread.js';
import { handleCoverSearch, handleCoverProxy } from '../_lib/handlers/cover.js';
import { handleBirthdayMigrate, handleMigrate } from '../_lib/handlers/migrate.js';

export async function onRequest(context) {
  const { request, env } = context;
  const { method, path, body, q, qOrBody, currentUser } = await resolveUser(context);

  if (method === 'OPTIONS') return json({ ok: true });

  // 登录保护：非白名单接口必须有 currentUser
  if (!isPublicPath(path) && !currentUser) {
    return json({ error: '需要登录' }, 401);
  }

  try {
    // ------------------------------------------------------------
    // /api/auth/*  — 多用户账号体系
    // ------------------------------------------------------------
    if (path === '/api/auth/bootstrapOwner' && method === 'POST') return handleAuthBootstrapOwner(env, body);
    if (path === '/api/auth/register' && method === 'POST') return handleAuthRegister(env, body);
    if (path === '/api/auth/login' && (method === 'POST' || method === 'GET')) return handleAuthLogin(env, body, method, currentUser);
    if (path === '/api/auth/me' && method === 'GET') {
      if (!currentUser) return json({ user: null });
      return json({ user: safeUser(currentUser) });
    }
    if (path === '/api/auth/unlock' && method === 'POST') {
      // 旧接口兼容：尝试 password 作为账号密码登录
      return handleAuthLogin(env, { email: '', password: body?.password || '' }, 'POST', currentUser);
    }
    if (path === '/api/auth/logout' && method === 'POST') return json({ ok: true });
    // 更新当前用户资料（头像上传 / 恢复默认头像 / 改用户名）
    if (path === '/api/auth/updateMe' && method === 'POST') return handleAuthUpdateMe(env, body, currentUser);

    // ------------------------------------------------------------
    // /api/migrate  — 批量写入 6 表（Supabase→D1 一次性）
    // 入参：{ ethan_habits: [], ethan_habit_logs: [], ethan_schedules: [], ethan_tasks: [], ethan_summaries: [], ethan_fixed_schedules: [] }
    // ------------------------------------------------------------
    if (path === '/api/migrate' && method === 'POST') return handleMigrate(env, body);

    // ------------------------------------------------------------
    // /api/habits/*
    // ------------------------------------------------------------
    if (path === '/api/habits/list' && (method === 'GET' || method === 'POST')) return handleHabitsList(env, qOrBody);
    if (path === '/api/habits/archivedList' && (method === 'GET' || method === 'POST')) return handleHabitsArchivedList(env);
    if (path === '/api/habits/create' && method === 'POST') return handleHabitsCreate(env, body);
    if (path === '/api/habits/update' && method === 'POST') return handleHabitsUpdate(env, body);
    if (path === '/api/habits/reorder' && method === 'POST') return handleHabitsReorder(env, body);
    if (path === '/api/habits/archive' && method === 'POST') return handleHabitsArchive(env, body, 1);
    if (path === '/api/habits/restore' && method === 'POST') return handleHabitsArchive(env, body, 0);
    if (path === '/api/habits/remove' && method === 'POST') return handleHabitsRemove(env, body);
    if (path === '/api/habits/toggle' && method === 'POST') return handleHabitsToggle(env, body);
    if (path === '/api/habits/logSleep' && method === 'POST') return handleHabitsLogSleep(env, body);
    if (path === '/api/habits/logCount' && method === 'POST') return handleHabitsLogCount(env, body);
    if (path === '/api/habits/stats' && (method === 'GET' || method === 'POST')) return handleHabitsStats(env, qOrBody);

    // ------------------------------------------------------------
    // /api/tasks/*
    // ------------------------------------------------------------
    if (path === '/api/tasks/list' && (method === 'GET' || method === 'POST')) return handleTasksList(env, qOrBody);
    if (path === '/api/tasks/get' && (method === 'GET' || method === 'POST')) return handleTasksGet(env, qOrBody);
    if (path === '/api/tasks/create' && method === 'POST') return handleTasksCreate(env, body);
    if (path === '/api/tasks/update' && method === 'POST') return handleTasksUpdate(env, body);
    if (path === '/api/tasks/remove' && method === 'POST') return handleTasksRemove(env, body);

    // ------------------------------------------------------------
    // /api/inbox/*  — 收集箱（想法/备忘快速捕获，空了再分派）
    // ------------------------------------------------------------
    if (path === '/api/inbox/list' && (method === 'GET' || method === 'POST')) return handleInboxList(env, qOrBody);
    if (path === '/api/inbox/create' && method === 'POST') return handleInboxCreate(env, body);
    if (path === '/api/inbox/update' && method === 'POST') return handleInboxUpdate(env, body);
    if (path === '/api/inbox/process' && method === 'POST') return handleInboxProcess(env, body);
    if (path === '/api/inbox/remove' && method === 'POST') return handleInboxRemove(env, body);

    // ------------------------------------------------------------
    // /api/schedules/*
    // ------------------------------------------------------------
    if (path === '/api/schedules/list' && (method === 'GET' || method === 'POST')) return handleSchedulesList(env, qOrBody);
    if (path === '/api/schedules/get' && (method === 'GET' || method === 'POST')) return handleSchedulesGet(env, qOrBody);
    if (path === '/api/schedules/create' && method === 'POST') return handleSchedulesCreate(env, body);
    if (path === '/api/schedules/update' && method === 'POST') return handleSchedulesUpdate(env, body);
    if (path === '/api/schedules/remove' && method === 'POST') return handleSchedulesRemove(env, body);
    if (path === '/api/schedules/sync' && method === 'POST') return handleSchedulesSync(env, body);

    // ------------------------------------------------------------
    // /api/summaries/*
    // ------------------------------------------------------------
    if (path === '/api/summaries/get' && (method === 'GET' || method === 'POST')) return handleSummariesGet(env, qOrBody);
    if (path === '/api/summaries/range' && (method === 'GET' || method === 'POST')) return handleSummariesRange(env, qOrBody);
    if (path === '/api/summaries/upsert' && method === 'POST') return handleSummariesUpsert(env, body);
    if (path === '/api/summaries/remove' && method === 'POST') return handleSummariesRemove(env, body);

    // ------------------------------------------------------------
    // /api/fixedSchedules/*
    // ------------------------------------------------------------
    if (path === '/api/fixedSchedules/list' && (method === 'GET' || method === 'POST')) return handleFixedSchedulesList(env);
    if (path === '/api/fixedSchedules/create' && method === 'POST') return handleFixedSchedulesCreate(env, body);
    if (path === '/api/fixedSchedules/update' && method === 'POST') return handleFixedSchedulesUpdate(env, body);
    if (path === '/api/fixedSchedules/remove' && method === 'POST') return handleFixedSchedulesRemove(env, body);

    // ------------------------------------------------------------
    // /api/finance/*  — 财务模块（发展规划 · 第 6 模块：目标/资产负债/收支/流水）
    //   bootstrap 一次拉全仪表盘；CRUD 动作式路由与各模块对齐
    // ------------------------------------------------------------
    if (path === '/api/finance/bootstrap' && (method === 'GET' || method === 'POST')) return handleFinanceBootstrap(env, qOrBody);
    if (path === '/api/finance/accountCreate' && method === 'POST') return handleFinanceAccountCreate(env, body);
    if (path === '/api/finance/accountUpdate' && method === 'POST') return handleFinanceAccountUpdate(env, body);
    if (path === '/api/finance/accountRemove' && method === 'POST') return handleFinanceAccountRemove(env, body);
    if (path === '/api/finance/categoryCreate' && method === 'POST') return handleFinanceCategoryCreate(env, body);
    if (path === '/api/finance/categoryUpdate' && method === 'POST') return handleFinanceCategoryUpdate(env, body);
    if (path === '/api/finance/categoryRemove' && method === 'POST') return handleFinanceCategoryRemove(env, body);
    if (path === '/api/finance/txCreate' && method === 'POST') return handleFinanceTxCreate(env, body);
    if (path === '/api/finance/txUpdate' && method === 'POST') return handleFinanceTxUpdate(env, body);
    if (path === '/api/finance/txRemove' && method === 'POST') return handleFinanceTxRemove(env, body);
    if (path === '/api/finance/goalCreate' && method === 'POST') return handleFinanceGoalCreate(env, body);
    if (path === '/api/finance/goalUpdate' && method === 'POST') return handleFinanceGoalUpdate(env, body);
    if (path === '/api/finance/goalRemove' && method === 'POST') return handleFinanceGoalRemove(env, body);
    if (path === '/api/finance/goalDeposit' && method === 'POST') return handleFinanceGoalDeposit(env, body);

    // ------------------------------------------------------------
    // /api/recycleBin/*  — 回收站（软删除快照：删除前先入站，可还原/永久删除/清空）
    //   source_type: task | schedule | habit | fixedSchedule | summary
    // ------------------------------------------------------------
    if (path === '/api/recycleBin/list' && (method === 'GET' || method === 'POST')) return handleRecycleBinList(env);
    if (path === '/api/recycleBin/restore' && method === 'POST') return handleRecycleBinRestore(env, body);
    if (path === '/api/recycleBin/remove' && method === 'POST') return handleRecycleBinRemove(env, body);
    if (path === '/api/recycleBin/clear' && method === 'POST') return handleRecycleBinClear(env);

    // ------------------------------------------------------------
    // /api/inviteCodes/*  — 邀请码管理（仅 owner）
    // ------------------------------------------------------------
    if (path === '/api/inviteCodes/create' && method === 'POST') return handleInviteCodeCreate(env);
    if (path === '/api/inviteCodes/list' && (method === 'GET' || method === 'POST')) return handleInviteCodeList(env);
    if (path === '/api/inviteCodes/disable' && method === 'POST') return handleInviteCodeDisable(env, body);

    // ------------------------------------------------------------
    // /api/users/*  — 用户管理（仅 owner）
    // ------------------------------------------------------------
    if (path === '/api/users/list' && (method === 'GET' || method === 'POST')) return handleUsersList(env);
    if (path === '/api/users/ban' && method === 'POST') return handleUsersBan(env, body, 1);
    if (path === '/api/users/unban' && method === 'POST') return handleUsersBan(env, body, 0);

    // ------------------------------------------------------------
    // /api/userSettings/*  — 用户级配置 KV（weread key、年度规划镜像等）
    //   表结构：ethan_user_settings (user_id, k, v, updated_at, version)
    //   GET 返回 { key: { v, version } }；SET 支持 full（{k,v}）与 partial（{k,partial} 字段级合并）
    // ------------------------------------------------------------
    if (path === '/api/userSettings/get' && method === 'GET') return handleUserSettingsGet(env, q.k || '');
    if (path === '/api/userSettings/set' && method === 'POST') return handleUserSettingsSet(env, body);

    // ------------------------------------------------------------
    // /api/weread/*  — 微信读书 Skills 官方 API（wrk-xxx）
    // ------------------------------------------------------------
    if (path === '/api/weread/sync' && method === 'GET') return handleWereadSync(env, q);
    if (path === '/api/weread/search' && method === 'GET') return handleWereadSearch(env, q);

    // ------------------------------------------------------------
    // /api/cover/search  — 封面兜底：豆瓣 → Google Books
    //              /proxy — 豆瓣/微信读书 图片防盗链同源代理
    // ------------------------------------------------------------
    if (path === '/api/cover/search' && method === 'GET') return handleCoverSearch(env, q);
    if (path === '/api/cover/proxy' && method === 'GET') return handleCoverProxy(env, q.url || '');

    // ------------------------------------------------------------
    // /api/birthday-migrate  — 一次性迁移：录入生日事项
    // ------------------------------------------------------------
    if (path === '/api/birthday-migrate' && method === 'GET') return handleBirthdayMigrate(env);

    // 404
    return json({ error: 'Not Found: ' + method + ' ' + path }, 404);
  } catch (err) {
    console.error('[api]', method, path, err);
    return json({ error: err.message || 'Server Error' }, 500);
  }
}
