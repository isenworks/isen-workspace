# AGENTS.md — AI 工具项目地图

> 本文件供 AI 编码助手（Trae / Cursor / Claude Code 等）在探索代码前自动读取。
> 如果你是 AI agent，请先读完本文件再开始任何代码任务。

## 一句话总览

**全栈个人工作台**：前端 React + Vite，后端 Cloudflare Pages Functions + D1（SQLite）。
**活跃代码只在** **`client/`** **和** **`functions/`** **两个目录**，其余目录均为遗留/历史，不要修改、不要以其为准。

***

## 活跃 vs 遗留目录

| 目录                              | 角色                                                  | 是否活跃         |
| ------------------------------- | --------------------------------------------------- | ------------ |
| `client/`                       | React + Vite 前端（构建产物部署到 Cloudflare Pages 静态资源）      | ✅ 活跃         |
| `functions/`                    | Cloudflare Pages Functions（API 路由 + 业务逻辑）+ D1 数据库访问 | ✅ 活跃         |
| `supabase/d1_create_tables.sql` | D1 初始化 SQL（建表脚本，SQLite 方言）                          | ✅ 参考用（一次性建表） |
| `supabase/migrations/*.sql`     | 旧 Supabase PostgreSQL 迁移脚本（已弃用，仅保留历史）               | ❌ 遗留，勿改      |
| `server/`                       | 旧 Express + better-sqlite3 本地后端（已迁移到 `functions/`）  | ❌ 遗留，勿改      |
| `demo/`                         | 早期独立 HTML 原型（设计稿参考，非产品代码）                           | ❌ 原型，勿改      |

**重要**：根目录 `package.json` 的脚本已精简为 `dev` / `dev:client` / `build` 三条，全部指向 `client/`（前端）。本地开发：
- **纯前端 dev**（API 走线上 `ethan-workspace.pages.dev`）：`npm run dev`
- **本地全栈 dev**（API 走本地 Functions）：`cd client && npx wrangler pages dev ../functions -- npm run dev`

***

## 技术栈

### 前端（`client/`）

* **框架**：React 18 + Vite 5

* **样式**：Tailwind CSS 3（设计令牌在 `tailwind.config.js` 的 brand/ink/accent）

* **农历**：`lunar-javascript`（vendored 副本在 `client/src/vendor/lunar.js`）

* **构建**：`npm run build` → `client/dist/`（部署到 Cloudflare Pages 静态资源）

* **入口**：`client/src/main.jsx` → `App.jsx`

### 后端（`functions/`）

* **运行时**：Cloudflare Pages Functions（Workers 运行时，ESM）

* **数据库**：Cloudflare D1（SQLite 方言），环境变量绑定名 `env.DB`

* **路由**：单文件通配入口 `functions/api/[[route]].js`（薄路由，仅做 path/method → handler 分发）

* **鉴权**：HMAC-SHA256 token（`X-Unlock-Token` 头），密码 PBKDF2-SHA256 哈希

* **多用户**：owner / 普通用户 / 邀请码注册 / 封禁

### 部署

* **平台**：Cloudflare Pages（自动从 Git 构建）

* **线上域名**：`https://ethan-workspace.pages.dev/`（Cloudflare Pages 默认域名 `<project>.pages.dev`）

* **项目名**：`ethan-workspace`（Cloudflare Pages 项目名，与仓库根 `package.json` 的 `name: personal-workspace` 不一致，以 Cloudflare 项目名为准）

* **D1 绑定**：Pages → Settings → Functions → D1 database bindings，Variable name = `DB`

* **Secrets**（在 Cloudflare → Settings → Secrets 设置，勿提交）：

  * `HMAC_SECRET` — token 签名密钥

  * `REGISTER_INVITE_CODE` — 新注册邀请码

  * `BOOTSTRAP_OWNER_CODE` — 一次性初始化 owner 账号口令

  * `GITHUB_PAT_ENC_KEY` — 可选，GitHub PAT 托管加密密钥（缺省时从 HMAC_SECRET 派生）

***

## 项目结构（活跃部分）

```
isen-workspace/
├── client/                          # 前端
│   ├── src/
│   │   ├── main.jsx                 # 入口
│   │   ├── App.jsx
│   │   ├── pages/                   # 路由级页面（Workspace / AnnualPlan / CalendarPage / Login / RecycleBinPage）
│   │   ├── components/              # UI 组件（Sidebar / Timeline / HabitsPanel / SettingsModal / forms/* 等）
│   │   ├── context/                 # AuthContext（鉴权状态）/ ToastContext
│   │   ├── api/client.js            # 前端 API 客户端（统一 fetch 包装，D1 后端）
│   │   ├── utils/
│   │   │   ├── cloudKV.js           # 云端 KV 同步层（localStorage 主 + D1 镜像，字段级合并）
│   │   │   ├── theme.js / moduleTheme.js  # 主题色
│   │   │   ├── store.js / date.js / categoryMapping.js
│   │   └── index.css                # Tailwind 入口 + 全局样式
│   ├── tailwind.config.js
│   └── vite.config.js
│
├── functions/                       # 后端（Cloudflare Pages Functions）
│   ├── api/
│   │   └── [[route]].js             # 薄路由入口（path/method → handler 分发）
│   ├── _lib/
│   │   ├── core.js                  # 共享工具：DB 访问 / 鉴权 / 加密 / 表懒迁移 / settingGet/Set/Merge
│   │   ├── context.js               # 请求上下文：解析 X-Unlock-Token → currentUser
│   │   └── handlers/                # 业务 handler（每个文件对应一组 /api/<resource>/* 接口）
│   │       ├── auth.js              # /api/auth/*        登录/注册/bootstrapOwner
│   │       ├── habits.js            # /api/habits/*      习惯 CRUD + 打卡 + stats（聚合查询）
│   │       ├── tasks.js             # /api/tasks/*
│   │       ├── schedules.js         # /api/schedules/*  日程（含农历重复）
│   │       ├── fixedSchedules.js    # /api/fixedSchedules/*
│   │       ├── summaries.js         # /api/summaries/*   每日复盘
│   │       ├── recycleBin.js        # /api/recycleBin/*  软删除回收站
│   │       ├── inviteCodes.js       # /api/inviteCodes/* （仅 owner）
│   │       ├── github.js            # /api/github/*      GitHub PAT 托管 + AI 推送授权（仅 owner）
│   │       ├── users.js             # /api/users/*       用户管理（仅 owner）
│   │       ├── userSettings.js      # /api/userSettings/* KV 配置（weread key / 年度规划镜像）
│   │       ├── weread.js            # /api/weread/*      微信读书
│   │       ├── cover.js             # /api/cover/*        书封搜索 + 图片防盗链代理
│   │       └── migrate.js           # /api/migrate + /api/birthday-migrate
│   └── lib/lunar.js                 # 农历库（vendored UMD）
│
└── supabase/
    └── d1_create_tables.sql         # D1 建表脚本（一次性，参考用）
```

***

## 数据流

### 请求链路

```
浏览器
  └─ fetch('/api/<resource>/<action>')
       Header: X-Unlock-Token: <HMAC token>
       ↓
functions/api/[[route]].js           # 薄路由
  ├─ resolveUser(context)            # _lib/context.js：解析 token → currentUser
  ├─ isPublicPath(path) 校验         # 白名单：auth/login, auth/register, weread/*, cover/*, migrate
  └─ 分发到 _lib/handlers/<resource>.js
       └─ 调用 core.js 的 dbAll/dbFirst/dbRun + uid(env) 访问 D1
```

### 前端鉴权状态

* `client/src/context/AuthContext.jsx`：启动时调 `/api/auth/me` 校验 token，缓存到 `localStorage.pw_user` + `pw_unlock_token`

* `client/src/api/client.js`：`fetchPages()` 统一包装，401 自动清 token + 触发 `pw:auth-expired` 事件

### cloudKV 同步协议（结构化数据多设备同步）

* **主存储**：浏览器 localStorage（离线可用 + 秒开）

* **镜像**：D1 `ethan_user_settings` 表（`user_id, k, v, updated_at, version`）

* **简单值**（主题/分类等字符串、数组）：LWW 后写覆盖

* **结构化对象**（按 id 索引的记录，如 `annual_habit_targets`）：**字段级合并**

  * 云端值形态（envelope）：`{ __mv: <版本>, fields: { fieldName: { t: <服务器ms时间戳>, v: <任意值> } } }`

  * 推送：`cloudMergePush(key, { fieldName: newValue })` → 只传变化字段，防抖累加

  * 后端 `settingMerge()` 按服务器时间戳逐字段合并：`incoming.t >= existing.t` 则覆盖

  * 拉取：`cloudMergePull(key)` 解 envelope 为 `{ data, version }`

  * 多设备并发编辑不同字段不会互覆盖（A 改 habit\_1、B 改 habit\_2 → 两边都保留）

* 前端入口：`client/src/utils/cloudKV.js` + `client/src/pages/AnnualPlan.jsx` 的 `usePersistentState` hook

***

## AI 推送授权（git push 凭证受控签发，给 AI 助手看）

owner 已在工作台「设置 → AI 推送授权」托管 GitHub PAT（AES-GCM 加密存 `ethan_github_tokens`，仅 owner `1429000825@qq.com` 可管理）。当 owner 发来一段 30 分钟有效的 `grant code` 并要求 push 时：

```bash
# 1) 用 grant code 换 PAT（公开接口，code 本身即凭证）
PAT=$(curl -s -X POST https://ethan-workspace.pages.dev/api/github/issueGrant \
  -H 'Content-Type: application/json' \
  -d '{"grant_code":"<owner给的code>"}' | jq -r .pat)

# 2) 用临时 credential helper push（勿把 PAT 内嵌进 remote URL / 命令行，避免进日志）
git -c credential.helper='!f() { echo "username=isenworks"; echo "password='"$PAT"'"; }; f' push origin main
unset PAT

# 3) push 完成即结束；owner 会自行关闭授权开关作废 code。PAT 明文永不回显到对话/日志。
```

注意：code 30 分钟过期、关闭开关立即作废、同一窗口可多次签发（有审计）。若 403 则请 owner 重新开启授权并给新 code。建议 PAT 用 fine-grained 最小权限（单仓库 + Contents 读写）。

***

## 关键约定

### 代码风格

* 后端：ESM，`export async function handleXxx(env, body|q)`，handler 返回 `json(obj, status)`（见 `core.js`）

* 前端：JSX + Tailwind utility class，设计令牌复用 `tailwind.config.js`

* 所有 D1 表懒迁移：handler 首次访问时 `ensureXxxTable(env)`（CREATE TABLE IF NOT EXISTS + ALTER TABLE 补列）

* 用户隔离：所有表都有 `user_id` 列，查询必带 `WHERE user_id = uid(env)`

### 接口约定

* list 类接口兼容 GET（query）和 POST（body）：router 传 `qOrBody`（GET 用 query，POST 用 body）

* 公开接口白名单见 `functions/_lib/context.js` 的 `PUBLIC_PATHS`

* owner-only 接口：handler 内部校验 `currentUser.is_owner`

### 环境变量

* `env.DB` — D1 绑定（必填）

* `env.HMAC_SECRET` / `env.REGISTER_INVITE_CODE` / `env.BOOTSTRAP_OWNER_CODE` — Secrets

***

## 已知遗留待清理（非紧急，按需处理）

1. **`server/` 目录**：旧 Express 实现，148K，静态存在不影响线上部署（Cloudflare Pages 只看 `client/dist` 和 `functions/`）。可整体删除（用户已确认暂不删）。
2. **`supabase/migrations/*.sql`**：旧 PostgreSQL 迁移（PostgreSQL 方言，含 RLS policies / storage buckets），与 D1（SQLite）不通用。D1 的真正建表脚本是 `supabase/d1_create_tables.sql`。这些 migrations 文件无运行时价值，仅"考古"用途，可删除。

> 已修复：
> - `client/vite.config.js` dev 默认值（原指向 supabase，已改为 `pages-d1`）
> - 根 `vercel.json`（Vercel 配置，实际部署在 Cloudflare Pages，已删除）
> - 根 `package.json` 脚本（原 `dev`/`dev:server`/`start`/`install:all` 指向遗留 `server/`，已精简为 `dev`/`dev:client`/`build` 三条有效脚本，并移除 `concurrently` 依赖）

***

## 修改代码前的检查清单

* [ ] 改的是 `client/` 或 `functions/` 吗？改 `server/` / `supabase/migrations/` 不生效。

* [ ] 改后端接口逻辑？同步更新 `functions/_lib/handlers/*.js` 和（如新增接口）`functions/api/[[route]].js` 的路由分发。

* [ ] 改 DB schema？在对应 `ensureXxxTable(env)` 里加 `ALTER TABLE` 懒迁移（CREATE TABLE IF NOT EXISTS 不会改既有表）。

* [ ] 改前端 API 调用？统一走 `client/src/api/client.js` 的 `API.*` 方法，不要绕过直接 fetch（除了 cloudKV 内部）。

* [ ] 构建验证：`cd client && npm run build` 必须通过；后端 `node --check functions/**/*.js` 必须通过。

