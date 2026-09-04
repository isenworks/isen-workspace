import { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { API } from '../api/client.js';
import { IS_D1_BACKEND } from '../api/client.js';

/* =====================================================================
   登录页（方案 1：Apple HIG iCloud 风格）
   - 设计令牌完全复用 tailwind.config.js 的 brand / ink / accent
   - 输入框样式已在 index.css 统一 (.input = .form-input)，focus 蓝边+淡蓝光环
   - 按钮 .btn-primary 已在 index.css 重写：min-height 44px + flex 水平/垂直双居中
   ===================================================================== */

/* ---------- 小 SVG 图标（inline，避免引图标库；统一 20×20 stroke=2） ---------- */
const IconEye = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
const IconEyeOff = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
    <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c6.5 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
    <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3.5 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
    <line x1="2" y1="2" x2="22" y2="22" />
  </svg>
);
const IconAlert = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);
const IconInfo = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="16" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
);
const IconCheck = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
const IconSpinner = ({ className = 'w-5 h-5' }) => (
  <svg className={`${className} animate-spin`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <path d="M21 12a9 9 0 1 1-6.219-8.56" opacity="0.25" />
    <path d="M21 12a9 9 0 0 0-9-9" />
  </svg>
);

/* ---------- 字段级输入组件：标签 + 图标前缀 + 后缀按钮（如密码眼睛）+ 错误态 ---------- */
function Field({
  id,
  label,
  optional,
  error,
  hint,
  inputProps,   // 交给实际 <input /> 的所有属性（type/value/onChange/placeholder/autoComplete/.../style/className）
  suffix,       // 放在输入框右侧的附加元素（如眼睛按钮）
}) {
  const hasSuffix = !!suffix;
  // ====== 修复：之前 icon left: 14px + pl-11(44px) 对「🎫 票 / 📧 邮件」这类宽 SVG 来说安全间距不足，
  //        会出现用户截图里的"图标尾巴和 placeholder/输入文字重叠"。
  // 统一规范（固定图标位置、只把输入文字起点向右挪，符合之前 experience 的 best practice）：
  //   - 图标：绝对 left: 16px (left-4)，svg 20×20 → 最大视觉末端约 40px
  //   - 输入文字起点：pl-14 = 56px  → 至少留 16px 安全留白
  //   - 右 suffix 容器：right: 8px (right-2)，眼睛按钮 h-8 w-8(32px) → 末端约 40px
  //   - 输入文字右端：pr-12 = 48px  → 留 8px 安全间距
  // ✅ 用户要求：删除输入框左侧图标，彻底解决图标与 placeholder / 输入文字重叠问题
  const inputClassName = [
    'input',
    'pl-4',
    hasSuffix ? 'pr-12' : 'pr-4',
    inputProps?.className || '',
    error ? 'has-error' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="block text-[13px] font-medium text-ink-700">
          {label}
        </label>
        {optional && (
          <span className="inline-flex items-center rounded-full border border-ink-100 bg-ink-50 px-2 py-[2px] text-[10.5px] font-semibold text-ink-400">
            可选
          </span>
        )}
      </div>
      <div className="relative">
        <input
          {...inputProps}
          id={id}
          className={inputClassName}
          data-error={error ? '1' : undefined}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
        />
        {hasSuffix && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
            {suffix}
          </div>
        )}
      </div>
      {error && (
        <div id={`${id}-err`} className="flex items-start gap-1.5 text-[12px] text-accent-red">
          <IconAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {!error && hint && (
        <p id={`${id}-hint`} className="text-[12px] leading-relaxed text-ink-400">
          {hint}
        </p>
      )}
    </div>
  );
}

export default function Login() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState('login');          // login / register / bootstrap
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [bootstrapCode, setBootstrapCode] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [showBootstrap, setShowBootstrap] = useState(false);
  const [busy, setBusy] = useState(false);
  const [modes, setModes] = useState({ ownerBootstrap: false, openRegister: false });
  // 字段级错误（对应邮箱/密码/邀请码/口令…，有字段错就在输入框下方直接标红+图标+红边红环）
  const [fieldErr, setFieldErr] = useState({});
  // 全局错误 / 全局消息（跨字段的错误，如"邮箱或密码错误"）
  const [globalErr, setGlobalErr] = useState('');
  const [globalMsg, setGlobalMsg] = useState('');

  // D1 模式：首次进入探测 modes（是否开放注册、是否有 bootstrap code）
  useEffect(() => {
    if (!IS_D1_BACKEND) return;
    (async () => {
      try {
        const r = await fetch('/api/auth/login', {
          method: 'GET',
          headers: { 'X-Unlock-Token': localStorage.getItem('pw_unlock_token') || '' },
        }).then(x => x.json()).catch(() => null);
        if (r && r.modes) setModes(r.modes);
      } catch (_) {}
    })();
  }, []);

  const tabs = useMemo(() => {
    const base = [{ key: 'login', label: '登录' }];
    if (IS_D1_BACKEND) {
      if (modes.openRegister) base.push({ key: 'register', label: '注册' });
      if (modes.ownerBootstrap) base.push({ key: 'bootstrap', label: '初始化管理员' });
    } else {
      base.push({ key: 'register', label: '注册' });
    }
    return base;
  }, [modes.openRegister, modes.ownerBootstrap]);

  /* ---------- Tab 选中滑动条：根据当前 mode 在 tabs 中的索引计算位置 ---------- */
  const tabIdx = Math.max(0, tabs.findIndex(t => t.key === mode));
  const tabStyle = useMemo(() => {
    const count = Math.max(1, tabs.length);
    const idx = Math.min(tabIdx, count - 1);
    return {
      width: `${100 / count}%`,
      transform: `translateX(${idx * 100}%)`,
      transitionDuration: '260ms',
    };
  }, [tabs.length, tabIdx]);

  /* ---------- 表单高度平滑过渡（注册/初始化切换更高） ---------- */
  const formRef = useRef(null);
  const [formHeight, setFormHeight] = useState(null);
  useEffect(() => {
    if (!formRef.current) return;
    const h = formRef.current.scrollHeight;
    setFormHeight(h);
    // 下一帧再按真实高度稳定一下（避免首次渲染时内容未完全挂载）
    const t = requestAnimationFrame(() => {
      if (formRef.current) setFormHeight(formRef.current.scrollHeight);
    });
    return () => cancelAnimationFrame(t);
  }, [mode, modes.openRegister, modes.ownerBootstrap]);

  function setErrors(obj) {
    setFieldErr(prev => ({ ...prev, ...obj }));
  }
  function clearAll() {
    setFieldErr({});
    setGlobalErr('');
    setGlobalMsg('');
  }

  function validateBeforeSubmit() {
    clearAll();
    const errors = {};
    if (!email.trim()) errors.email = '请输入邮箱';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = '邮箱格式不正确';
    if (!password) errors.password = '请输入密码';
    else if (password.length < 6) errors.password = '密码至少 6 位';
    if (mode === 'register') {
      if (!inviteCode.trim()) errors.inviteCode = '请输入邀请码';
    }
    if (mode === 'bootstrap') {
      if (!bootstrapCode.trim()) errors.bootstrapCode = '请粘贴初始化口令';
    }
    setErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function submit(e) {
    e.preventDefault();
    if (!validateBeforeSubmit()) return;
    setBusy(true);
    try {
      if (IS_D1_BACKEND) {
        if (mode === 'login') {
          await login(email.trim().toLowerCase(), password);
          return;
        }
        if (mode === 'register') {
          if (!modes.openRegister) {
            setGlobalErr('管理员暂未开放注册');
            setBusy(false);
            return;
          }
          await register(email.trim().toLowerCase(), password, {
            username: username.trim() || email.trim().split('@')[0],
            inviteCode: inviteCode.trim().toUpperCase(),
          });
          return;
        }
        if (mode === 'bootstrap') {
          const res = await fetch('/api/auth/bootstrapOwner', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Unlock-Token': localStorage.getItem('pw_unlock_token') || '',
            },
            body: JSON.stringify({
              bootstrap_code: bootstrapCode.trim(),
              email: email.trim().toLowerCase(),
              username: username.trim() || email.trim().split('@')[0],
              password: String(password),
            }),
          });
          const data = await res.json().catch(() => null);
          if (!res.ok || data?.error) throw new Error((data?.error) || `请求失败 (${res.status})`);
          if (data?.token) localStorage.setItem('pw_unlock_token', String(data.token));
          if (data?.user) localStorage.setItem('pw_user', JSON.stringify(data.user));
          window.location.reload();
          return;
        }
        return;
      }

      // ====== Supabase 模式（保留） ======
      if (mode === 'login') {
        await login(email.trim().toLowerCase(), password);
        return;
      }
      if (!inviteCode.trim()) {
        setErrors({ inviteCode: '请输入邀请码' });
        setBusy(false);
        return;
      }
      const reserveResult = await API.inviteCodes.reserve(inviteCode.trim().toUpperCase());
      if (!reserveResult.codeId) {
        setErrors({ inviteCode: '邀请码无效或已被使用' });
        setBusy(false);
        return;
      }
      const codeId = reserveResult.codeId;
      const u = await register(email.trim().toLowerCase(), password, {
        username: username.trim() || email.trim().split('@')[0],
      });
      await API.inviteCodes.link(codeId);
      if (!u) {
        setGlobalMsg('注册成功！请登录。');
        setMode('login');
      }
    } catch (e) {
      // 常见登录错误映射到字段级，避免"全屏幕一条红"
      const msg = e.message || '操作失败';
      if (mode === 'login' && (msg.includes('邮箱或密码') || msg.includes('AUTH_FAIL') || msg.includes('401') || msg.includes('邮箱') && msg.includes('密码'))) {
        setErrors({ email: '邮箱或密码不正确', password: ' ' });
      } else if (msg.includes('账号已被禁用')) {
        setGlobalErr('该账号已被禁用，请联系管理员。');
      } else if (mode === 'register' && msg.includes('邀请码')) {
        setErrors({ inviteCode: msg });
      } else if (mode === 'bootstrap' && msg.includes('owner 账号已存在')) {
        setGlobalErr('管理员账号已初始化，无需再执行。');
      } else if (mode === 'bootstrap' && msg.includes('bootstrap_code') && msg.includes('不匹配')) {
        setErrors({ bootstrapCode: '初始化口令不匹配' });
      } else {
        setGlobalErr(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  /* ---------- 动态按钮文案 ---------- */
  const btnLabel = busy ? (
    <>
      <IconSpinner className="w-[18px] h-[18px]" />
      <span>处理中...</span>
    </>
  ) : (
    <span>{mode === 'login' ? '登 录' : mode === 'register' ? '注 册' : '创建管理员账号'}</span>
  );

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-brand-50/50 font-sans">
      {/* ====== 背景：两个超大柔光渐变光斑（方案 1 · iCloud 风格） ====== */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full bg-brand-400/40 blur-[120px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-52 -right-48 h-[620px] w-[620px] rounded-full bg-accent-purple-500/20 blur-[140px]"
      />

      {/* ====== 主体 ====== */}
      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-10">
        <div className="w-full max-w-[448px]">
          {/* Brand */}
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 inline-flex h-[72px] w-[72px] items-center justify-center rounded-[22px] bg-gradient-to-br from-brand-400 via-brand-500 to-brand-700 text-white shadow-[0_14px_34px_rgba(0,122,255,0.35),0_2px_6px_rgba(0,122,255,0.15)]">
              <span
                aria-hidden="true"
                className="text-[30px] leading-none"
                style={{ fontFamily: '-apple-system, SF Pro Display, system-ui', fontWeight: 700 }}
              >
                ⌘
              </span>
            </div>
            <h1 className="text-[30px] font-bold leading-tight tracking-tight text-ink-900">
              个人工作台
            </h1>
            <p className="mt-1.5 text-[15px] leading-relaxed text-ink-600">
              日程 · 任务 · 习惯 · 复盘，一站式管理你的每一天
            </p>
          </div>

          {/* Card */}
          <div className="card px-10 py-8 sm:px-11 sm:py-9">
            {tabs.length > 1 && (
              <div
                role="tablist"
                aria-label="身份操作"
                className="relative mb-7 grid rounded-full bg-ink-50 p-1 text-[14px]"
                style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
              >
                {/* 选中滑块：绝对定位白胶囊，transform 滑过去 */}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-1 rounded-full bg-white shadow-[0_1px_2px_rgba(15,31,28,0.06),0_2px_8px_rgba(15,31,28,0.08)]"
                  style={{
                    ...tabStyle,
                    transitionTimingFunction: 'cubic-bezier(.2,.8,.2,1)',
                    transitionProperty: 'transform, width',
                  }}
                />
                {tabs.map(t => (
                  <button
                    key={t.key}
                    role="tab"
                    type="button"
                    aria-selected={mode === t.key}
                    onClick={() => { setMode(t.key); clearAll(); }}
                    className={`relative z-[1] flex items-center justify-center rounded-full py-2 font-medium transition-colors duration-150 select-none ${
                      mode === t.key ? 'text-brand-700' : 'text-ink-500 hover:text-ink-700'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}

            {/* 高度平滑过渡包装。
                 ⚠️  注意：此处不用 overflow:hidden，避免 input:focus 时的外发光
                 蓝色阴影在卡片左右两侧被"切平"（就是用户截图里看到的左右两边被切割） */}
            <div
              style={{
                height: formHeight ? `${formHeight}px` : 'auto',
                transition: 'height 300ms cubic-bezier(.2,.8,.2,1)',
                overflow: 'visible',
              }}
            >
              <form
                ref={formRef}
                onSubmit={submit}
                className="space-y-5"
                noValidate
                aria-live="polite"
              >
                <Field
                  id="login-email"
                  label="邮箱"
                  error={fieldErr.email}
                  inputProps={{
                    type: 'email',
                    autoComplete: 'email',
                    autoFocus: true,
                    value: email,
                    onChange: e => setEmail(e.target.value),
                    placeholder: 'you@example.com',
                  }}
                />

                <Field
                  id="login-password"
                  label="密码"
                  error={fieldErr.password && fieldErr.password.trim() ? fieldErr.password : ''}
                  inputProps={{
                    type: showPwd ? 'text' : 'password',
                    autoComplete: mode === 'login' ? 'current-password' : 'new-password',
                    value: password,
                    onChange: e => setPassword(e.target.value),
                    placeholder: '至少 6 位',
                  }}
                  suffix={
                    <button
                      type="button"
                      onClick={() => setShowPwd(v => !v)}
                      aria-label={showPwd ? '隐藏密码' : '显示密码'}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-400 transition hover:bg-ink-50 hover:text-ink-600 active:text-brand-600"
                      tabIndex={-1}
                    >
                      {showPwd ? <IconEyeOff className="h-[18px] w-[18px]" /> : <IconEye className="h-[18px] w-[18px]" />}
                    </button>
                  }
                />

                {mode === 'register' && (
                  <>
                    <Field
                      id="reg-username"
                      label="昵称"
                      optional
                      inputProps={{
                        type: 'text',
                        maxLength: 20,
                        value: username,
                        onChange: e => setUsername(e.target.value),
                        placeholder: '留空则使用邮箱前缀',
                      }}
                    />
                    <Field
                      id="reg-invite"
                      label="邀请码"
                      error={fieldErr.inviteCode}
                      inputProps={{
                        type: 'text',
                        maxLength: 32,
                        spellCheck: false,
                        autoCapitalize: 'characters',
                        value: inviteCode,
                        onChange: e => setInviteCode(e.target.value.toUpperCase()),
                        placeholder: '向管理员申请',
                      }}
                    />
                  </>
                )}

                {mode === 'bootstrap' && (
                  <>
                    <Field
                      id="boot-username"
                      label="昵称"
                      optional
                      inputProps={{
                        type: 'text',
                        maxLength: 20,
                        value: username,
                        onChange: e => setUsername(e.target.value),
                        placeholder: '留空则使用邮箱前缀',
                      }}
                    />
                    <Field
                      id="boot-code"
                      label="管理员初始化口令（一次性）"
                      error={fieldErr.bootstrapCode}
                      hint="仅在用户表为空时可用。从 Cloudflare Pages → Secrets 粘贴初始化口令。"
                      inputProps={{
                        type: showBootstrap ? 'text' : 'password',
                        maxLength: 64,
                        autoComplete: 'one-time-code',
                        spellCheck: false,
                        value: bootstrapCode,
                        onChange: e => setBootstrapCode(e.target.value),
                        placeholder: '粘贴初始化口令',
                        style: { fontFamily: 'ui-monospace, SF Mono, Menlo, Consolas, monospace' },
                      }}
                      suffix={
                        <button
                          type="button"
                          onClick={() => setShowBootstrap(v => !v)}
                          aria-label={showBootstrap ? '隐藏口令' : '显示口令'}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-400 transition hover:bg-ink-50 hover:text-ink-600"
                          tabIndex={-1}
                        >
                          {showBootstrap ? <IconEyeOff className="h-[18px] w-[18px]" /> : <IconEye className="h-[18px] w-[18px]" />}
                        </button>
                      }
                    />
                  </>
                )}

                {/* 全局错误 / 成功 / 引导 */}
                {globalErr && (
                  <div className="flex items-start gap-2 rounded-xl border border-accent-red/20 bg-accent-red/5 px-3.5 py-2.5 text-[13.5px] leading-relaxed text-accent-red">
                    <IconAlert className="mt-[2px] shrink-0 text-accent-red" />
                    <span>{globalErr}</span>
                  </div>
                )}
                {globalMsg && (
                  <div className="flex items-start gap-2 rounded-xl border border-accent-green/25 bg-accent-green/5 px-3.5 py-2.5 text-[13.5px] leading-relaxed text-accent-green-700">
                    <IconCheck className="mt-[2px] shrink-0 text-accent-green" />
                    <span>{globalMsg}</span>
                  </div>
                )}

                {mode === 'login' && IS_D1_BACKEND && !modes.openRegister && !modes.ownerBootstrap && (
                  <div className="flex items-start gap-2 rounded-xl border border-brand-100 bg-brand-50/60 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink-600">
                    <IconInfo className="mt-[2px] shrink-0 text-brand-500" />
                    <span>
                      <b className="text-ink-800">还没有可用邀请码。</b>
                      {' '}管理员请先用邮箱登录，进入工作台 → 右上角 ⚙️ 设置 →{' '}
                      <b className="text-brand-700">邀请码管理</b> 生成邀请码后，注册入口会自动出现。
                    </span>
                  </div>
                )}

                {/* 唯一 CTA：按钮在卡片最下方水平居中（用户明确要求）。
                     去掉 w-full 撑满；用 mx-auto + 最小宽度 200px + 横向大 padding，
                     形成 iCloud 登录页那种"中等宽、居中"的主按钮比例。 */}
                <div className="mt-1 flex justify-center">
                  <button
                    type="submit"
                    disabled={busy}
                    className="btn-primary min-w-[200px] px-10"
                  >
                    {btnLabel}
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Footer（产品化文案 + 颜色升级到 ink-500 过 WCAG AA） */}
          <p className="mt-7 text-center text-[13px] leading-relaxed text-ink-500">
            © {new Date().getFullYear()} 个人工作台 · 多设备同步 · 你的数据安全存储于云端
          </p>
        </div>
      </div>
    </div>
  );
}
