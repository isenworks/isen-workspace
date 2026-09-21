import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useEnergyHabits, usePersistentState } from '../components/annual/hooks.js';
import { API } from '../api/client.js';
import { store } from '../utils/store.js';
import { useToast } from '../context/ToastContext.jsx';
import HeroCropModal from '../components/HeroCropModal.jsx';
import { formatChineseDate, today as getToday, toISODate, addDaysISO, startOfWeek, endOfWeek } from '../utils/date.js';
import { catToModule } from '../utils/categoryMapping.js';
import { CategoryIcon } from '../components/annual/ui.jsx';
import lunarLib from '../vendor/lunar.js';
import PTag from '../components/PTag.jsx';

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

/* ===== Hero 背景多图轮播（R2 对象存储 + 本地元数据同步） =====
 * 数据形态 v5：{ type: 'gradient'|'images', value: 渐变key, images: [{id, out, src, outKey?, srcKey?, crop}], interval, shuffle }
 *   · out    = 成品图 URL（/api/hero/img/... 或旧版 base64），展示直接用，字节全部花在可见像素上
 *   · src    = 原图 URL（/api/hero/img/... 或旧版 base64），供重新取景
 *   · outKey / srcKey = R2 存储 key（删除时用；旧版 base64 图没有）
 *   · crop   = 归一化取景参数 {sx,sy,sw,sh}
 * 兼容 v4 {images:[{id,out,src?,crop}]} / v3 {images:[{id,src,crop}]} / v2 {images:[{id,url}]} / v1
 *   → 读取时自动迁移：有 out 优先用 out，无 out 回退到 src+crop 的 CSS 裁剪
 * R2 模式下张数上限放宽到 50，单张成品图 120KB，原图 4K 高质量保留（重新取景无损可调） */
const HERO_IMG_MAX = 50;
const HERO_OUT_MAX_BYTES = 120 * 1024;   // 成品图体积预算（JPEG）
const HERO_OUT_WIDTH = 1440;              // 成品图输出宽度（px，2x 屏也清晰）
const HERO_ASPECT = 8;                    // 选区/展示宽高比，= Hero 卡片实际尺寸（主列 1128px / 高约 141px）
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
    // v5/v4: 有 out 成品图 → 优先用（展示画质更高）
    if (typeof im?.out === 'string' && im.out) {
      out.images.push({
        id: im.id || newHeroImgId(),
        out: im.out,
        src: typeof im.src === 'string' && im.src ? im.src : undefined,
        outKey: typeof im.outKey === 'string' && im.outKey ? im.outKey : undefined,
        srcKey: typeof im.srcKey === 'string' && im.srcKey ? im.srcKey : undefined,
        crop: normCrop(im.crop) || coverCrop(3),
      });
    } else if (typeof im?.src === 'string' && im.src) {
      // v3: 原图 + crop → 保留原图，展示走 CSS 裁剪（旧数据自动兼容）
      out.images.push({
        id: im.id || newHeroImgId(),
        src: im.src,
        crop: normCrop(im.crop) || coverCrop(3),
        outKey: typeof im.outKey === 'string' && im.outKey ? im.outKey : undefined,
        srcKey: typeof im.srcKey === 'string' && im.srcKey ? im.srcKey : undefined,
      });
    } else if (typeof im?.url === 'string' && im.url) {
      // v2 已裁 3:1 结果图：等效 cover 迁移
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
/* Hero 背景样式生成：
 *   · 有 out（v4 成品图）：直接 background-size: cover，像素 100% 有效，画质更高
 *   · 无 out（v3 及以前）：原图 + crop → CSS 按比例裁剪铺满（向后兼容）
 *   渐变遮罩统一叠加在图片上 */
function heroCropBg(im, withShade = true) {
  const shade = withShade ? 'linear-gradient(135deg, rgba(0,0,0,0.38), rgba(0,0,0,0.12)), ' : '';
  if (im.out) {
    return {
      backgroundImage: `${shade}url(${im.out})`,
      backgroundSize: `${withShade ? 'cover, ' : ''}cover`,
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
    };
  }
  const c = im.crop || coverCrop(3);
  const sw = Math.min(c.sw, 0.9995), sh = Math.min(c.sh, 0.9995);   // 防除零
  const px = (c.sx / (1 - sw)) * 100, py = (c.sy / (1 - sh)) * 100;
  return {
    backgroundImage: `${shade}url(${im.src})`,
    backgroundSize: `${withShade ? 'cover, ' : ''}${100 / sw}% ${100 / sh}%`,
    backgroundPosition: `${withShade ? 'center, ' : ''}${px}% ${py}%`,
    backgroundRepeat: 'no-repeat',
  };
}

/* 重要节日白名单：lunar 库 getFestivals 会带出全民国防教育日这类小众纪念日，首页只展示大众节日 */
const MAJOR_FESTIVALS = new Set(['元旦', '除夕', '春节', '元宵节', '情人节', '妇女节', '植树节', '清明节', '劳动节', '青年节', '母亲节', '儿童节', '父亲节', '端午节', '建党节', '建军节', '七夕节', '教师节', '中秋节', '国庆节', '重阳节', '万圣节', '感恩节', '圣诞节']);

/* 卡片头：模块色竖条 + 标题 + 右侧自定义动作位 + 查看入口（右上箭头） */
function CardHead({ moduleKey, title, sub, onClick, action }) {
  const color = moduleKey ? modColor(moduleKey) : 'var(--s-main)';
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="w-[5px] h-[18px] rounded-full flex-shrink-0" style={{ background: color }} />
        <span className="text-[15px] font-bold text-ink-900 truncate">{title}</span>
        {sub ? <span className="text-[11px] text-ink-400 flex-shrink-0">{sub}</span> : null}
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {action}
        {onClick ? (
          <button
            onClick={onClick}
            className="hp-more w-[26px] h-[26px] rounded-lg grid place-items-center flex-shrink-0 transition active:scale-95"
            style={{ color, background: moduleKey ? modRgba(moduleKey, 0.08) : 'rgba(var(--s-rgb),0.06)', '--hc': color }}
            title="查看"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17L17 7"/><path d="M8 7h9v9"/></svg>
          </button>
        ) : null}
      </div>
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

/* ============ 主页 ============ */
export default function HomePage({ user, onNav, syncSignal = 0, onNewSchedule, onQuickCapture, onOpenSummary, onEditSchedule, onEditBook }) {
  const todayStr = getToday();
  const weekStart = useMemo(() => startOfWeek(new Date()), [todayStr]);
  const weekStartStr = toISODate(weekStart);
  const weekEndStr = toISODate(endOfWeek(new Date()));
  /* 本周重点卡片：周切换偏移量（0 = 当前周，-1 = 上周，1 = 下周…） */
  const [weekOffset, setWeekOffset] = useState(0);
  const viewWeekStartStr = useMemo(() => addDaysISO(weekStartStr, weekOffset * 7), [weekStartStr, weekOffset]);
  const viewWeekEndStr = useMemo(() => addDaysISO(weekEndStr, weekOffset * 7), [weekEndStr, weekOffset]);

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
      // 零阴影渗出：仅 1px 发丝线，行间隙不再被 28px ambient 染深
      return { background: 'linear-gradient(135deg, rgba(0,0,0,0.38), rgba(0,0,0,0.12))', boxShadow: '0 0 0 1px rgba(0,0,0,0.06)' };
    }
    const g = HERO_GRADIENTS[heroBg.value] || HERO_GRADIENTS.A;
    return { background: g.css, boxShadow: '0 0 0 1px rgba(0,0,0,0.06)' };
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

  /* ---- Hero 图片管理（增 / 删 / 换 / 排序 / 选用 · R2 对象存储） ---- */
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
  // 删除：从 R2 移除 + 从状态移除；旧 base64 图直接删状态
  async function removeHeroImg(id) {
    const im = heroImgs.find(x => x.id === id);
    setHeroBg(prev => {
      const images = prev.images.filter(x => x.id !== id);
      return { ...prev, images, type: images.length > 0 ? 'images' : 'gradient' };
    });
    // 异步清理 R2（不阻塞 UI）
    if (im?.outKey) API.hero.remove(im.outKey).catch(() => {});
    if (im?.srcKey && im.srcKey !== im.outKey) API.hero.remove(im.srcKey).catch(() => {});
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
  // 笔图标：有原图 → 基于原图重新取景（R2 URL 则先 fetch 成 Blob）；无原图 → 直接选新图重新裁剪
  async function editHeroImage(id) {
    const im = heroImgs.find(x => x.id === id);
    if (!im) return;
    if (im.src) {
      setCropReplaceId(id);
      setCropCrop(im.crop || null);
      // R2 URL：先 fetch 成 Blob 再转 dataURL（跨域/缓存友好）
      if (im.src.startsWith('/api/hero/img/') || im.src.startsWith('http')) {
        try {
          const res = await fetch(im.src, { cache: 'force-cache' });
          const blob = await res.blob();
          const reader = new FileReader();
          reader.onload = e => setCropSrc(e.target.result);
          reader.readAsDataURL(blob);
        } catch {
          toast.error('加载原图失败，请重新上传');
          filePickRef.current?.click();
        }
      } else {
        // base64（旧数据）：直接用
        setCropSrc(im.src);
      }
    } else {
      // 无原图：重新选图上传
      setCropReplaceId(id);
      setCropCrop(null);
      filePickRef.current?.click();
    }
  }
  // 裁剪确认：{ outBlob, srcBlob, crop } → 上传 R2 → 保存 URL + key + crop
  async function handleCropConfirm({ outBlob, srcBlob, crop }) {
    const rid = cropReplaceId;
    const idx = rid ? heroImgs.findIndex(x => x.id === rid) : heroImgs.length;
    if (rid && idx < 0) { setCropSrc(null); setCropReplaceId(null); setCropCrop(null); return; }

    const id = rid || newHeroImgId();
    const isEdit = !!rid;
    const oldImg = isEdit ? heroImgs[idx] : null;

    try {
      // 并行上传成品图 + 原图到 R2
      const [outResult, srcResult] = await Promise.all([
        API.hero.upload(outBlob, { kind: 'out', id }),
        srcBlob ? API.hero.upload(srcBlob, { kind: 'src', id }) : Promise.resolve(null),
      ]);

      setHeroBg(prev => {
        const images = [...prev.images];
        if (isEdit) {
          // 编辑已有图：更新 out/src URL + key + crop
          const old = images[idx];
          images[idx] = {
            ...old,
            out: outResult.url,
            outKey: outResult.key,
            src: srcResult ? srcResult.url : old.src,
            srcKey: srcResult ? srcResult.key : old.srcKey,
            crop,
          };
          // 异步清理旧 R2 文件（key 变化时才删，避免误删同 id 的新文件）
          if (old.outKey && old.outKey !== outResult.key) {
            API.hero.remove(old.outKey).catch(() => {});
          }
          if (old.srcKey && srcResult && old.srcKey !== srcResult.key) {
            API.hero.remove(old.srcKey).catch(() => {});
          }
        } else if (images.length < HERO_IMG_MAX) {
          // 新图：存 URL + key + crop
          images.push({
            id,
            out: outResult.url,
            outKey: outResult.key,
            src: srcResult ? srcResult.url : undefined,
            srcKey: srcResult ? srcResult.key : undefined,
            crop,
          });
        }
        return { ...prev, type: 'images', images };
      });

      setCurIdx(Math.min(idx, heroImgs.length - (isEdit ? 1 : 0)));
      setCropSrc(null);
      setCropReplaceId(null);
      setCropCrop(null);
      if (isEdit) {
        toast.success('已更新裁剪');
      } else {
        setHeroEditOpen(false);
        toast.success('已添加背景图');
      }
    } catch (err) {
      toast.error(err.message || '上传失败');
    }
  }

  /* ===== 日程数据：本周一 ~ 未来 30 天（今日事项 / 本周关键 / 生日 / 后续事项） ===== */
  const [sched, setSched] = useState(null);
  useEffect(() => {
    let alive = true;
    const fetchFrom = weekOffset < 0 ? viewWeekStartStr : weekStartStr;
    API.schedules.list({ from: fetchFrom, to: addDaysISO(todayStr, 30) })
      .then(r => { if (alive) setSched(r?.schedules || []); })
      .catch(() => { if (alive) setSched([]); });
    return () => { alive = false; };
  }, [weekStartStr, todayStr, syncSignal, weekOffset, viewWeekStartStr]);

  /* ===== 跨组件同步：监听 schedule_saved / schedule_deleted 事件
       CalendarPage 在周月重点面板修改状态后广播，HomePage 实时更新本周重点卡 ===== */
  useEffect(() => {
    const unsub = store.subscribe((msg) => {
      if (!msg) return;
      if (msg.type === 'schedule_saved' && msg.schedule) {
        const s = msg.schedule;
        setSched(prev => {
          const idx = (prev || []).findIndex(x => String(x.id) === String(s.id));
          const updated = {
            ...s,
            is_done: !!s.is_done,
            is_goal: !!s.is_goal,
            is_failed: !!s.is_failed,
          };
          if (idx < 0) return [...(prev || []), updated];
          const copy = [...prev];
          copy[idx] = { ...copy[idx], ...updated };
          return copy;
        });
      } else if (msg.type === 'schedule_deleted' && msg.schedule?.id != null) {
        const delId = String(msg.schedule.id);
        setSched(prev => (prev || []).filter(x => String(x.id) !== delId));
      } else if (msg.type === 'reload') {
        // 全局 reload：重新拉取（与 syncSignal 触发同款路径）
        let alive = true;
        const rf = weekOffset < 0 ? viewWeekStartStr : weekStartStr;
        API.schedules.list({ from: rf, to: addDaysISO(todayStr, 30) })
          .then(r => { if (alive) setSched(r?.schedules || []); })
          .catch(() => {});
        return () => { alive = false; };
      }
    });
    return unsub;
  }, [weekStartStr, todayStr, weekOffset, viewWeekStartStr]);

  /* ===== 精力习惯（周打卡矩阵） ===== */
  const { realHabits, refresh: refreshEnergy } = useEnergyHabits();
  const habits = realHabits || [];
  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysISO(weekStartStr, i)), [weekStartStr]);

  /* ===== 精力格子打卡：乐观覆盖 + API 持久化（与今日计划/习惯面板同接口，切页重新拉取即同步） ===== */
  const [habitTweaks, setHabitTweaks] = useState({});
  const toggleHabitCell = async (h, d, ok) => {
    const next = !ok;
    const apply = v => setHabitTweaks(p => ({ ...p, [h.id]: { ...(p[h.id] || {}), [d]: v } }));
    apply(next);
    try {
      await API.habits.toggle(h.id, d, next ? 1 : 0);
      refreshEnergy(); // 后台重拉年度统计，用真实数据覆盖乐观 tweaks
    } catch { apply(ok); }
  };

  /* ===== 知力 / 能力 / 工作（与年度规划共享同一份 localStorage 数据） ===== */
  const [books] = usePersistentState('annual_books_v12', () => null);
  const [abilities] = usePersistentState('annual_abilities_v2', () => null);
  const [workGoals] = usePersistentState('annual_work', () => null);

  /* ===== 今日聚焦（排除 is_goal 目标事项：目标只归属本周重点/日历主线面板，不进当日列表与进度统计） ===== */
  const todayItems = useMemo(() => (sched || []).filter(s => s.date === todayStr && !s.is_goal), [sched, todayStr]);
  const todayDone = todayItems.filter(s => s.is_done).length;
  const todayPct = pct(todayDone, todayItems.length);
  /* 今日全部事项按时间升序（全天排最后） + 今日节日（与月历同源、白名单过滤） */
  const todaySorted = useMemo(() => [...todayItems]
    .sort((a, b) => String(a.start_time || '99:99').localeCompare(String(b.start_time || '99:99'))), [todayItems]);
  const todayFestivals = useMemo(() => {
    const [y, m, d] = todayStr.split('-').map(Number);
    const solar = lunarLib.Solar.fromYmd(y, m, d);
    return [...solar.getLunar().getFestivals(), ...solar.getFestivals()].filter(f => MAJOR_FESTIVALS.has(f));
  }, [todayStr]);

  /* ===== 本周重点：仅展示目标（is_goal），当前周含逾期未完成；其他周严格限定该周范围内 ===== */
  const weekKeys = useMemo(() => (sched || [])
    .filter(s => {
      if (!s.is_goal) return false;
      if (weekOffset === 0) return s.date <= viewWeekEndStr;
      return s.date >= viewWeekStartStr && s.date <= viewWeekEndStr;
    })
    .sort((a, b) => {
      const sa = a.is_done ? 2 : (a.is_failed ? 1 : 0);
      const sb = b.is_done ? 2 : (b.is_failed ? 1 : 0);
      return sa - sb || String(a.date).localeCompare(String(b.date));
    }),
    [sched, viewWeekStartStr, viewWeekEndStr, weekOffset]);
  const weekKeyDone = weekKeys.filter(s => s.is_done).length;
  const weekKeyFailed = weekKeys.filter(s => s.is_failed).length;

  /* 勾选/取消关键事项（乐观更新 + API 持久化，与 KeyTasks 同款含重复事项 occurrence 处理） */
  const toggleWeekKey = async (s) => {
    const nextDone = !s.is_done;
    setSched(prev => (prev || []).map(x => x.id === s.id ? { ...x, is_done: nextDone, is_failed: false } : x));
    try {
      const r = await API.schedules.update(s.id, { is_done: nextDone, is_failed: false, ...(s._repeat_occurrence ? { occurrence_date: s.date } : {}) });
      // 广播勾选结果：日历"周月重点"面板等挂载中的监听方实时同步状态
      const saved = r?.schedule || { ...s, is_done: nextDone, is_failed: false };
      saved.is_done = nextDone;
      saved.is_failed = false;
      store.broadcast({ type: 'schedule_saved', schedule: saved, action: 'update', category: saved.category });
    } catch {
      setSched(prev => (prev || []).map(x => x.id === s.id ? { ...x, is_done: !nextDone, is_failed: s.is_failed } : x));
    }
  };

  /* 右键标记目标事项为"未达成"（乐观更新 + API 持久化） */
  const markFailedWeekKey = async (s) => {
    const nextFailed = !s.is_failed;
    const nextDone = nextFailed ? false : s.done;
    setSched(prev => (prev || []).map(x => x.id === s.id ? { ...x, is_failed: nextFailed, is_done: nextDone } : x));
    try {
      const r = await API.schedules.update(s.id, { is_failed: nextFailed, is_done: nextDone });
      // 广播"未达成"标记结果：日历"周月重点"面板等挂载中的监听方实时同步状态
      const saved = r?.schedule || { ...s, is_failed: nextFailed, is_done: nextDone };
      saved.is_failed = nextFailed;
      saved.is_done = nextDone;
      store.broadcast({ type: 'schedule_saved', schedule: saved, action: 'update', category: saved.category });
    } catch {
      setSched(prev => (prev || []).map(x => x.id === s.id ? { ...x, is_failed: s.is_failed, is_done: s.is_done } : x));
    }
  };

  /* ===== 即将到来：今日之后的事项（日程 + 生日 + 节日，30 天内），按日期升序滚动查看 ===== */
  const followUpList = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const isBirthday = s => {
      const t = String(s.title || '');
      return t.includes('生日') && (s.repeat_rule === 'yearly' || s.repeat_rule === 'lunar-yearly' || t.startsWith('🎂'));
    };
    const list = [];
    // 生日（未来一年内最近的一次，须在今日之后）
    (sched || []).filter(isBirthday).forEach(b => {
      const name = String(b.title || '').replace(/^🎂/, '').replace(/生日$/, '').trim() || b.title;
      const parts = String(b.date || '').split('-');
      const mo = parts[1] ? parseInt(parts[1], 10) : 0;
      const day = parts[2] ? parseInt(parts[2], 10) : 0;
      if (!mo || !day) return;
      const cand = yy => new Date(yy, mo - 1, day);
      let next = cand(today.getFullYear());
      if (next <= today) next = cand(today.getFullYear() + 1);
      const daysLeft = Math.round((next - today) / 86400000);
      list.push({ key: `bd-${b.id}`, type: 'birthday', title: `${name}的生日`, date: toISODate(next), isLunar: b.repeat_rule === 'lunar-yearly', daysLeft });
    });
    // 日程（今日之后 30 天内，排除生日原事项与目标事项——目标归属"本周重点"卡，避免同屏重复）
    (sched || []).filter(s => s.date > todayStr && s.date <= addDaysISO(todayStr, 30) && !isBirthday(s) && !s.is_goal)
      .forEach(s => {
        const daysLeft = Math.round((new Date(`${s.date}T00:00:00`) - today) / 86400000);
        list.push({ key: `uk-${s.id}`, type: 'sched', category: s.category, title: s.title, date: s.date, daysLeft, priority: s.priority, s });
      });
    // 节日（今日之后 ~ 30 天内，农历 + 公历，与月历同源）
    for (let i = 1; i <= 30; i++) {
      const iso = addDaysISO(todayStr, i);
      const [y, m, d] = iso.split('-').map(Number);
      const solar = lunarLib.Solar.fromYmd(y, m, d);
      const fests = [...solar.getLunar().getFestivals(), ...solar.getFestivals()].filter(f => MAJOR_FESTIVALS.has(f));
      if (fests.length > 0) list.push({ key: `ft-${iso}`, type: 'festival', title: fests[0], date: iso, daysLeft: i });
    }
    return list.sort((a, b) => a.daysLeft - b.daysLeft || String(a.date).localeCompare(String(b.date)));
  }, [sched, todayStr]);

  /* ===== 精力：本周打卡统计 ===== */
  const habitRows = habits.slice(0, 4);

  /* ===== 知力：在读（1 本主推 + 多本列表） ===== */
  const reading = useMemo(() => (books || []).filter(b => b.st === 'reading').sort((a, b) => (b.pct || 0) - (a.pct || 0)), [books]);
  const booksDone = (books || []).filter(b => b.st === 'done').length;

  /* ===== 能力：各能力里程碑平均进度 ===== */
  const abilRows = useMemo(() => (abilities || []).slice(0, 3).map(a => {
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
  const now = new Date();
  const daysLeftInYear = Math.ceil((new Date(now.getFullYear(), 11, 31, 23, 59, 59) - now) / 86400000);

  return (
    <div className="flex-1 min-w-0 flex flex-col gap-3">
      <div className="w-full max-w-[1320px] mx-auto flex flex-col gap-4 md:h-[calc(100vh-48px)] md:overflow-y-auto nice-scroll">

        {/* ========== Hero：渐变 / 多图轮播通栏（问候 + 签名），全页唯一彩色锚点 ========== */}
        <div ref={heroRef} className="relative md:shrink-0">
        <div
          className="relative overflow-hidden px-8 py-10 flex items-center justify-between gap-6 flex-wrap rounded-[18px] group md:h-[168px]"
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
          <div className="relative z-[2] flex flex-col gap-0.5 min-w-0">
            <span className="text-[12px] font-semibold tracking-wide" style={{ color: 'rgba(255,255,255,0.72)' }}>
              {`${now.getMonth() + 1}月${now.getDate()}日 周${'日一二三四五六'[now.getDay()]} · 余${daysLeftInYear}天`}
            </span>
            <span className="text-[28px] font-extrabold text-white tracking-tight">{greeting}，{name}</span>
            <span className="text-[13.5px] font-medium" style={{ color: 'rgba(255,255,255,0.85)' }}>
              {hour < 12 ? '新的一天，从最重要的事开始' : hour < 18 ? '午后时光，保持节奏' : '回顾一下今天的收获吧'}
            </span>
          </div>

          {/* 右：签名 / 座右铭（点击编辑，回车/失焦保存） */}
          <div className="relative z-[2] flex items-center gap-2 min-w-0 max-w-[440px]">
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
                className="group flex items-center gap-1 min-w-0 px-3 py-2 rounded-xl transition hover:bg-[rgba(255,255,255,0.12)]"
                title="点击编辑签名"
              >
                {signature ? (
                  <>
                    <span className="text-[22px] font-serif leading-none flex-shrink-0 self-center" style={{ color: 'rgba(255,255,255,0.35)' }}>“</span>
                    <span className="text-[14.5px] italic font-medium truncate" style={{ color: 'rgba(255,255,255,0.92)' }}>{signature}</span>
                    <span className="text-[22px] font-serif leading-none flex-shrink-0 self-center" style={{ color: 'rgba(255,255,255,0.35)' }}>”</span>
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
                        <button title="调整图片" onClick={e => { e.stopPropagation(); editHeroImage(im.id); }} className="w-[22px] h-[22px] rounded-md grid place-items-center text-white/85 hover:text-white hover:bg-white/25 transition">
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
              <div className="text-[11px] text-ink-300 mt-1.5">最多 {HERO_IMG_MAX} 张轮播 · 按 Hero 卡片实际比例取景裁剪，成品图 100% 像素用于展示</div>
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
        <div className="grid grid-cols-1 md:grid-cols-3 auto-rows-fr gap-4 md:flex-1 md:min-h-[190px]">

          {/* ---- 今日聚焦：今日全部事项（按时间排序，可滚动勾选）+ 今日节日 ---- */}
          <div className="glass-card p-4 flex flex-col min-h-0 overflow-hidden">
            <CardHead
              title="今日聚焦"
              sub={`${+todayStr.slice(5, 7)}.${+todayStr.slice(8, 10)}`}
              onClick={() => onNav?.('plan')}
              action={(
                <button
                  onClick={() => onNewSchedule?.({ date: todayStr })}
                  className="hp-more w-[26px] h-[26px] rounded-lg grid place-items-center flex-shrink-0 transition active:scale-95"
                  style={{ color: 'var(--s-main)', background: 'rgba(var(--s-rgb),0.06)', '--hc': 'var(--s-main)' }}
                  title="新建今日事项"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
                </button>
              )}
            />
            <div className="flex flex-col gap-2 min-h-0 flex-1">
              <div className="flex items-baseline justify-between mb-0.5">
                <span className="text-[11px] text-ink-400">今日进度</span>
                <span className="text-[12px] font-bold text-ink-800 tabular-nums">{todayDone}/{todayItems.length}</span>
              </div>
              <Bar value={todayPct} />
              <div className="overflow-y-auto overflow-x-hidden nice-scroll pr-0.5 flex flex-col justify-start gap-1 mt-1 flex-1 min-h-0">
                {todaySorted.map(s => (
                  <div key={s.id} className="flex items-center gap-2 group rounded-[10px] px-2 py-1 -mx-2 transition-colors hover:bg-[rgba(var(--s-rgb),0.06)]">
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
                    <button onClick={() => (onEditSchedule ? onEditSchedule(s) : onNav?.('plan'))} className="flex items-center gap-2 text-left min-w-0 flex-1" title="编辑事项">
                      <span className={`text-[12.5px] font-semibold truncate ${s.is_done ? 'text-ink-300 line-through' : 'text-ink-800'}`}>{s.title || '（无标题）'}</span>
                      <PTag p={s.priority} />
                      <span className={`text-[11.5px] font-semibold tabular-nums flex-shrink-0 ml-auto ${s.is_done ? 'text-ink-200' : 'text-ink-300'}`}>{s.start_time ? String(s.start_time).slice(0, 5) : '全天'}</span>
                    </button>
                  </div>
                ))}
                {todayFestivals.map(f => (
                  <div key={f} className="flex items-center gap-2 px-2 py-1 -mx-2 rounded-[10px] transition-colors hover:bg-[rgba(255,59,48,0.05)]">
                    <svg className="w-[15px] h-[15px] flex-shrink-0" fill="none" stroke="#FF3B30" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                      <path d="M5 5h12a2 2 0 0 1 2 2v7"/>
                      <path d="M5 5v14a2 2 0 0 0 2 2h6"/>
                      <path d="M5 10h15"/>
                      <path d="M8 3v4M14 3v4"/>
                      <path d="M17 21h-2"/>
                      <path d="M19 17v-5"/>
                      <path d="M17 19a2 2 0 0 0 2 2"/>
                      <path d="M19 16l1 2 2.2.3-1.6 1.5.4 2.2-2-1.1-2 1.1.4-2.2-1.6-1.5 2.2-.3 1-2z"/>
                    </svg>
                    <span className="text-[12.5px] font-semibold text-ink-800 truncate">{f}</span>
                    <span className="text-[10px] font-bold ml-auto flex-shrink-0" style={{ color: '#FF3B30' }}>今天 · 节日</span>
                  </div>
                ))}
                {todaySorted.length === 0 && todayFestivals.length === 0 && (
                  <div className="text-[12.5px] text-ink-400 text-center py-3">今天还没有安排</div>
                )}
              </div>
            </div>
          </div>

          {/* ---- 本周重点（标题右侧显示本周日期区间 + 周切换按钮，查看 → 周月重点页） ---- */}
          <div className="glass-card p-4 flex flex-col min-h-0 overflow-hidden">
            <CardHead
              title="本周重点"
              sub={`${+viewWeekStartStr.slice(5, 7)}.${+viewWeekStartStr.slice(8, 10)}-${+viewWeekEndStr.slice(5, 7)}.${+viewWeekEndStr.slice(8, 10)}`}
              onClick={() => onNav?.('calendar')}
              action={(
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => setWeekOffset(o => o - 1)}
                    className="hp-more w-[24px] h-[24px] rounded-[7px] grid place-items-center flex-shrink-0 transition active:scale-90"
                    style={{ color: 'var(--s-main)', background: 'rgba(var(--s-rgb),0.06)', '--hc': 'var(--s-main)' }}
                    title="上一周"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                  </button>
                  {weekOffset !== 0 && (
                    <button
                      onClick={() => setWeekOffset(0)}
                      className="hp-more px-1.5 h-[24px] rounded-[7px] grid place-items-center flex-shrink-0 transition active:scale-90 text-[10px] font-bold"
                      style={{ color: 'var(--s-main)', background: 'rgba(var(--s-rgb),0.1)', '--hc': 'var(--s-main)' }}
                      title="回到本周"
                    >
                      本周
                    </button>
                  )}
                  <button
                    onClick={() => setWeekOffset(o => o + 1)}
                    className="hp-more w-[24px] h-[24px] rounded-[7px] grid place-items-center flex-shrink-0 transition active:scale-90"
                    style={{ color: 'var(--s-main)', background: 'rgba(var(--s-rgb),0.06)', '--hc': 'var(--s-main)' }}
                    title="下一周"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                  </button>
                  <button
                    onClick={() => onNewSchedule?.({ date: todayStr, is_goal: 1 })}
                    className="hp-more w-[26px] h-[26px] rounded-lg grid place-items-center flex-shrink-0 transition active:scale-95 ml-0.5"
                    style={{ color: 'var(--s-main)', background: 'rgba(var(--s-rgb),0.06)', '--hc': 'var(--s-main)' }}
                    title="新建本周目标（快捷键 G）"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
                  </button>
                </div>
              )}
            />
            <div className="flex flex-col gap-2 min-h-0 flex-1">
              <div className="flex items-baseline justify-between mb-0.5">
                <span className="text-[11px] text-ink-400">本周进度</span>
                <span className="text-[12px] font-bold text-ink-800 tabular-nums">
                  {weekKeyDone}{weekKeyFailed > 0 && <span className="text-[#FF3B30]">·{weekKeyFailed}</span>}/{weekKeys.length}
                </span>
              </div>
              <Bar value={pct(weekKeyDone, weekKeys.length)} />
              <div className="overflow-y-auto overflow-x-hidden nice-scroll pr-0.5 flex flex-col justify-start gap-1.5 mt-1 flex-1 min-h-0">
                {weekKeys.map(s => (
                  <div key={s.id} className="flex items-center gap-2 group rounded-[10px] px-2 py-1 -mx-2 transition-colors hover:bg-[rgba(var(--s-rgb),0.06)]">
                    <button
                      onClick={e => { e.stopPropagation(); toggleWeekKey(s); }}
                      onContextMenu={e => { e.preventDefault(); e.stopPropagation(); markFailedWeekKey(s); }}
                      className="w-[15px] h-[15px] rounded-[4.5px] border flex-shrink-0 grid place-items-center transition hover:border-[rgba(var(--s-rgb),0.6)] cursor-pointer"
                      title={s.is_done ? '左键取消完成 · 右键标记未达成' : s.is_failed ? '左键标记完成 · 右键取消未达成' : '左键标记完成 · 右键标记未达成'}
                      style={{
                        background: s.is_done ? 'var(--s-main)' : (s.is_failed ? 'rgba(255,59,48,0.08)' : 'transparent'),
                        borderColor: s.is_failed ? '#FF3B30' : (s.is_done ? 'var(--s-main)' : 'rgba(120,120,128,0.35)'),
                      }}
                    >
                      {s.is_done ? (
                        <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      ) : s.is_failed ? (
                        <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="#FF3B30" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>
                      ) : null}
                    </button>
                    <button onClick={() => (onEditSchedule ? onEditSchedule(s) : onNav?.('plan'))} className="flex items-center gap-2 text-left min-w-0 flex-1" title="编辑事项">
                      <span className={`text-[12.5px] font-semibold truncate ${
                        s.is_done ? 'text-ink-300 line-through' :
                        s.is_failed ? 'text-[#FF3B30] line-through' :
                        'text-ink-800'
                      }`}>{s.title}</span>
                      <PTag p={s.priority} />
                      <span className="text-[11.5px] font-semibold text-ink-300 flex-shrink-0 ml-auto tabular-nums">{String(s.date).slice(5).replace('-', '/')}</span>
                    </button>
                  </div>
                ))}
                {weekKeys.length === 0 && (
                  <div className="text-[12.5px] text-ink-400 text-center py-3">本周暂无目标，点右上角 + 新建</div>
                )}
              </div>
            </div>
          </div>

          {/* ---- 即将到来：今日之后的事项（日程 + 生日 + 节日）滚动查看，查看 → 周月重点页 ---- */}
          <div className="glass-card p-4 flex flex-col min-h-0 overflow-hidden">
            <CardHead title="即将到来" sub="今日之后" onClick={() => onNav?.('calendar')} />
            <div className="overflow-y-auto overflow-x-hidden nice-scroll pr-0.5 flex flex-col justify-start gap-1 flex-1 min-h-0">
              {followUpList.map(u => {
                const weekday = '日一二三四五六'[new Date(`${u.date}T00:00:00`).getDay()];
                const schedMod = u.category != null ? catToModule(Number(u.category)) : null;
                const meta = u.type === 'birthday'
                  ? { bg: 'rgba(var(--m-life-rgb),0.1)', fg: 'var(--m-life)', tag: u.isLunar ? '农历生日' : '生日' }
                  : u.type === 'festival'
                    ? { bg: 'rgba(255,59,48,0.08)', fg: '#FF3B30', tag: '节日' }
                    : schedMod
                      ? { bg: schedMod.soft, fg: schedMod.color, tag: schedMod.label }
                      : { bg: 'rgba(120,120,128,0.08)', fg: '#8e8e93', tag: '日程' };
                return (
                  <button
                    key={u.key}
                    onClick={() => u.type === 'birthday' ? onNav?.('annual', 'life') : (u.type === 'festival' || !onEditSchedule || !u.s) ? onNav?.('calendar') : onEditSchedule(u.s)}
                    title={u.type === 'sched' ? '编辑事项' : undefined}
                    className="flex items-center gap-2.5 text-left rounded-[10px] px-2 py-1.5 -mx-2 transition hover:bg-[rgba(var(--s-rgb),0.06)] flex-shrink-0"
                  >
                    <span className="w-[32px] h-[32px] rounded-[9px] grid place-items-center flex-shrink-0" style={{ background: meta.bg, color: meta.fg }}>
                      {u.type === 'birthday' ? (
                        /* 生日蛋糕：3 层蛋糕 + 蜡烛火焰，stroke 风格与分类图标一致 */
                        <svg className="w-[19px] h-[19px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                          <path d="M4 17h16v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-4z"/>
                          <path d="M6 13h12v4H6z"/>
                          <path d="M8 9h8v4H8z"/>
                          <path d="M12 3v3"/>
                          <path d="M12 2a1 1 0 0 1 1 1c0 1-1 1.5-1 2.5"/>
                          <path d="M6 13v-0.5M9 13v-0.5M12 13v-0.5M15 13v-0.5M18 13v-0.5"/>
                          <path d="M4 17v-0.5M8 17v-0.5M12 17v-0.5M16 17v-0.5M20 17v-0.5"/>
                        </svg>
                      ) : u.type === 'festival' ? (
                        /* 节日日历：完整闭合圆角轮廓 + 主体内实心星标
                           （Lucide calendar 系标准形：闭合几何形在小尺寸下比断裂轮廓干净，
                             星标居中填充，与分隔线上下留白均衡） */
                        <svg className="w-[19px] h-[19px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                          {/* 顶部挂耳 */}
                          <path d="M8 2v4M16 2v4"/>
                          {/* 日历主体：完整圆角矩形 */}
                          <rect x="3" y="4" width="18" height="18" rx="2.5"/>
                          {/* 中间分隔线 */}
                          <path d="M3 9.5h18"/>
                          {/* 星标：主体内部居中，实心填充 */}
                          <path d="M12 11.8 L13.29 14.32 L16.09 14.77 L14.09 16.78 L14.53 19.58 L12 18.3 L9.47 19.58 L9.91 16.78 L7.91 14.77 L10.71 14.32 Z" fill="currentColor" stroke="none"/>
                        </svg>
                      ) : u.s?.is_goal ? (
                        /* 目标事项：同心圆靶心图标 */
                        <svg className="w-[19px] h-[19px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                          <circle cx="12" cy="12" r="8.5"/>
                          <circle cx="12" cy="12" r="5"/>
                          <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>
                        </svg>
                      ) : schedMod ? (
                        <CategoryIcon catKey={schedMod.key} className="w-[19px] h-[19px]" />
                      ) : (
                        <svg className="w-[19px] h-[19px]" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                      )}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="text-[12.5px] font-semibold text-ink-800 truncate">{u.title}</span>
                        <PTag p={u.priority} />
                      </div>
                      <div className="text-[10.5px] text-ink-400 tabular-nums">{`${String(u.date).slice(5).replace('-', '.')} ${weekday} · ${meta.tag}`}</div>
                    </div>
                    <span className="text-[11px] font-bold tabular-nums flex-shrink-0" style={{ color: meta.fg }}>{u.daysLeft === 0 ? '今天' : `${u.daysLeft}天后`}</span>
                  </button>
                );
              })}
              {followUpList.length === 0 && (
                <div className="text-[12.5px] text-ink-400 text-center py-3">近期暂无安排</div>
              )}
            </div>
          </div>
        </div>

        {/* ========== 成长层：精力 / 知力 / 能力 / 工作（4 等分，lg 起 4 列） ========== */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 auto-rows-fr gap-4 md:min-h-[clamp(170px,26vh,248px)] md:shrink-0">

          {/* ---- 精力：周打卡矩阵（标题精简两字，行尾显示本周打卡次数） ---- */}
          <div className="glass-card p-4 flex flex-col">
            <CardHead moduleKey="energy" title="精力" sub="本周打卡" onClick={() => onNav?.('annual', 'energy')} />
            {habitRows.length > 0 ? (
              <>
                <div className="hp-hb">
                  {habitRows.map(h => {
                    const set = new Set(h.allDates || []);
                    Object.entries(habitTweaks[h.id] || {}).forEach(([d, v]) => v ? set.add(d) : set.delete(d));
                    const cnt = weekDates.filter(d => set.has(d)).length;
                    return (
                      <div key={h.id} className="hp-hrow">
                        <span className="hp-hname" title={h.label}>{String(h.label || '').split('·')[0].trim().slice(0, 2) || '习惯'}</span>
                        <div className="hp-hcells">
                          {weekDates.map(d => {
                            const isTdy = d === todayStr;
                            const isFut = d > todayStr;
                            const ok = set.has(d);
                            return (
                              <button
                                key={d}
                                onClick={() => !isFut && toggleHabitCell(h, d, ok)}
                                disabled={isFut}
                                title={isFut ? '未来日期' : ok ? '取消打卡' : '打卡'}
                                className={`hp-hcell hp-hcell-btn${ok ? ' ok' : ''}${isFut ? ' fut' : ''}${isTdy ? ' tdy' : ''}`}
                              >
                                {parseInt(d.slice(8), 10)}
                              </button>
                            );
                          })}
                        </div>
                        <span className="text-[10px] font-bold tabular-nums flex-shrink-0 w-[20px] text-right" style={{ color: cnt >= 7 ? 'var(--m-energy)' : '#8e8e93' }}>{cnt}/7</span>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-1.5 py-4">
                <span className="text-[12.5px] font-semibold text-ink-600">还没有精力类习惯</span>
                <span className="text-[11px] text-ink-400">去习惯面板创建睡眠、运动等打卡</span>
              </div>
            )}
          </div>

          {/* ---- 知力：在读（主推书带封面） ---- */}
          <div className="glass-card p-4 flex flex-col">
            <CardHead
              moduleKey="cognition"
              title="知力"
              sub={reading.length > 0 ? `在读 ${reading.length} 本` : `已读 ${booksDone} 本`}
              onClick={() => onNav?.('annual', 'cognition')}
              action={reading[0]?.ebookUrl ? (
                <a
                  href={reading[0].ebookUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hp-more w-[26px] h-[26px] rounded-lg grid place-items-center flex-shrink-0 transition active:scale-95"
                  style={{ color: 'var(--m-cognition)', background: 'rgba(var(--m-cognition-rgb),0.08)', '--hc': 'var(--m-cognition)' }}
                  title={`微信读书继续读 ·《${reading[0].t}》`}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                </a>
              ) : null}
            />
            <div className="flex-1 flex flex-col justify-start min-h-0">
              {reading.length > 0 && (
                <div
                  onClick={() => onEditBook?.(reading[0])}
                  title="编辑书籍"
                  className="rounded-xl p-2.5 bg-white dark:bg-white/5 border border-ink-100 dark:border-white/10 cursor-pointer transition hover:border-[rgba(var(--m-cognition-rgb),0.45)]"
                >
                  <div className="flex gap-3">
                    {reading[0].coverUrl ? (
                      <img
                        src={reading[0].coverUrl} alt=""
                        className="w-[46px] h-[64px] rounded-lg object-cover flex-shrink-0 border border-[rgba(0,0,0,0.08)]"
                        style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.10), 0 3px 8px rgba(0,0,0,0.09)' }}
                        onError={e => { e.currentTarget.style.visibility = 'hidden'; }}
                      />
                    ) : (
                      <span className="w-[46px] h-[64px] rounded-lg flex-shrink-0 grid place-items-center text-[16px] font-bold" style={{ background: 'rgba(var(--m-cognition-rgb),0.12)', color: 'var(--m-cognition)' }}>{String(reading[0].t || '书')[0]}</span>
                    )}
                    <div className="flex-1 min-w-0 flex flex-col">
                      <div className="flex items-baseline justify-between gap-2 mb-1">
                        <span className="text-[12.5px] font-semibold text-ink-800 truncate">《{reading[0].t}》</span>
                        <span className="text-[11.5px] font-bold tabular-nums flex-shrink-0" style={{ color: 'var(--m-cognition)' }}>{reading[0].pct || 0}%</span>
                      </div>
                      <div className="text-[11px] text-ink-400 truncate">{reading[0].author || '佚名'} · {reading[0].cat || '未分类'}</div>
                      <div className="mt-auto pt-1.5"><Bar value={reading[0].pct || 0} color="var(--m-cognition)" /></div>
                    </div>
                  </div>
                  {reading.length > 1 && (
                    <div className="mt-2 pt-2 flex flex-col gap-1.5" style={{ borderTop: '1px dashed rgba(120,120,128,0.16)' }}>
                      {reading.slice(1, 4).map(b => (
                        <div key={b.id} onClick={() => onEditBook?.(b)} title="编辑书籍" className="flex items-center gap-2 cursor-pointer rounded-md px-1 -mx-1 py-0.5 transition hover:bg-[rgba(var(--m-cognition-rgb),0.06)]">
                          <span className="text-[11.5px] text-ink-600 truncate flex-1">{b.t}</span>
                          <div className="w-[54px] flex-shrink-0"><Bar value={b.pct || 0} color="var(--m-cognition)" h="4px" /></div>
                          <span className="text-[10px] text-ink-400 tabular-nums w-[27px] text-right">{b.pct || 0}%</span>
                        </div>
                      ))}
                      {reading.length > 4 && <div className="text-[10.5px] text-ink-300">等 {reading.length - 4} 本在读…</div>}
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
          <div className="glass-card p-4 flex flex-col">
            <CardHead moduleKey="ability" title="能力" sub="里程碑进度" onClick={() => onNav?.('annual', 'ability')} />
            <div className="flex-1 flex flex-col justify-evenly gap-2">
              {abilRows.map(a => (
                <div key={a.id}>
                  <div className="flex items-baseline justify-between gap-2 mb-1">
                    <span className="text-[12.5px] font-semibold text-ink-800 truncate">{a.title}</span>
                    <span className="text-[11.5px] font-bold tabular-nums flex-shrink-0" style={{ color: 'var(--m-ability)' }}>{a.avg}%</span>
                  </div>
                  <Bar value={a.avg} color="var(--m-ability)" />
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
          <div className="glass-card p-4 flex flex-col">
            <CardHead moduleKey="work" title="工作" sub="目标进度" onClick={() => onNav?.('annual', 'work')} />
            <div className="flex-1 flex flex-col justify-start gap-2.5">
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

        {/* ========== 快捷操作：计划 → 捕获 → 复盘（无边药丸，sticky 吸底与侧边栏底端对齐） ========== */}
        <div
          className="grid grid-cols-1 sm:grid-cols-4 gap-3 md:sticky md:bottom-0 md:shrink-0 z-10"
          style={{ background: 'linear-gradient(180deg, rgba(232,232,237,0), rgba(232,232,237,0.92) 46%)', backdropFilter: 'blur(5px)', WebkitBackdropFilter: 'blur(5px)' }}
        >
          <button
            onClick={() => onNewSchedule?.()}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-full border border-ink-200/60 bg-white dark:bg-white/5 transition hover:border-ink-300 hover:bg-ink-50 active:scale-[0.97] text-[13px] font-semibold text-ink-800"
          >
            <span className="w-6 h-6 rounded-full grid place-items-center flex-shrink-0" style={{ background: 'rgba(var(--s-rgb),0.1)' }}>
              <svg className="w-[13px] h-[13px]" style={{ color: 'var(--s-main)' }} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="3"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="12" y1="14" x2="12" y2="18"/><line x1="10" y1="16" x2="14" y2="16"/></svg>
            </span>
            事项
            <span className="text-[9px] font-bold leading-none px-1.5 py-[2px] rounded border border-ink-300 text-ink-400" title="键盘快捷键">S</span>
          </button>
          <button
            onClick={() => onNewSchedule?.({ is_goal: 1 })}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-full border border-ink-200/60 bg-white dark:bg-white/5 transition hover:border-ink-300 hover:bg-ink-50 active:scale-[0.97] text-[13px] font-semibold text-ink-800"
          >
            <span className="w-6 h-6 rounded-full grid place-items-center flex-shrink-0" style={{ background: 'rgba(var(--s-rgb),0.1)' }}>
              <svg className="w-[13px] h-[13px]" style={{ color: 'var(--s-main)' }} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/></svg>
            </span>
            目标
            <span className="text-[9px] font-bold leading-none px-1.5 py-[2px] rounded border border-ink-300 text-ink-400" title="键盘快捷键">G</span>
          </button>
          <button
            onClick={() => onQuickCapture?.()}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-full border border-ink-200/60 bg-white dark:bg-white/5 transition hover:border-ink-300 hover:bg-ink-50 active:scale-[0.97] text-[13px] font-semibold text-ink-800"
          >
            <span className="w-6 h-6 rounded-full grid place-items-center flex-shrink-0" style={{ background: 'rgba(var(--m-energy-rgb),0.1)' }}>
              <svg className="w-[13px] h-[13px]" style={{ color: 'var(--m-energy)' }} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
            </span>
            记录
            <span className="text-[9px] font-bold leading-none px-1.5 py-[2px] rounded border border-ink-300 text-ink-400" title="键盘快捷键">N</span>
          </button>
          <button
            onClick={() => onOpenSummary?.()}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-full border border-ink-200/60 bg-white dark:bg-white/5 transition hover:border-ink-300 hover:bg-ink-50 active:scale-[0.97] text-[13px] font-semibold text-ink-800"
          >
            <span className="w-6 h-6 rounded-full grid place-items-center flex-shrink-0" style={{ background: 'rgba(var(--m-cognition-rgb),0.1)' }}>
              <svg className="w-[13px] h-[13px]" style={{ color: 'var(--m-cognition)' }} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            </span>
            总结
            <span className="text-[9px] font-bold leading-none px-1.5 py-[2px] rounded border border-ink-300 text-ink-400" title="键盘快捷键">D</span>
          </button>
        </div>
      </div>

      {/* Hero 背景图上传入口（仅添加；重新编辑已有图走卡片上的笔图标） */}
      <input ref={filePickRef} type="file" accept="image/*" className="hidden" onChange={handleHeroFilePick} />

      {/* Hero 图片裁剪弹窗（新上传裁剪 / 笔图标重新调整共用） */}
      <HeroCropModal
        open={!!cropSrc}
        source={cropSrc}
        ratio={HERO_ASPECT}
        initialCrop={cropCrop}
        outWidth={HERO_OUT_WIDTH}
        outMaxBytes={HERO_OUT_MAX_BYTES}
        onClose={() => { setCropSrc(null); setCropReplaceId(null); setCropCrop(null); }}
        onConfirm={handleCropConfirm}
      />
    </div>
  );
}
