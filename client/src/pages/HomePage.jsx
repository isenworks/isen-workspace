import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useEnergyHabits, usePersistentState } from '../components/annual/hooks.js';
import { API } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import HeroCropModal from '../components/HeroCropModal.jsx';
import { formatChineseDate, today as getToday, toISODate, addDaysISO, startOfWeek, endOfWeek } from '../utils/date.js';

/* ============ 小工具 ============ */
const pct = (v, t) => (Number(t) > 0 ? Math.max(0, Math.min(100, Math.round((Number(v) / Number(t)) * 100))) : 0);
const modColor = (k) => `var(--m-${k})`;
const modRgba = (k, a) => `rgba(var(--m-${k}-rgb),${a})`;

/* Hero 渐变预设：Apple 系统色 · 相邻色相，中段不脏 */
const HERO_GRADIENTS = {
  A: { name: '晴空',   css: 'linear-gradient(135deg, #007AFF 0%, #5AC8FA 100%)', shadow: 'rgba(0,122,255,0.28)' },
  B: { name: '晨曦',   css: 'linear-gradient(135deg, #5856D6 0%, #007AFF 100%)', shadow: 'rgba(88,86,214,0.28)' },
  C: { name: '碧波',   css: 'linear-gradient(135deg, #00C7BE 0%, #007AFF 100%)', shadow: 'rgba(0,122,255,0.24)' },
  D: { name: '朝霞',   css: 'linear-gradient(135deg, #FF9500 0%, #FF6B35 100%)', shadow: 'rgba(255,149,0,0.28)' },
  E: { name: '薰衣草', css: 'linear-gradient(135deg, #AF52DE 0%, #5856D6 100%)', shadow: 'rgba(175,82,222,0.28)' },
};

/* ===== Hero 背景多图轮播（localStorage + 云端 KV） =====
 * 数据形态 v3：{ type: 'gradient'|'images', value: 渐变key, images: [{id, src, crop}], interval: 轮播秒(0=关), shuffle }
 *   · src  = 压缩原图（≤2048px / ≤75KB，保留完整取景余量，重新编辑零质量损失）
 *   · crop = 归一化取景参数 {sx,sy,sw,sh}；展示用 CSS background-size/position 从原图实时裁剪铺满
 * 兼容 v2 {images:[{id,url}]}（已裁 3:1 结果图）与 v1 {type:'image',value} → 读取时按等效 cover 取景自动迁移
 * 存储预算：≤15 张 × ≤75KB/张（base64 后 ≈1.5MB），守住 D1 单行 2MB 与 localStorage 配额 */
const HERO_IMG_MAX = 15;
const HERO_ASPECT = 8;   // 选区/展示宽高比，= Hero 卡片实际尺寸（主列 1128px / 高约 141px）
const HERO_INTERVALS = [['关', 0], ['10s', 10], ['30s', 30], ['60s', 60]];
const newHeroImgId = () => `hero_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
// 取景参数规整（防 NaN / 越界）
function normCrop(c) {
  if (!c || !(c.sw > 0) || !(c.sh > 0)) return null;
  return {
    sx: Math.min(Math.max(0, c.sx || 0), 1),
    sy: Math.min(Math.max(0, c.sy || 0), 1),
    sw: Math.min(1, c.sw),
    sh: Math.min(1, c.sh),
  };
}
// 宽高比 sr 的整图在 HERO_ASPECT 容器中 cover 居中显示的等效取景（旧数据迁移用）
function coverCrop(sr) {
  if (HERO_ASPECT >= sr) return { sx: 0, sy: (1 - sr / HERO_ASPECT) / 2, sw: 1, sh: sr / HERO_ASPECT };
  return { sx: (1 - HERO_ASPECT / sr) / 2, sy: 0, sw: HERO_ASPECT / sr, sh: 1 };
}
function normalizeHeroBg(v) {
  const out = {
    type: 'gradient',
    value: HERO_GRADIENTS[v?.value] ? v.value : 'A',
    images: [],
    interval: HERO_INTERVALS.some(([, s]) => s === v?.interval) ? v.interval : 10,
    shuffle: !!v?.shuffle,
  };
  const pushImg = (im) => {
    if (typeof im?.src === 'string' && im.src) {
      out.images.push({ id: im.id || newHeroImgId(), src: im.src, crop: normCrop(im.crop) || coverCrop(3) });
    } else if (typeof im?.url === 'string' && im.url) {
      // v2 已裁 3:1 结果图：等效 cover 迁移（src 沿用，重编辑仍可在 8:1 框内重取景）
      out.images.push({ id: im.id || newHeroImgId(), src: im.url, crop: coverCrop(3) });
    }
  };
  if (Array.isArray(v?.images)) v.images.forEach(pushImg);
  // v1 单图形态迁移
  if (v?.type === 'image' && typeof v.value === 'string' && v.value.startsWith('data:')) pushImg({ url: v.value });
  if (out.images.length > HERO_IMG_MAX) out.images = out.images.slice(0, HERO_IMG_MAX);
  if (v?.type === 'images' && out.images.length > 0) out.type = 'images';
  return out;
}
/* 原图 + 取景参数 → CSS 裁剪铺满样式（百分比相对容器，天然响应式）
 *   size   = 100/sw% × 100/sh%（裁剪区恰好铺满容器；选区比例=容器比例保证不变形）
 *   pos    = sx/(1-sw)% × sy/(1-sh)%（把裁剪区左上角对齐容器原点） */
function heroCropBg(im, withShade = true) {
  const c = im.crop || coverCrop(3);
  const sw = Math.min(c.sw, 0.9995), sh = Math.min(c.sh, 0.9995);   // 防除零
  const px = (c.sx / (1 - sw)) * 100, py = (c.sy / (1 - sh)) * 100;
  return {
    backgroundImage: `${withShade ? 'linear-gradient(135deg, rgba(0,0,0,0.38), rgba(0,0,0,0.12)), ' : ''}url(${im.src})`,
    backgroundSize: `${withShade ? 'cover, ' : ''}${100 / sw}% ${100 / sh}%`,
    backgroundPosition: `${withShade ? 'center, ' : ''}${px}% ${py}%`,
    backgroundRepeat: 'no-repeat',
  };
}

/* 卡片头：模块色竖条 + 标题 + 右侧查看更多 */
function CardHead({ moduleKey, title, sub, onClick, more = '查看' }) {
  const color = moduleKey ? modColor(moduleKey) : 'var(--s-main)';
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="w-[5px] h-[18px] rounded-full flex-shrink-0" style={{ background: color }} />
        <span className="text-[15px] font-bold text-ink-900 truncate">{title}</span>
        {sub ? <span className="text-[11px] text-ink-400 flex-shrink-0">{sub}</span> : null}
      </div>
      {onClick ? (
        <button
          onClick={onClick}
          className="text-[11px] font-semibold flex-shrink-0 px-2 py-1 rounded-md transition hover:brightness-105 active:scale-95"
          style={{ color, background: moduleKey ? modRgba(moduleKey, 0.08) : 'rgba(var(--s-rgb),0.06)' }}
        >{more} →</button>
      ) : null}
    </div>
  );
}

/* 细进度条 */
function Bar({ value, color = 'var(--s-main)', h = '5px' }) {
  return (
    <div className="w-full rounded-full overflow-hidden" style={{ height: h, background: 'rgba(120,120,128,0.12)' }}>
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${value}%`, background: color }} />
    </div>
  );
}

/* 完成率圆环（今日聚焦）· 80px 小环，统计文字在环下方 */
function Ring({ value, done, total, color = 'var(--s-main)' }) {
  const R = 31, C = 2 * Math.PI * R;
  return (
    <div className="flex flex-col items-center flex-shrink-0">
      <div className="relative w-[80px] h-[80px]">
        <svg width="80" height="80" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r={R} fill="none" stroke="rgba(120,120,128,0.12)" strokeWidth="7" />
          <circle cx="40" cy="40" r={R} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={C * (1 - value / 100)} transform="rotate(-90 40 40)"
            style={{ transition: 'stroke-dashoffset .6s cubic-bezier(.2,.8,.2,1)' }} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[17px] font-extrabold text-ink-900 leading-none tabular-nums">{value}%</span>
        </div>
      </div>
      <span className="text-[9.5px] text-ink-400 mt-1.5 tabular-nums">{done}/{total} 完成</span>
    </div>
  );
}

/* ============ 主页 ============ */
export default function HomePage({ user, onNav, syncSignal = 0, onNewSchedule, onQuickCapture, onOpenSummary }) {
  const todayStr = getToday();
  const weekStart = useMemo(() => startOfWeek(new Date()), [todayStr]);
  const weekStartStr = toISODate(weekStart);
  const weekEndStr = toISODate(endOfWeek(new Date()));

  /* ===== 签名（localStorage + 云端 KV 持久化，点击编辑） ===== */
  const [signature, setSignature] = usePersistentState('home_signature_v1', () => '');
  const [sigEditing, setSigEditing] = useState(false);

  /* ===== Hero 背景（渐变预设 / 多图轮播，localStorage + 云端 KV） ===== */
  // null = 本地/云端暂无该数据（不写回，避免默认值覆盖旧设备数据）；读取后统一 normalize 迁移
  const [heroBgRaw, setHeroBgRaw] = usePersistentState('home_hero_bg_v1', () => null);
  const heroBg = useMemo(() => normalizeHeroBg(heroBgRaw), [heroBgRaw]);
  const setHeroBg = useCallback((updater) => {
    setHeroBgRaw(prev => normalizeHeroBg(
      typeof updater === 'function' ? updater(normalizeHeroBg(prev)) : updater
    ));
  }, [setHeroBgRaw]);
  const heroImgs = heroBg.images;

  const [heroEditOpen, setHeroEditOpen] = useState(false);
  const heroRef = useRef(null);
  const [curIdx, setCurIdx] = useState(0);   // 当前展示的图片下标（轮播/手动切换）
  const toast = useToast();

  // 裁剪弹窗数据源：新上传为 File，笔图标重新编辑为 data URL（cropReplaceId 非空 = 原位更新取景）
  const [cropSrc, setCropSrc] = useState(null);
  const [cropCrop, setCropCrop] = useState(null);      // 重新编辑时恢复的上次取景参数
  const [cropReplaceId, setCropReplaceId] = useState(null);
  const filePickRef = useRef(null);
  const [confirmDelId, setConfirmDelId] = useState(null);   // 待二次确认删除的图片 id（卡片上方小弹窗）

  const heroStyle = useMemo(() => {
    if (heroBg.type === 'images') {
      // 打底晕影：图片层交叉淡入时透出，任意切换不闪白
      return { background: 'linear-gradient(135deg, rgba(0,0,0,0.38), rgba(0,0,0,0.12))', boxShadow: '0 8px 28px rgba(0,0,0,0.18)' };
    }
    const g = HERO_GRADIENTS[heroBg.value] || HERO_GRADIENTS.A;
    return { background: g.css, boxShadow: `0 8px 28px ${g.shadow}` };
  }, [heroBg]);

  // 多图轮播：interval 秒切换（随机模式不重复当前张）
  useEffect(() => {
    if (heroBg.type !== 'images' || heroImgs.length < 2 || !heroBg.interval) return;
    const t = setInterval(() => {
      setCurIdx(i => {
        if (heroBg.shuffle && heroImgs.length > 1) {
          let n = i;
          while (n === i) n = Math.floor(Math.random() * heroImgs.length);
          return n;
        }
        return (i + 1) % heroImgs.length;
      });
    }, heroBg.interval * 1000);
    return () => clearInterval(t);
  }, [heroBg.type, heroBg.interval, heroBg.shuffle, heroImgs.length]);

  // 图片数量变化（删除）后索引钳回范围
  useEffect(() => { setCurIdx(i => Math.min(i, Math.max(0, heroImgs.length - 1))); }, [heroImgs.length]);

  // 点击外部关闭浮层
  useEffect(() => {
    if (!heroEditOpen) return;
    function onDocClick(e) {
      if (heroRef.current && !heroRef.current.contains(e.target)) setHeroEditOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [heroEditOpen]);

  /* ---- Hero 图片管理（增 / 删 / 换 / 排序 / 选用） ---- */
  function applyHeroGradient(k) { setHeroBg(prev => ({ ...prev, type: 'gradient', value: k })); }
  function selectHeroImg(i) {
    setCurIdx(i);
    setHeroBg(prev => ({ ...prev, type: 'images' }));
  }
  function moveHeroImg(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= heroImgs.length) return;
    setHeroBg(prev => {
      const images = [...prev.images];
      [images[i], images[j]] = [images[j], images[i]];
      return { ...prev, images };
    });
  }
  function removeHeroImg(id) {
    setHeroBg(prev => {
      const images = prev.images.filter(x => x.id !== id);
      return { ...prev, images, type: images.length > 0 ? 'images' : 'gradient' };
    });
  }
  // 删除：点 × 弹出卡片上方的二次确认小弹窗，确认后才删除
  function onHeroImgDel(e, id) {
    e.stopPropagation();
    setConfirmDelId(v => (v === id ? null : id));
  }
  function confirmHeroImgDel() {
    removeHeroImg(confirmDelId);
    setConfirmDelId(null);
    toast.success('已删除背景图');
  }

  // 添加图片：触发文件选择（仅追加；修改已有图走笔图标重新裁剪）
  function pickHeroImage() {
    if (heroImgs.length >= HERO_IMG_MAX) {
      toast.warn(`最多 ${HERO_IMG_MAX} 张背景图，请先删除部分图片`);
      return;
    }
    filePickRef.current?.click();
  }
  function handleHeroFilePick(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!f.type.startsWith('image/')) { toast.error('请选择图片文件'); return; }
    if (f.size > 20 * 1024 * 1024) { toast.error('图片过大（超过 20MB），请先压缩后再上传'); return; }
    setCropReplaceId(null);
    setCropCrop(null);
    setCropSrc(f);
  }
  // 笔图标：基于原图重新取景（恢复上次取景参数，只改 crop 不动原图）
  function editHeroImage(id) {
    const im = heroImgs.find(x => x.id === id);
    if (!im) return;
    setCropReplaceId(id);
    setCropCrop(im.crop || null);
    setCropSrc(im.src);
  }
  // 裁剪确认：{ srcBlob(新图才有), crop } → 原位更新取景（保留 id/顺序/src）或追加新图
  function handleCropConfirm({ srcBlob, crop }) {
    const done = (srcDataUrl) => {
      const rid = cropReplaceId;
      const idx = rid ? heroImgs.findIndex(x => x.id === rid) : heroImgs.length;
      if (rid && idx < 0) { setCropSrc(null); setCropReplaceId(null); setCropCrop(null); return; }   // 目标图已被删除
      setHeroBg(prev => {
        const images = [...prev.images];
        if (rid) images[idx] = { ...images[idx], crop };
        else if (images.length < HERO_IMG_MAX) images.push({ id: newHeroImgId(), src: srcDataUrl, crop });
        return { ...prev, type: 'images', images };
      });
      setCurIdx(idx);
      setCropSrc(null);
      setCropReplaceId(null);
      setCropCrop(null);
      if (rid) {
        toast.success('已更新取景');            // 编辑流程：保留面板，便于继续管理
      } else {
        setHeroEditOpen(false);                 // 新增流程：收起面板展示效果
        toast.success('已添加背景图');
        // 云端单行 2MB 预算告警（data URL 较二进制约 1.33 倍膨胀）
        const total = heroImgs.reduce((s, x) => s + (x.src?.length || 0), 0) + (srcDataUrl?.length || 0);
        if (total > 1900000) toast.warn('背景图总量接近云端同步上限，建议删除不常用的图片');
      }
    };
    if (srcBlob) {
      const reader = new FileReader();
      reader.onload = e => done(e.target.result);
      reader.readAsDataURL(srcBlob);
    } else done(null);
  }

  /* ===== 日程数据：本周一 ~ 未来 30 天（今日事项 / 本周关键 / 生日 / 后续事项） ===== */
  const [sched, setSched] = useState(null);
  useEffect(() => {
    let alive = true;
    API.schedules.list({ from: weekStartStr, to: addDaysISO(todayStr, 30) })
      .then(r => { if (alive) setSched(r?.schedules || []); })
      .catch(() => { if (alive) setSched([]); });
    return () => { alive = false; };
  }, [weekStartStr, todayStr, syncSignal]);

  /* ===== 精力习惯（周打卡矩阵） ===== */
  const { realHabits } = useEnergyHabits();
  const habits = realHabits || [];
  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysISO(weekStartStr, i)), [weekStartStr]);

  /* ===== 知力 / 能力 / 工作（与年度规划共享同一份 localStorage 数据） ===== */
  const [books] = usePersistentState('annual_books_v12', () => null);
  const [abilities] = usePersistentState('annual_abilities_v2', () => null);
  const [workGoals] = usePersistentState('annual_work', () => null);

  /* ===== 今日聚焦 ===== */
  const todayItems = useMemo(() => (sched || []).filter(s => s.date === todayStr), [sched, todayStr]);
  const todayDone = todayItems.filter(s => s.is_done).length;
  const todayPct = pct(todayDone, todayItems.length);
  const nextTodo = useMemo(() => todayItems
    .filter(s => !s.is_done)
    .sort((a, b) => String(a.start_time || '99:99').localeCompare(String(b.start_time || '99:99')))[0] || null,
    [todayItems]);

  /* ===== 本周重点：关键事项（is_key） ===== */
  const weekKeys = useMemo(() => (sched || [])
    .filter(s => s.is_key && s.date <= weekEndStr)
    .sort((a, b) => (a.is_done ? 1 : 0) - (b.is_done ? 1 : 0) || String(a.date).localeCompare(String(b.date))),
    [sched, weekEndStr]);
  const weekKeyDone = weekKeys.filter(s => s.is_done).length;

  /* 勾选/取消关键事项（乐观更新 + API 持久化，与 KeyTasks 同款含重复事项 occurrence 处理） */
  const toggleWeekKey = async (s) => {
    const nextDone = !s.is_done;
    setSched(prev => (prev || []).map(x => x.id === s.id ? { ...x, is_done: nextDone } : x));
    try {
      await API.schedules.update(s.id, { is_done: nextDone, ...(s._repeat_occurrence ? { occurrence_date: s.date } : {}) });
    } catch {
      setSched(prev => (prev || []).map(x => x.id === s.id ? { ...x, is_done: !nextDone } : x));
    }
  };

  /* ===== 即将到来：本周重点展示 3 条之后的后续事项（本周剩余关键 + 未来 30 天关键 + 生日），每条带具体日期 ===== */
  const followUpList = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const shownIds = new Set(weekKeys.slice(0, 3).map(s => s.id));
    const list = [];
    // 生日（未来一年内最近的下一次，含农历标记）
    (sched || []).filter(s => {
      const t = String(s.title || '');
      return t.includes('生日') && (s.repeat_rule === 'yearly' || s.repeat_rule === 'lunar-yearly' || t.startsWith('🎂'));
    }).forEach(b => {
      const name = String(b.title || '').replace(/^🎂/, '').replace(/生日$/, '').trim() || b.title;
      const parts = String(b.date || '').split('-');
      const mo = parts[1] ? parseInt(parts[1], 10) : 0;
      const day = parts[2] ? parseInt(parts[2], 10) : 0;
      if (!mo || !day) return;
      let next = new Date(today.getFullYear(), mo - 1, day); next.setHours(0, 0, 0, 0);
      if (next < today) next = new Date(today.getFullYear() + 1, mo - 1, day);
      const daysLeft = Math.round((next - today) / 86400000);
      list.push({ key: `bd-${b.id}`, type: 'birthday', title: `${name}的生日`, date: toISODate(next), isLunar: b.repeat_rule === 'lunar-yearly', daysLeft });
    });
    // 关键事项：本周重点未展示的本周剩余 + 本周之后 30 天内
    (sched || []).filter(s => s.is_key && s.date > todayStr && s.date <= addDaysISO(todayStr, 30) && !shownIds.has(s.id))
      .forEach(s => {
        const daysLeft = Math.round((new Date(`${s.date}T00:00:00`) - today) / 86400000);
        list.push({ key: `uk-${s.id}`, type: 'key', title: s.title, date: s.date, daysLeft });
      });
    return list.sort((a, b) => a.daysLeft - b.daysLeft);
  }, [sched, todayStr, weekKeys]);

  /* ===== 精力：本周打卡统计 ===== */
  const habitRows = habits.slice(0, 2);
  const weekDoneCnt = useMemo(() => habitRows.reduce((sum, h) => {
    const set = new Set(h.allDates || []);
    return sum + weekDates.filter(d => set.has(d)).length;
  }, 0), [habits, weekDates]);

  /* ===== 知力：在读（1 本主推 + 多本列表） ===== */
  const reading = useMemo(() => (books || []).filter(b => b.st === 'reading').sort((a, b) => (b.pct || 0) - (a.pct || 0)), [books]);
  const booksDone = (books || []).filter(b => b.st === 'done').length;

  /* ===== 能力：各能力里程碑平均进度 ===== */
  const abilRows = useMemo(() => (abilities || []).slice(0, 2).map(a => {
    const ms = a.mstones || [];
    const avg = ms.length > 0 ? Math.round(ms.reduce((s, m) => s + (m.pct || 0), 0) / ms.length) : 0;
    const doing = ms.filter(m => m.st === 'doing').length;
    return { id: a.id, title: a.title, avg, doing, total: ms.length };
  }), [abilities]);

  /* ===== 工作：进行中目标的 KR 平均进度 ===== */
  const workRows = useMemo(() => (workGoals || [])
    .filter(o => !o.archived && o.status !== 'shelf' && o.mode !== 'event')
    .slice(0, 2).map(o => {
      const krs = o.krs || [];
      const avg = krs.length > 0 ? Math.round(krs.reduce((s, k) => s + pct(k.v, k.tgt), 0) / krs.length) : 0;
      return { id: o.id, title: o.title, label: o.label, avg, krCnt: krs.length };
    }), [workGoals]);

  const hour = new Date().getHours();
  const greeting = hour < 6 ? '夜深了' : hour < 11 ? '早上好' : hour < 13 ? '中午好' : hour < 18 ? '下午好' : hour < 22 ? '晚上好' : '夜深了';
  const name = String(user?.username || user?.name || user?.nickname || '').trim() || '朋友';

  return (
    <div className="flex-1 min-w-0 flex flex-col gap-3">
      <div className="w-full max-w-[1320px] mx-auto flex flex-col gap-3">

        {/* ========== Hero：渐变 / 多图轮播通栏（问候 + 签名），全页唯一彩色锚点 ========== */}
        <div ref={heroRef} className="relative">
        <div
          className="relative overflow-hidden px-8 py-10 flex items-center justify-between gap-6 flex-wrap rounded-[18px] group"
          style={heroStyle}
          onContextMenu={e => { e.preventDefault(); setHeroEditOpen(v => !v); }}
        >
          {/* 背景图片层 ×N（交叉淡入；按 crop 从原图实时裁剪铺满，渐变模式时全透明） */}
          {heroImgs.map((im, i) => (
            <div
              key={im.id}
              className="absolute inset-0 pointer-events-none transition-opacity duration-700"
              style={{
                ...heroCropBg(im),
                opacity: heroBg.type === 'images' && i === curIdx ? 1 : 0,
              }}
            />
          ))}

          {/* 编辑按钮（hover / 右键显示） */}
          <button
            onClick={() => setHeroEditOpen(v => !v)}
            className="absolute top-3 right-3 w-7 h-7 rounded-full grid place-items-center transition-opacity opacity-0 group-hover:opacity-100 z-10"
            style={{ background: 'rgba(255,255,255,0.22)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
            title="编辑 Hero 背景（也可右键）"
          >
            <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          </button>

          {/* 轮播指示点（多图时显示，点击直达；hover Hero 时增强可见性） */}
          {heroBg.type === 'images' && heroImgs.length > 1 && (
            <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity duration-300">
              {heroImgs.map((im, i) => (
                <button
                  key={im.id}
                  onClick={() => setCurIdx(i)}
                  className="w-[7px] h-[7px] rounded-full transition-all duration-300 hover:scale-125"
                  style={{
                    background: i === curIdx ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.35)',
                    boxShadow: i === curIdx ? '0 0 0 3px rgba(255,255,255,0.18)' : 'none',
                  }}
                  aria-label={`显示第 ${i + 1} 张背景`}
                />
              ))}
            </div>
          )}

          {/* 装饰光斑（纯视觉，不响应交互） */}
          <div className="absolute -right-14 -top-28 w-[280px] h-[280px] rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.16) 0%, transparent 68%)' }} />
          <div className="absolute right-40 -bottom-24 w-[190px] h-[190px] rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.09) 0%, transparent 70%)' }} />

          {/* 左：问候 */}
          <div className="relative flex flex-col gap-1.5 min-w-0">
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-[28px] font-extrabold text-white tracking-tight">{greeting}，{name}</span>
              <span className="text-[13px] font-medium" style={{ color: 'rgba(255,255,255,0.72)' }}>{formatChineseDate(new Date())}</span>
            </div>
            <span className="text-[13.5px] font-medium" style={{ color: 'rgba(255,255,255,0.85)' }}>
              {hour < 12 ? '新的一天，从最重要的事开始' : hour < 18 ? '午后时光，保持节奏' : '回顾一下今天的收获吧'}
            </span>
          </div>

          {/* 右：签名 / 座右铭（点击编辑，回车/失焦保存） */}
          <div className="relative flex items-center gap-2 min-w-0 max-w-[440px]">
            {sigEditing ? (
              <input
                autoFocus
                defaultValue={signature}
                placeholder="写一句自己的话…"
                maxLength={60}
                className="flex-1 min-w-0 px-3.5 py-2 rounded-xl text-[14px] font-medium outline-none text-white placeholder:text-[rgba(255,255,255,0.55)]"
                style={{ background: 'rgba(255,255,255,0.16)', border: '1px solid rgba(255,255,255,0.45)' }}
                onBlur={e => { setSignature(e.target.value.trim()); setSigEditing(false); }}
                onKeyDown={e => {
                  if (e.key === 'Enter') { setSignature(e.currentTarget.value.trim()); setSigEditing(false); }
                  if (e.key === 'Escape') setSigEditing(false);
                }}
              />
            ) : (
              <button
                onClick={() => setSigEditing(true)}
                className="group flex items-center gap-2 min-w-0 px-3 py-2 rounded-xl transition hover:bg-[rgba(255,255,255,0.12)]"
                title="点击编辑签名"
              >
                {signature ? (
                  <>
                    <span className="text-[30px] font-serif leading-none flex-shrink-0 -mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>“</span>
                    <span className="text-[14.5px] italic font-medium truncate" style={{ color: 'rgba(255,255,255,0.92)' }}>{signature}</span>
                    <span className="text-[30px] font-serif leading-none flex-shrink-0 -mt-3 self-start" style={{ color: 'rgba(255,255,255,0.4)' }}>”</span>
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5 flex-shrink-0 transition" style={{ color: 'rgba(255,255,255,0.55)' }} fill="currentColor" viewBox="0 0 24 24"><path d="M6.17 17.53c.24 0 .45-.09.62-.26l11.4-11.4c.15-.15.23-.34.23-.54 0-.42-.32-.73-.74-.73-.2 0-.39.07-.53.21L5.77 15.65c-.18.18-.27.4-.3.66l-.13 1.21c-.02.2.12.34.31.34l.52-.02c.26-.02.5-.11.65-.28l-.05-.03zm-1.79 3.15c-.18 0-.31-.13-.29-.32l.21-2.06c.04-.42.23-.81.53-1.11l10.6-10.6c.51-.53 1.22-.53 1.71-.05l.95.95c.48.49.5 1.2-.02 1.72L7.9 19.36c-.3.3-.68.48-1.11.53l-2.03.21-.28.02-.4-.44z"/></svg>
                    <span className="text-[13.5px] italic truncate" style={{ color: 'rgba(255,255,255,0.55)' }}>点击写一句签名 / 座右铭</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* 编辑浮层：置于 overflow-hidden Hero 之外避免被裁剪，锚定外层 wrapper 右上（glass-card 风格） */}
        {heroEditOpen && (
          <div className="absolute top-full right-0 mt-2 z-20 p-4 w-[320px] rounded-[18px] popover-enter" style={{ background: 'rgba(255,255,255,0.88)', backdropFilter: 'saturate(180%) blur(20px)', WebkitBackdropFilter: 'saturate(180%) blur(20px)', border: '1px solid rgba(255,255,255,0.6)', boxShadow: '0 0 0 1px rgba(0,0,0,0.04), 0 8px 32px rgba(0,0,0,0.12)', maxHeight: 'min(600px, 72vh)', overflowY: 'auto', overscrollBehavior: 'contain' }} onClick={e => e.stopPropagation()} onMouseDown={() => { if (confirmDelId) setConfirmDelId(null); }}>
            <div className="text-[14px] font-bold text-ink-900 mb-3">Hero 背景</div>

            {/* 预设渐变 */}
            <div className="text-[11px] font-semibold text-ink-400 uppercase tracking-wide mb-2">预设渐变</div>
            <div className="grid grid-cols-5 gap-2 mb-4">
              {Object.entries(HERO_GRADIENTS).map(([k, g]) => {
                const isSel = heroBg.type === 'gradient' && heroBg.value === k;
                return (
                  <button
                    key={k}
                    onClick={() => applyHeroGradient(k)}
                    className="aspect-[4/3] rounded-lg transition hover:scale-105"
                    style={{
                      background: g.css,
                      outline: isSel ? '2px solid var(--s-main)' : '2px solid transparent',
                      outlineOffset: '2px',
                    }}
                    title={g.name}
                  />
                );
              })}
            </div>

            {/* 背景图片：网格管理（选用 / 排序 / 更换 / 删除 / 添加） */}
            <div className="flex items-baseline justify-between mb-2">
              <div className="text-[11px] font-semibold text-ink-400 uppercase tracking-wide">背景图片</div>
              <span className="text-[10.5px] text-ink-300 tabular-nums">{heroImgs.length}/{HERO_IMG_MAX}</span>
            </div>
            <div className="flex flex-col gap-2">
              {heroImgs.map((im, i) => {
                const isCur = heroBg.type === 'images' && i === curIdx;
                const isConfirmDel = confirmDelId === im.id;
                return (
                  <div key={im.id} className="relative">
                    <div
                      className="group/img rounded-lg overflow-hidden cursor-pointer transition"
                      style={{ ...heroCropBg(im, false), aspectRatio: `${HERO_ASPECT} / 1`, outline: isCur ? '2px solid var(--s-main)' : '1px solid rgba(0,0,0,0.08)', outlineOffset: isCur ? '1px' : '-1px' }}
                      onClick={() => selectHeroImg(i)}
                      title={isCur ? '正在展示' : '点击展示这张'}
                    >
                      <span className="absolute top-1 left-1 px-1 rounded text-[9px] font-bold tabular-nums" style={{ background: 'rgba(0,0,0,0.4)', color: 'rgba(255,255,255,0.9)' }}>{i + 1}</span>
                      {/* hover 工具条：排序 / 重新裁剪 / 删除 */}
                      <div className="absolute inset-0 flex items-center justify-center gap-1 opacity-0 group-hover/img:opacity-100 transition-opacity" style={{ background: 'rgba(0,0,0,0.5)' }}>
                        <button title="前移" disabled={i === 0} onClick={e => { e.stopPropagation(); moveHeroImg(i, -1); }} className="w-[22px] h-[22px] rounded-md grid place-items-center text-white/85 hover:text-white hover:bg-white/25 transition disabled:opacity-25 disabled:pointer-events-none">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
                        </button>
                        <button title="后移" disabled={i === heroImgs.length - 1} onClick={e => { e.stopPropagation(); moveHeroImg(i, 1); }} className="w-[22px] h-[22px] rounded-md grid place-items-center text-white/85 hover:text-white hover:bg-white/25 transition disabled:opacity-25 disabled:pointer-events-none">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
                        </button>
                        <button title="调整裁剪" onClick={e => { e.stopPropagation(); editHeroImage(im.id); }} className="w-[22px] h-[22px] rounded-md grid place-items-center text-white/85 hover:text-white hover:bg-white/25 transition">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                        </button>
                        <button title="删除" onClick={e => onHeroImgDel(e, im.id)} className={`w-[22px] h-[22px] rounded-md grid place-items-center transition ${isConfirmDel ? 'bg-[#FF3B30] text-white' : 'text-white/85 hover:text-white hover:bg-[#FF3B30]/80'}`}>
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                      </div>
                    </div>
                    {/* 删除二次确认小弹窗（卡片上方锚定，点面板其他区域关闭） */}
                    {isConfirmDel && (
                      <div
                        className="absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 z-30 popover-enter"
                        style={{ background: '#fff', borderRadius: 10, padding: '8px 10px 9px', boxShadow: '0 6px 24px rgba(0,0,0,0.18)', width: 'max-content' }}
                        onMouseDown={e => e.stopPropagation()}
                        onClick={e => e.stopPropagation()}
                      >
                        <div className="text-[11px] font-semibold text-ink-600 whitespace-nowrap">删除这张背景图？</div>
                        <div className="flex gap-1.5 mt-2">
                          <button onClick={() => setConfirmDelId(null)} className="h-[22px] px-2.5 rounded-md text-[11px] font-semibold transition hover:brightness-95" style={{ background: 'rgba(120,120,128,0.12)', color: 'var(--ink-600, #3a3a3c)' }}>取消</button>
                          <button onClick={confirmHeroImgDel} className="h-[22px] px-2.5 rounded-md text-[11px] font-semibold text-white transition hover:brightness-110" style={{ background: '#FF3B30' }}>删除</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {/* 添加条 */}
              {heroImgs.length < HERO_IMG_MAX && (
                <button
                  onClick={() => pickHeroImage()}
                  className="relative rounded-lg border border-dashed border-[rgba(120,120,128,0.35)] bg-[rgba(120,120,128,0.04)] h-[40px] flex flex-row items-center justify-center gap-1.5 transition hover:border-[rgba(var(--s-rgb),0.55)] hover:bg-[rgba(var(--s-rgb),0.05)] active:scale-[0.99]"
                >
                  <svg className="w-3.5 h-3.5 text-ink-300" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  <span className="text-[11px] font-medium text-ink-400">添加图片</span>
                </button>
              )}
            </div>
            {heroImgs.length === 0 && (
              <div className="text-[11px] text-ink-300 mt-1.5">最多 {HERO_IMG_MAX} 张轮播 · 按 Hero 卡片实际比例取景，可随时重新调整</div>
            )}

            {/* 轮播设置（≥2 张时显示） */}
            {heroImgs.length > 1 && (
              <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(60,60,67,0.1)' }}>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-ink-400 uppercase tracking-wide">轮播</span>
                  <div className="tab-group compact">
                    {HERO_INTERVALS.map(([label, v]) => (
                      <button key={v} className={heroBg.interval === v ? 'active' : ''} onClick={() => setHeroBg(prev => ({ ...prev, interval: v }))}>{label}</button>
                    ))}
                  </div>
                </div>
                <label className="flex items-center gap-2 mt-2.5 cursor-pointer select-none">
                  <input type="checkbox" className="cb-square" checked={heroBg.shuffle} onChange={e => setHeroBg(prev => ({ ...prev, shuffle: e.target.checked }))} />
                  <span className="text-[12px] text-ink-600">随机顺序切换</span>
                </label>
              </div>
            )}
          </div>
        )}
        </div>

        {/* ========== 时间层：今日聚焦 / 本周重点 / 即将到来（3 等分，md 起 3 列） ========== */}
        <div className="grid grid-cols-1 md:grid-cols-3 auto-rows-fr gap-4">

          {/* ---- 今日聚焦 ---- */}
          <div className="glass-card p-4 flex flex-col">
            <CardHead title="今日聚焦" sub={todayStr.slice(5).replace('-', '/')} onClick={() => onNav?.('plan')} />
            <div className="flex items-center gap-4 flex-1">
              <Ring value={todayPct} done={todayDone} total={todayItems.length} />
              <div className="flex-1 min-w-0 flex flex-col gap-2">
                {nextTodo ? (
                  <button
                    onClick={() => onNav?.('plan')}
                    className="text-left w-full rounded-xl px-3 py-2.5 transition hover:bg-[rgba(120,120,128,0.06)]"
                    title="跳转今日计划"
                  >
                    <div className="text-[10px] font-bold text-ink-400 mb-0.5 tracking-wide">下一个待办</div>
                    <div className="text-[13.5px] font-semibold text-ink-800 truncate">{nextTodo.title || '（无标题）'}</div>
                    <div className="text-[11px] text-ink-400 mt-0.5 tabular-nums">
                      {nextTodo.start_time ? `${nextTodo.start_time}${nextTodo.end_time ? ` - ${nextTodo.end_time}` : ''}` : '全天'}
                    </div>
                  </button>
                ) : (
                  <div className="px-1">
                    <div className="text-[13.5px] font-semibold text-ink-800">
                      {todayItems.length === 0 ? '今天还没有安排' : '今日事项已全部完成'}
                    </div>
                    <div className="text-[11.5px] text-ink-400 mt-1">
                      {todayItems.length === 0 ? '点右上角「查看」去安排今天' : '享受这份清爽，或复盘一下今天 ✦'}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ---- 本周重点 ---- */}
          <div className="glass-card p-4 flex flex-col">
            <CardHead title="本周重点" sub="关键事项" onClick={() => onNav?.('plan')} />
            <div className="flex-1 flex flex-col gap-2 min-h-0">
              <div className="flex items-baseline justify-between mb-0.5">
                <span className="text-[11px] text-ink-400">本周进度</span>
                <span className="text-[12px] font-bold text-ink-800 tabular-nums">{weekKeyDone}/{weekKeys.length}</span>
              </div>
              <Bar value={pct(weekKeyDone, weekKeys.length)} />
              <div className="flex-1 flex flex-col justify-start gap-1.5 mt-1">
                {weekKeys.slice(0, 3).map(s => (
                  <div key={s.id} className="flex items-center gap-2 group">
                    <button
                      onClick={e => { e.stopPropagation(); toggleWeekKey(s); }}
                      className="w-[15px] h-[15px] rounded-[4.5px] border flex-shrink-0 grid place-items-center transition hover:border-[rgba(var(--s-rgb),0.6)] cursor-pointer"
                      title={s.is_done ? '取消完成' : '标记完成'}
                      style={{
                        background: s.is_done ? 'var(--s-main)' : 'transparent',
                        borderColor: s.is_done ? 'var(--s-main)' : 'rgba(120,120,128,0.35)'
                      }}
                    >
                      {s.is_done ? (
                        <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      ) : null}
                    </button>
                    <button onClick={() => onNav?.('plan')} className="flex items-center gap-2 text-left min-w-0 flex-1">
                      <span className={`text-[12.5px] truncate ${s.is_done ? 'text-ink-300 line-through' : 'text-ink-700'}`}>{s.title}</span>
                      <span className="text-[10px] text-ink-300 flex-shrink-0 ml-auto tabular-nums">{String(s.date).slice(5).replace('-', '/')}</span>
                    </button>
                  </div>
                ))}
                {weekKeys.length === 0 && (
                  <div className="text-[12.5px] text-ink-400 text-center py-3">本周暂无关键事项</div>
                )}
                {weekKeys.length > 3 && (
                  <button onClick={() => onNav?.('plan')} className="text-[11px] text-ink-400 hover:text-ink-600 text-left">还有 {weekKeys.length - 3} 项…</button>
                )}
              </div>
            </div>
          </div>

          {/* ---- 即将到来：本周重点之后的后续事项（每条带具体日期 + 剩余天数） ---- */}
          <div className="glass-card p-4 flex flex-col">
            <CardHead title="即将到来" sub="本周后续" onClick={() => onNav?.('plan')} />
            <div className="flex-1 flex flex-col gap-1.5 justify-start">
              {followUpList.slice(0, 4).map(u => {
                const weekday = '日一二三四五六'[new Date(`${u.date}T00:00:00`).getDay()];
                return (
                  <button
                    key={u.key}
                    onClick={() => u.type === 'birthday' ? onNav?.('annual', 'life') : onNav?.('plan')}
                    className={`flex items-center gap-2.5 text-left rounded-lg px-2 py-1.5 -mx-2 transition ${u.type === 'birthday' ? 'hover:bg-[rgba(175,82,222,0.06)]' : 'hover:bg-[rgba(var(--s-rgb),0.05)]'}`}
                  >
                    {u.type === 'birthday' ? (
                      <span className="w-[30px] h-[30px] rounded-[9px] grid place-items-center flex-shrink-0" style={{ background: 'rgba(var(--m-life-rgb),0.1)' }}>
                        <svg className="w-4 h-4" style={{ color: 'var(--m-life)' }} fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M12 2l2.4 5.4L20 9l-4 4 .9 6.3L12 16.5 7.1 19.3 8 13 4 9l5.6-1.6L12 2z"/></svg>
                      </span>
                    ) : (
                      <span className="w-[30px] h-[30px] rounded-[9px] grid place-items-center flex-shrink-0 text-[10px] font-bold" style={{ background: 'rgba(var(--s-rgb),0.08)', color: 'var(--s-main)' }}>
                        {String(u.date).slice(8)}
                      </span>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-[12.5px] font-semibold text-ink-800 truncate">{u.title}</div>
                      <div className="text-[10.5px] text-ink-400">
                        {`${String(u.date).slice(5).replace('-', '/')} ${weekday}${u.type === 'birthday' ? (u.isLunar ? ' · 农历生日' : ' · 生日') : ' · 关键事项'}`}
                      </div>
                    </div>
                    <span className="text-[16px] font-extrabold tabular-nums flex-shrink-0" style={{ color: u.type === 'birthday' ? 'var(--m-life)' : 'var(--s-main)' }}>{u.daysLeft}</span>
                  </button>
                );
              })}
              {followUpList.length === 0 && (
                <div className="text-[12.5px] text-ink-400 text-center py-3">本周关键事项之后暂无安排</div>
              )}
              {followUpList.length > 4 && (
                <button onClick={() => onNav?.('plan')} className="text-[11px] text-ink-400 hover:text-ink-600 text-left px-2">还有 {followUpList.length - 4} 项…</button>
              )}
            </div>
          </div>
        </div>

        {/* ========== 成长层：精力 / 知力 / 能力 / 工作（4 等分，xl 起 4 列） ========== */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 auto-rows-fr gap-4">

          {/* ---- 精力：周打卡矩阵 ---- */}
          <div className="glass-card p-3 flex flex-col">
            <CardHead moduleKey="energy" title="精力" sub="本周打卡" onClick={() => onNav?.('annual', 'energy')} />
            {habitRows.length > 0 ? (
              <>
                <div className="hp-hb">
                  {habitRows.map(h => {
                    const set = new Set(h.allDates || []);
                    return (
                      <div key={h.id} className="hp-hrow">
                        <span className="hp-hname" title={h.label}>{h.label}</span>
                        <div className="hp-hcells">
                          {weekDates.map(d => {
                            const isTdy = d === todayStr;
                            const isFut = d > todayStr;
                            const ok = set.has(d);
                            return (
                              <span key={d} className={`hp-hcell${ok ? ' ok' : ''}${isFut ? ' fut' : ''}${isTdy ? ' tdy' : ''}`}>
                                {parseInt(d.slice(8), 10)}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between mt-2 pt-2" style={{ borderTop: '1px solid rgba(120,120,128,0.1)' }}>
                  <span className="text-[11px] text-ink-400">本周已打卡</span>
                  <span className="text-[12px] font-bold tabular-nums" style={{ color: 'var(--m-energy)' }}>
                    {weekDoneCnt}/{habitRows.length * 7} 次
                  </span>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-1.5 py-4">
                <span className="text-[12.5px] font-semibold text-ink-600">还没有精力类习惯</span>
                <span className="text-[11px] text-ink-400">去习惯面板创建睡眠、运动等打卡</span>
              </div>
            )}
          </div>

          {/* ---- 知力：在读 ---- */}
          <div className="glass-card p-3 flex flex-col">
            <CardHead moduleKey="cognition" title="知力" sub={reading.length > 0 ? `在读 ${reading.length} 本` : `已读 ${booksDone} 本`} onClick={() => onNav?.('annual', 'cognition')} />
            <div className="flex-1 flex flex-col justify-start min-h-0">
              {reading.length > 0 && (
                <div className="rounded-xl p-2.5" style={{ background: 'rgba(var(--m-cognition-rgb),0.06)' }}>
                  <div className="flex items-baseline justify-between gap-2 mb-1">
                    <span className="text-[14px] font-bold text-ink-900 truncate">《{reading[0].t}》</span>
                    <span className="text-[12px] font-extrabold tabular-nums flex-shrink-0" style={{ color: 'var(--m-cognition)' }}>{reading[0].pct || 0}%</span>
                  </div>
                  <div className="text-[11px] text-ink-400 mb-2 truncate">{reading[0].author || '佚名'} · {reading[0].cat || '未分类'}</div>
                  <Bar value={reading[0].pct || 0} color="var(--m-cognition)" />
                  {reading.length > 1 && (
                    <div className="mt-1.5 pt-1.5 flex flex-col gap-1" style={{ borderTop: '1px dashed rgba(0,122,255,0.18)' }}>
                      {reading.slice(1, 3).map(b => (
                        <div key={b.id} className="flex items-center gap-2">
                          <span className="text-[11.5px] text-ink-600 truncate flex-1">{b.t}</span>
                          <div className="w-[54px] flex-shrink-0"><Bar value={b.pct || 0} color="var(--m-cognition)" h="4px" /></div>
                          <span className="text-[10px] text-ink-400 tabular-nums w-[27px] text-right">{b.pct || 0}%</span>
                        </div>
                      ))}
                      {reading.length > 3 && <div className="text-[10.5px] text-ink-300">等 {reading.length - 3} 本在读…</div>}
                    </div>
                  )}
                </div>
              )}
              {reading.length === 0 && (
                <div className="flex flex-col items-center justify-center gap-1.5 py-4">
                  <span className="text-[12.5px] font-semibold text-ink-600">当前没有在读的书</span>
                  <span className="text-[11px] text-ink-400">{booksDone > 0 ? `今年已读完 ${booksDone} 本` : '去书架添加一本开始阅读'}</span>
                </div>
              )}
            </div>
          </div>

          {/* ---- 能力 ---- */}
          <div className="glass-card p-3 flex flex-col">
            <CardHead moduleKey="ability" title="能力" sub="里程碑进度" onClick={() => onNav?.('annual', 'ability')} />
            <div className="flex-1 flex flex-col justify-start gap-2">
              {abilRows.map(a => (
                <div key={a.id}>
                  <div className="flex items-baseline justify-between gap-2 mb-1">
                    <span className="text-[12.5px] font-semibold text-ink-800 truncate">{a.title}</span>
                    <span className="text-[11.5px] font-bold tabular-nums flex-shrink-0" style={{ color: 'var(--m-ability)' }}>{a.avg}%</span>
                  </div>
                  <Bar value={a.avg} color="var(--m-ability)" />
                  <div className="text-[10px] text-ink-300 mt-1">{a.doing > 0 ? `${a.doing} 个里程碑进行中` : `共 ${a.total} 个里程碑`}</div>
                </div>
              ))}
              {abilRows.length === 0 && (
                <div className="flex flex-col items-center justify-center gap-1.5 py-4">
                  <span className="text-[12.5px] font-semibold text-ink-600">还没有能力目标</span>
                  <span className="text-[11px] text-ink-400">去能力页添加第一个成长目标</span>
                </div>
              )}
            </div>
          </div>

          {/* ---- 工作 ---- */}
          <div className="glass-card p-3 flex flex-col">
            <CardHead moduleKey="work" title="工作" sub="目标进度" onClick={() => onNav?.('annual', 'work')} />
            <div className="flex-1 flex flex-col justify-start gap-2">
              {workRows.map(o => (
                <div key={o.id}>
                  <div className="flex items-baseline justify-between gap-2 mb-1">
                    <span className="flex items-center gap-1.5 min-w-0">
                      {o.label && (
                        <span className="text-[9px] font-bold px-1.5 py-[1px] rounded flex-shrink-0" style={{ background: 'rgba(var(--m-work-rgb),0.1)', color: 'var(--m-work)' }}>{o.label}</span>
                      )}
                      <span className="text-[12.5px] font-semibold text-ink-800 truncate">{o.title}</span>
                    </span>
                    <span className="text-[11.5px] font-bold tabular-nums flex-shrink-0" style={{ color: 'var(--m-work)' }}>{o.avg}%</span>
                  </div>
                  <Bar value={o.avg} color="var(--m-work)" />
                </div>
              ))}
              {workRows.length === 0 && (
                <div className="flex flex-col items-center justify-center gap-1.5 py-4">
                  <span className="text-[12.5px] font-semibold text-ink-600">暂无进行中的工作目标</span>
                  <span className="text-[11px] text-ink-400">去工作页建立你的 OKR</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ========== 快捷操作横条：计划 → 捕获 → 复盘（首页行动枢纽，填充底部空间） ========== */}
        <div className="glass-card px-5 py-3 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <button
            onClick={() => onNewSchedule?.()}
            className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-left transition hover:bg-[rgba(120,120,128,0.06)] active:scale-[0.98]"
          >
            <span className="w-10 h-10 rounded-[10px] grid place-items-center flex-shrink-0" style={{ background: 'rgba(var(--s-rgb),0.08)' }}>
              <svg className="w-[19px] h-[19px]" style={{ color: 'var(--s-main)' }} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="3"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="12" y1="14" x2="12" y2="18"/><line x1="10" y1="16" x2="14" y2="16"/></svg>
            </span>
            <span className="flex flex-col min-w-0">
              <span className="text-[13.5px] font-semibold text-ink-800">新建事项</span>
              <span className="text-[11px] text-ink-400">日程 / 待办 · 默认今天</span>
            </span>
          </button>
          <button
            onClick={() => onQuickCapture?.()}
            className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-left transition hover:bg-[rgba(120,120,128,0.06)] active:scale-[0.98]"
          >
            <span className="w-10 h-10 rounded-[10px] grid place-items-center flex-shrink-0" style={{ background: 'rgba(var(--m-energy-rgb),0.08)' }}>
              <svg className="w-[19px] h-[19px]" style={{ color: 'var(--m-energy)' }} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
            </span>
            <span className="flex flex-col min-w-0">
              <span className="flex items-center gap-1.5 text-[13.5px] font-semibold text-ink-800">
                快速记录
                <span className="text-[9px] font-bold leading-none px-1.5 py-[2px] rounded border border-ink-300 text-ink-400" title="键盘快捷键">N</span>
              </span>
              <span className="text-[11px] text-ink-400">收进收集箱 · 稍后分派</span>
            </span>
          </button>
          <button
            onClick={() => onOpenSummary?.()}
            className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-left transition hover:bg-[rgba(120,120,128,0.06)] active:scale-[0.98]"
          >
            <span className="w-10 h-10 rounded-[10px] grid place-items-center flex-shrink-0" style={{ background: 'rgba(var(--m-cognition-rgb),0.08)' }}>
              <svg className="w-[19px] h-[19px]" style={{ color: 'var(--m-cognition)' }} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            </span>
            <span className="flex flex-col min-w-0">
              <span className="text-[13.5px] font-semibold text-ink-800">今日总结</span>
              <span className="text-[11px] text-ink-400">复盘今天 · 四套模板</span>
            </span>
          </button>
        </div>
      </div>

      {/* Hero 背景图上传入口（仅添加；重新编辑已有图走卡片上的笔图标） */}
      <input ref={filePickRef} type="file" accept="image/*" className="hidden" onChange={handleHeroFilePick} />

      {/* Hero 图片裁剪弹窗（新上传裁剪 / 笔图标基于原图重新取景共用） */}
      <HeroCropModal
        open={!!cropSrc}
        source={cropSrc}
        ratio={HERO_ASPECT}
        initialCrop={cropCrop}
        onClose={() => { setCropSrc(null); setCropReplaceId(null); setCropCrop(null); }}
        onConfirm={handleCropConfirm}
      />
    </div>
  );
}
