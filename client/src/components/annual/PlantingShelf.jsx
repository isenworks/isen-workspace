// ============================================================
// PlantingShelf — 种植花架画布组件
//   生活页「种植」类目选中时渲染，替代时间流主视图
//   功能：上传透明背景植物图 → 左键拖拽自由摆放 → 右键查看/编辑植物档案
//   设计：胡桃木三层花架 + 纯白微暖墙面 + 蜜蜂蝴蝶氛围 + 绿色光晕 + 浇水提醒
// ============================================================
import React, { useState, useEffect, useRef, useCallback, useMemo, useId } from 'react';
import { API } from '../../api/client.js';
import { useToast } from '../../context/ToastContext.jsx';
import ConfirmDialog from '../ConfirmDialog.jsx';
import { IconCheck } from '../aiIcons.jsx';
import { useLongPress } from '../useLongPress.js';
import { uid } from './utils.js';
import catLying from '../../assets/cat-lying.png';
import corgiSleeping from '../../assets/corgi-sleeping.png';

// ---- 绿色（工作台 iOS accent.green 700 单色，H≈136° 同色相，只降明度）----
// 单色 #238E3F  green-700：一处到底 —— 实底按钮 / 勾选框 / 缩放手柄 / focus 边框 /
//   滑块描边 / 顶栏图标 / 空状态叶片，以及所有绿字（养护状态、种植天数、托板徽章、
//   名称气泡底、重试、上传图片、添加托板）
// 浅色 #7ED6A0  green-300：空状态叶片高光
// 铺垫 rgba(35,142,63,·)  同色半透明：植物卡渐变、拖拽区虚线、托板徽章底、抽屉头像底、
//   手柄与勾选框阴影、托板选中描边、保存提示底
// 为什么单色：green-700 白底 4.2:1，文字与控件共用一色仍然可读，于是不必再分
//   「控件色 / 小字色」两层，正好回到工作台「每模块一色 + 10% 同色铺垫」的结构
// 改色请全局替换以上 3 组值（含 Tailwind 任意值写法 focus:border-[#238E3F]）

// ---- 养护状态计算（浇水/施肥通用）----
// 灰=无记录 / 绿=正常或今日已做 / 橙=临期(距下次养护≤2天) / 红=超期
// okColor 覆盖「正常 / 今日已做」这一档的色（浇水用默认绿，施肥传土色 #8B6B4F）；
// 临期橙与超期红是通用告警色，两种养护共用，不随 okColor 变
// 下次养护日 = 上次日期 + 周期，按「剩余天数」给行动指引（今天/明天/后天…）
// 周期数字不出现（避免与控制行的「周期」重复）
function careStatus(last, cycle, unit, okColor = '#238E3F') {
  if (!last) return { level: 'none', color: 'var(--text-3)', text: `还没有${unit}记录` };
  if (!cycle) return { level: 'none', color: 'var(--text-3)', text: `未设置${unit}周期` };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const l = new Date(last); l.setHours(0, 0, 0, 0);
  const days = Math.round((today - l) / 86400000);
  // 剩余天数 = 周期 - 距上次天数：0=今天到期，1=明天，2=后天，>2 顺延，<0=已超期
  const remaining = cycle - days;
  if (days <= 0) return { level: 'done', color: okColor, text: `今日已${unit}`, days };
  if (remaining < 0) return { level: 'alert', color: 'var(--danger)', text: `已超期 ${-remaining} 天`, days };
  if (remaining === 0) return { level: 'warn', color: 'var(--warning)', text: `建议今天${unit}`, days };
  if (remaining === 1) return { level: 'warn', color: 'var(--warning)', text: `建议明天${unit}`, days };
  if (remaining === 2) return { level: 'warn', color: 'var(--warning)', text: `建议后天${unit}`, days };
  return { level: 'ok', color: okColor, text: `${remaining} 天后${unit}`, days };
}

// 日期显示统一成点号格式（2026-09-01 → 2026.09.01）；空值给占位符
function dotDate(d) {
  return typeof d === 'string' && d.length === 10 ? d.replace(/-/g, '.') : '—';
}

// 日历图标：与工作台左侧导航栏（Sidebar ICONS.calendar）同一套视觉语言，两处日期共用
function CalendarGlyph({ size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

// 桌面端点击日期输入不会自动弹出日历（只有指示器会），故主动调一次 showPicker；
// 不支持时静默降级，移动端原生点击即弹系统日历的行为不受影响
function openNativePicker(e) {
  try { e.currentTarget.showPicker?.(); } catch { /* 旧浏览器/受限上下文：忽略 */ }
}

// 画布角标只关心浇水超期
function waterStatus(plant) {
  const s = careStatus(plant.last_watered, plant.water_cycle_days, '浇水');
  return s.level === 'alert' ? s : null;
}

// ---- 已种植天数 ----
function plantedDays(dateStr) {
  if (!dateStr) return 0;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const p = new Date(dateStr); p.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((today - p) / 86400000));
}

// ---- 图片压缩（canvas 缩到 maxDim 内 + WebP 导出，保留透明背景）----
//   失败/反而变大时原样返回；花架展示最大 140×160×2.5≈350×400px，480px 采样绰绰有余
function compressDataUrl(dataUrl, maxDim = 480) {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        try {
          const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight, 1));
          const w = Math.max(1, Math.round(img.naturalWidth * scale));
          const h = Math.max(1, Math.round(img.naturalHeight * scale));
          const cv = document.createElement('canvas');
          cv.width = w; cv.height = h;
          cv.getContext('2d').drawImage(img, 0, 0, w, h);
          // WebP 压缩率高且保透明；老浏览器不支持导出则回退 PNG
          let out = cv.toDataURL('image/webp', 0.9);
          if (!out || !out.startsWith('data:image/webp')) out = cv.toDataURL('image/png');
          resolve(out && out.length < dataUrl.length ? out : dataUrl);
        } catch { resolve(dataUrl); }
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    } catch { resolve(dataUrl); }
  });
}

// ---- 悬浮托板（boards）----
//   「概念 A：悬浮托板」的落地模型：板不贴边、长短不一、左右错位，无立柱。
//   x/y/w 均为画布百分比（x=左缘、y=顶面、w=宽度）；厚度固定 BOARD_H(px)；color=板色。
//   板画在植物之上（zIndex 4 > 植物容器 2），盖住花盆底部 → 形成"坐在板上"的错觉。
const BOARD_H = 16;
const MAX_BOARDS = 6;
const DEFAULT_BOARD_COLORS = ['#A98C64', '#9A7F5C', '#8B6B4F'];
// 默认三块：右(52%) / 左(6%) / 右(56%) —— 交替缩进，形成 Z 字节奏
const DEFAULT_BOARDS = [
  { id: 'bd1', x: 52, y: 24, w: 42, color: '#A98C64' },
  { id: 'bd2', x: 6, y: 50, w: 42, color: '#9A7F5C' },
  { id: 'bd3', x: 56, y: 76, w: 38, color: '#8B6B4F' },
];
// settings 里已有 boards 则直接使用；否则从旧的 layer_colors 迁移出三块默认几何的托板
function resolveBoards(settings) {
  const st = settings || {};
  if (Array.isArray(st.boards) && st.boards.length) return st.boards;
  const legacy = Array.isArray(st.layer_colors) ? st.layer_colors : null;
  return DEFAULT_BOARDS.map((b, i) => ({ ...b, color: legacy?.[i] || b.color }));
}

// 木色明暗（amt>0 提亮，<0 压暗）：托板"上亮下暗"的实木三明治渐变
function shade(hex, amt) {
  const n = String(hex || '#9A7F5C').replace('#', '');
  const h = n.length === 3 ? n.split('').map(c => c + c).join('') : n.padEnd(6, '0');
  const ch = (i) => {
    const v = parseInt(h.slice(i, i + 2), 16) || 0;
    return Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt));
  };
  return `rgb(${ch(0)}, ${ch(2)}, ${ch(4)})`;
}

// 新增托板时补一个纵向空档 + 左右交替，尽量不压已有的板；颜色取默认色板
function nextBoardSlot(list, palette) {
  const ys = list.map(b => b.y);
  const cands = [16, 30, 44, 58, 72, 86];
  let y = cands[0], best = -1;
  for (const c of cands) {
    const d = ys.length ? Math.min(...ys.map(v => Math.abs(v - c))) : 99;
    if (d > best) { best = d; y = c; }
  }
  const idx = list.length;
  const w = idx % 2 === 0 ? 36 : 42;
  const x = idx % 2 === 0 ? 8 : 56;
  const pal = Array.isArray(palette) && palette.length ? palette : DEFAULT_BOARD_COLORS;
  return { x: Math.min(x, 100 - w), y, w, color: pal[idx % pal.length] };
}

// ---- 蜜蜂 SVG ----
// 侧面朝左飞的姿态（与最初版本一致），但沿用与瓢虫统一的视觉语法：
//   深色圆头 + 浅色眼点（侧视单眼）、0.7 细描边圆头触角/腿、平涂 + 一块 surface 高光；
//   背部不翘黑线（触角明确长在头上）、圆屁股后挂小尖刺、翅膀搭在背上扇动
// flip = 水平镜像成朝右飞（右侧的蜜蜂用），镜像走 g 变换，翅膀扇动动画不受影响
function Bee({ size = 30, flip = false }) {
  const clipId = useId();
  const ink = '#2E2823';
  return (
    <svg width={size} height={size * 0.786} viewBox="0 0 28 22">
      <g transform={flip ? 'translate(28 0) scale(-1 1)' : undefined}>
        {/* 翅膀（半透明白 + 扇动），搭在背上，画在最底层（ry 加高，圆润不扁） */}
        <ellipse className="bee-wing" cx="12.4" cy="5.4" rx="6" ry="4.8" fill="rgba(255,255,255,0.7)" stroke="#ddd" strokeWidth="0.5" />
        <ellipse className="bee-wing" cx="20" cy="6" rx="5.4" ry="4.3" fill="rgba(255,255,255,0.7)" stroke="#ddd" strokeWidth="0.5" />
        {/* 尾刺与腿：画在身体之前，根部被盖住，只露出尖和末梢 */}
        <path d="M23.8 12.4 L27 13.8 L23.8 15.2 Z" fill={ink} strokeLinejoin="round" />
        <path d="M11.2 17.6 L10.2 20.6 M15.5 19.2 L14.8 21.5 M19.8 18.6 L19.4 21.2"
          fill="none" stroke={ink} strokeWidth="0.7" strokeLinecap="round" />
        {/* 身体：黄底横椭 + 两道纵纹（clip 进轮廓，条纹随外形收边） */}
        <defs><clipPath id={clipId}><ellipse cx="16.5" cy="13.8" rx="8" ry="5.8" /></clipPath></defs>
        <ellipse cx="16.5" cy="13.8" rx="8" ry="5.8" fill="#F5C724" />
        <g clipPath={`url(#${clipId})`}>
          <rect x="14.2" y="7" width="2" height="14" fill={ink} />
          <rect x="18.6" y="7" width="2" height="14" fill={ink} />
        </g>
        {/* 高光：与瓢虫同款 surface 反光 */}
        <ellipse cx="12.8" cy="10.2" rx="2" ry="0.9" fill="var(--surface-card)" opacity="0.3" />
        {/* 深色圆头（朝左）+ 侧视单眼点 */}
        <circle cx="7.5" cy="13" r="4.2" fill={ink} />
        <circle cx="6.1" cy="12.2" r="0.6" fill="var(--surface-card)" opacity="0.8" />
        {/* 触角：从头顶弯出，细描边圆头线 */}
        <path d="M6.6 9.4 Q5.8 7.4 4.4 6.6 M8.6 9.2 Q9 7.2 10.2 6.2" fill="none" stroke={ink} strokeWidth="0.7" strokeLinecap="round" />
      </g>
    </svg>
  );
}

// ---- 蝴蝶 SVG ----
function Butterfly({ size = 34, color = '#FFB347' }) {
  const dark = color === '#FFB347' ? 'var(--warning)' : '#9D5CDB';
  return (
    <svg width={size} height={size * 0.88} viewBox="0 0 34 30">
      <ellipse className="bf-wing" cx="10" cy="14" rx="9" ry="7" fill={color} opacity="0.82" />
      <ellipse className="bf-wing" cx="10" cy="22" rx="7" ry="5" fill={dark} opacity="0.75" />
      <ellipse className="bf-wing" cx="24" cy="14" rx="9" ry="7" fill={color} opacity="0.82" />
      <ellipse className="bf-wing" cx="24" cy="22" rx="7" ry="5" fill={dark} opacity="0.75" />
      <circle cx="10" cy="12" r="2" fill="var(--surface-card)" opacity="0.6" />
      <circle cx="24" cy="12" r="2" fill="var(--surface-card)" opacity="0.6" />
      <ellipse cx="17" cy="18" rx="1.8" ry="8" fill="var(--ink-600)" />
      <path d="M16 10 q-2 -4 -4 -3" fill="none" stroke="var(--ink-600)" strokeWidth="1" />
      <path d="M18 10 q2 -4 4 -3" fill="none" stroke="var(--ink-600)" strokeWidth="1" />
    </svg>
  );
}

// ---- 瓢虫 SVG（七星瓢虫）----
// 7 个斑点 = 鞘翅前端中线旁 1 个 + 两侧各 3 个：这是「七星瓢虫」的识别符号，
//   而瓢虫科里只有植食性的二十八星瓢虫是害虫，两者靠斑点数量与光泽区分。
//   画错点数会被读成害虫，语义正好反掉，所以点数与高光都不是装饰。
// 飞行不另加白色后翅：张开并振动的是它自己的红色鞘翅（左右两片），这正是瓢虫起飞的样子；
//   停落时两片合拢回整壳、振动停止。飞行态与停落态用同一条 26s 时间轴切可见性，
//   避免「合拢的整壳」和「张开的两片」两种画法叠在一起互相穿帮。
function Ladybug({ size = 20 }) {
  const spotsL = [[7, 8.6, 1.7], [5.6, 12.8, 1.5], [8.8, 16.6, 1.4]];
  const spotsR = [[17, 8.6, 1.7], [18.4, 12.8, 1.5], [15.2, 16.6, 1.4]];
  return (
    <svg width={size} height={size * 0.92} viewBox="0 0 24 22">
      {/* 六足画在最底层：压在鞘翅之下，飞行时才不会用深色线条把红翅划花 */}
      <path d="M5.8 9.6 L2.8 12.6 M5.4 13.4 L2.2 16.4 M5.9 16.8 L3.4 20.6 M18.2 9.6 L21.2 12.6 M18.6 13.4 L21.8 16.4 M18.1 16.8 L20.6 20.6"
        fill="none" stroke="#2E2823" strokeWidth="0.7" strokeLinecap="round" />

      {/* 腹部：飞行张开鞘翅时露出的深色底，避免两片之间出现空洞（收窄以免小尺寸糊成一团） */}
      <ellipse cx="12" cy="12.4" rx="4.2" ry="6.6" fill="#4A3A32" />

      {/* 飞行态：左右两片红色鞘翅，向外张开 + 高频振动 */}
      <g className="lady-wings">
        <g className="lady-wing-l">
          <path d="M12 3.4 C6.6 3.5 3 7.4 3 12 C3 16.6 6.6 20.2 12 20.3 Z" fill="#E4583F" />
          {spotsL.map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} fill="#2E2823" />)}
          <ellipse cx="8.6" cy="7.8" rx="2.2" ry="1.05" fill="var(--surface-card)" opacity="0.3" />
        </g>
        <g className="lady-wing-r">
          <path d="M12 3.4 C17.4 3.5 21 7.4 21 12 C21 16.6 17.4 20.2 12 20.3 Z" fill="#E4583F" />
          {spotsR.map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} fill="#2E2823" />)}
          <ellipse cx="15.4" cy="7.8" rx="2.2" ry="1.05" fill="var(--surface-card)" opacity="0.3" />
        </g>
      </g>

      {/* 停落态：合拢的整壳（含小盾斑，共 7 个斑）+ 有光泽（捕食性瓢虫的识别特征） */}
      <g className="lady-shell">
        <path d="M12 3.4 C6.6 3.5 3 7.4 3 12 C3 16.6 6.6 20.2 12 20.3 C17.4 20.2 21 16.6 21 12 C21 7.4 17.4 3.5 12 3.4 Z"
          fill="#E4583F" />
        {/* 中缝用比壳稍深的红，而不是近黑的深褐：避免「头 + 顶斑 + 中缝」连成一条过重的暗竖带 */}
        <path d="M12 3.9 L12 20.1" fill="none" stroke="#C04632" strokeWidth="0.55" />
        <circle cx="12" cy="6.2" r="1.3" fill="#2E2823" />
        {[...spotsL, ...spotsR].map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} fill="#2E2823" />)}
        <ellipse cx="9" cy="6.6" rx="2.4" ry="1.2" fill="var(--surface-card)" opacity="0.32" />
        <ellipse cx="14.6" cy="6.4" rx="1.6" ry="0.85" fill="var(--surface-card)" opacity="0.2" />
      </g>

      {/* 头 + 复眼 + 触角（两态都在），压在最上层 */}
      <ellipse cx="12" cy="3.3" rx="3.4" ry="2.1" fill="#2E2823" />
      <circle cx="10.6" cy="2.9" r="0.5" fill="var(--surface-card)" opacity="0.8" />
      <circle cx="13.4" cy="2.9" r="0.5" fill="var(--surface-card)" opacity="0.8" />
      <path d="M10.6 1.6 L9 0.4 M13.4 1.6 L15 0.4" fill="none" stroke="#2E2823" strokeWidth="0.7" strokeLinecap="round" />
    </svg>
  );
}

// ---- 可拖拽的蜜蜂 ----
function BeeDrop({ pos, size, anim, flip, onPosChange }) {
  const ref = useRef(null);
  const [drag, setDrag] = useState(null);
  useEffect(() => {
    if (!drag) return;
    const onMove = (e) => {
      const canvas = ref.current?.closest('.planting-shelf-wrap > div');
      if (!canvas) return;
      const r = canvas.getBoundingClientRect();
      const l = Math.max(0, Math.min(100, ((e.clientX - r.left - drag.offX) / r.width) * 100));
      const t = Math.max(0, Math.min(100, ((e.clientY - r.top - drag.offY) / r.height) * 100));
      onPosChange({ left: `${l.toFixed(1)}%`, top: `${t.toFixed(1)}%` });
    };
    const onUp = () => setDrag(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [drag, onPosChange]);
  return (
    <div ref={ref} className="absolute cursor-grab active:cursor-grabbing"
      style={{ left: pos.left, top: pos.top, zIndex: 6, transform: 'translate(-50%,-50%)' }}
      onMouseDown={(e) => {
        e.stopPropagation(); e.preventDefault();
        const r = ref.current.getBoundingClientRect();
        setDrag({ offX: e.clientX - r.left - r.width / 2, offY: e.clientY - r.top - r.height / 2 });
      }}>
      <div className={anim}><Bee size={size} flip={flip} /></div>
    </div>
  );
}

// ---- 可拖拽的蝴蝶 ----
function BFDrop({ pos, size, color, anim, onPosChange }) {
  const ref = useRef(null);
  const [drag, setDrag] = useState(null);
  useEffect(() => {
    if (!drag) return;
    const onMove = (e) => {
      const canvas = ref.current?.closest('.planting-shelf-wrap > div');
      if (!canvas) return;
      const r = canvas.getBoundingClientRect();
      const l = Math.max(0, Math.min(100, ((e.clientX - r.left - drag.offX) / r.width) * 100));
      const t = Math.max(0, Math.min(100, ((e.clientY - r.top - drag.offY) / r.height) * 100));
      onPosChange({ left: `${l.toFixed(1)}%`, top: `${t.toFixed(1)}%` });
    };
    const onUp = () => setDrag(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [drag, onPosChange]);
  return (
    <div ref={ref} className="absolute cursor-grab active:cursor-grabbing"
      style={{ left: pos.left, top: pos.top, zIndex: 6, transform: 'translate(-50%,-50%)' }}
      onMouseDown={(e) => {
        e.stopPropagation(); e.preventDefault();
        const r = ref.current.getBoundingClientRect();
        setDrag({ offX: e.clientX - r.left - r.width / 2, offY: e.clientY - r.top - r.height / 2 });
      }}>
      <div className={anim}><Butterfly size={size} color={color} /></div>
    </div>
  );
}

// ---- 可拖拽的瓢虫 ----
// 与蜂蝶同一套拖拽逻辑，两处不同：
//   1. 命中区挂在「带飞行动画的内层」上 —— 瓢虫大部分时间悬在落点上方 40px 左右，
//      挂在静止的外层会出现"看得见却点不到、点得到的地方又没有虫"
//   2. 拖动期间暂停飞行动画，虫身才会严格跟着指针走；松手后从暂停处续飞
function LadybugDrop({ pos, size, anim, onPosChange }) {
  const ref = useRef(null);
  const [drag, setDrag] = useState(null);
  useEffect(() => {
    if (!drag) return;
    const onMove = (e) => {
      const canvas = ref.current?.closest('.planting-shelf-wrap > div');
      if (!canvas) return;
      const r = canvas.getBoundingClientRect();
      const l = Math.max(0, Math.min(100, ((e.clientX - r.left - drag.offX) / r.width) * 100));
      const t = Math.max(0, Math.min(100, ((e.clientY - r.top - drag.offY) / r.height) * 100));
      onPosChange({ left: `${l.toFixed(1)}%`, top: `${t.toFixed(1)}%` });
    };
    const onUp = () => setDrag(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [drag, onPosChange]);
  return (
    <div className="absolute pointer-events-none"
      style={{ left: pos.left, top: pos.top, zIndex: 6, transform: 'translate(-50%,-50%)' }}>
      <div ref={ref} className={`${anim} pointer-events-auto cursor-grab active:cursor-grabbing`}
        style={{ animationPlayState: drag ? 'paused' : 'running' }}
        onMouseDown={(e) => {
          e.stopPropagation(); e.preventDefault();
          const r = ref.current.getBoundingClientRect();
          setDrag({ offX: e.clientX - r.left - r.width / 2, offY: e.clientY - r.top - r.height / 2 });
        }}>
        <Ladybug size={size} />
      </div>
    </div>
  );
}

// ---- 宠物垫子（固定位置，独立 state，像浮板一样是布景元素）----
//   胡桃木棕 family（#C4A278→#9A7F5C）与浮板同饱和度同色相，不抢不突兀。
//   形状 = 圆角矩形；厚 = 木板三明治结构（上亮→面→下暗）+ 一层木纹纹理；
//   缝线 = 一圈浅色虚线，是"软垫"而非"木板"的唯一语义标记。
function PetCushion({ left, top, width, height }) {
  return (
    <div className="absolute pointer-events-none"
      style={{
        left: `${left}%`, top: `${top}%`,
        width: `${width}%`, height: `${height}%`,
        zIndex: 5,
        transform: 'translate(-50%, 0)',
      }}>
      <svg width="100%" height="100%" viewBox="0 0 1000 100" preserveAspectRatio="none"
        style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <linearGradient id="pcush_top" x1="0.5" y1="0" x2="0.5" y2="1">
            <stop offset="0" stopColor="#D4B48C" />   {/* 上高光 */}
            <stop offset="0.35" stopColor="#C4A278" /> {/* 面 */}
            <stop offset="1" stopColor="#9A7F5C" />    {/* 下暗 */}
          </linearGradient>
          <filter id="pcush_shadow" x="-5%" y="-20%" width="110%" height="160%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
        </defs>
        {/* 接地柔影：胡桃木同色系 */}
        <rect x="2%" y="78%" width="96%" height="20%" rx="16" ry="8"
          fill="#8B6B4F" opacity="0.22" filter="url(#pcush_shadow)" />
        {/* 垫面本体 */}
        <rect x="0" y="0" width="1000" height="100" rx="28" ry="28" fill="url(#pcush_top)" />
        {/* 上缘高光条 */}
        <rect x="3%" y="2%" width="94%" height="30%" rx="20" ry="12" fill="rgba(255,245,225,0.38)" />
        {/* 内圈缝线：米黄虚线 — 软垫唯一语义标记 */}
        <rect x="6%" y="6%" width="88%" height="88%" rx="22" ry="22"
          fill="none" stroke="#E8D5B5" strokeWidth="2.6" strokeDasharray="9 6" opacity="0.9" />
      </svg>
    </div>
  );
}

// ---- 可拖拽 + 可缩放的宠物（本体，不含垫子）----
//   与蜜蜂/蝴蝶同一套拖拽逻辑；呼吸动画拖动/缩放期间暂停。
//   选中时显示四角绿色缩放手柄（与植物手柄同款）。
function PetDrop({ id, imgSrc, pos, size, onPosChange, onSizeChange, selected, onSelect }) {
  const ref = useRef(null);
  const [drag, setDrag] = useState(null);
  const [resize, setResize] = useState(null);

  useEffect(() => {
    if (!drag) return;
    const onMove = (e) => {
      const canvas = ref.current?.closest('.planting-shelf-wrap > div');
      if (!canvas) return;
      const r = canvas.getBoundingClientRect();
      const l = Math.max(0, Math.min(100, ((e.clientX - r.left - drag.offX) / r.width) * 100));
      const t = Math.max(0, Math.min(100, ((e.clientY - r.top - drag.offY) / r.height) * 100));
      onPosChange({ left: `${l.toFixed(1)}%`, top: `${t.toFixed(1)}%` });
    };
    const onUp = () => setDrag(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [drag, onPosChange]);

  const onResizeMouseDown = (e) => {
    e.preventDefault(); e.stopPropagation();
    const box = ref.current;
    if (!box) return;
    const r = box.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const startSize = size;
    const startDist = Math.hypot(e.clientX - cx, e.clientY - cy) || 1;
    const onMove = (ev) => {
      const d = Math.hypot(ev.clientX - cx, ev.clientY - cy);
      // size 单位是像素（默认 ~100px），下限 40px（迷你），上限 320px（巨型）
      const ns = Math.max(40, Math.min(320, Math.round(startSize * (d / startDist))));
      onSizeChange(Math.round(ns));
    };
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); setResize(null); };
    setResize(id);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div className="absolute"
      style={{ left: pos.left, top: pos.top, zIndex: selected ? 7 : 6, transform: 'translate(-50%,-50%)' }}>
      <div ref={ref} className="relative cursor-grab active:cursor-grabbing select-none"
        onMouseDown={(e) => {
          e.stopPropagation(); e.preventDefault(); onSelect?.();
          const r = ref.current.getBoundingClientRect();
          setDrag({ offX: e.clientX - r.left - r.width / 2, offY: e.clientY - r.top - r.height / 2 });
        }}
        onClick={(e) => { e.stopPropagation(); onSelect?.(); }}>
        {/* 呼吸起伏（拖动/缩放时暂停） */}
        <div className="cat-breathe relative" style={{ animationPlayState: drag || resize ? 'paused' : 'running' }}>
          <img src={imgSrc} alt="" width={size} draggable={false}
            style={{ display: 'block', userSelect: 'none', pointerEvents: 'none' }} />
        </div>
        {/* 选中时的四角缩放手柄 */}
        {selected && resize !== id && (
          <>
            {[['-top-1.5 -left-1.5', 'nwse-resize'], ['-top-1.5 -right-1.5', 'nesw-resize'],
              ['-bottom-1.5 -left-1.5', 'nesw-resize'], ['-bottom-1.5 -right-1.5', 'nwse-resize']].map(([pos, cur]) => (
              <div key={pos} className={`absolute ${pos} w-2.5 h-2.5 rounded-full`}
                style={{ background: 'var(--surface-card)', border: '2px solid #238E3F', boxShadow: '0 1px 4px rgba(0,0,0,0.25)', cursor: cur }}
                onMouseDown={onResizeMouseDown} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================
// 养护动作：语义色 + 图标（统一 24×24 视框 / 2px 圆头描边）
//   图标选型（Lucide 线宽 2 与原库一致；换盆为自绘花盆，同规格）：
//     · 浇水 = droplets（交叠水滴）—— 比单滴更明确「水」，且是 Lucide 原生字形
//     · 施肥 = flask-conical（锥形瓶）—— 与「打药」的喷雾罐区分开：一个补营养、一个除虫
//     · 打药 = spray-can / 拍照 = camera / 修剪 = scissors
//     · 换盆 = 花盆带苗（陶土色）—— 盆沿 + 收边盆身 + 双叶新苗，自绘保持同线宽
//     · 小体积（12–15px）细线易发灰 → 配同色 chip 圆角底承载，是小尺寸辨识度的主要手段
//   语义色：水=蓝、肥=土棕、药=紫、拍照=主绿、修剪=红、换盆=陶土橙（色相互错，一眼可辨）
// ============================================================
const ACTIONS = {
  water:     { label: '浇水', color: '#2E86DE', soft: 'rgba(46,134,222,0.10)' },
  fertilize: { label: '施肥', color: '#8B6B4F', soft: 'rgba(139,107,79,0.10)' },
  spray:     { label: '打药', color: '#7E57C2', soft: 'rgba(126,87,194,0.10)' },
  photo:     { label: '拍照', color: '#238E3F', soft: 'rgba(35,142,63,0.10)' },
  prune:     { label: '修剪', color: '#CF5A55', soft: 'rgba(207,90,85,0.10)' },
  repot:     { label: '换盆', color: '#C46A2B', soft: 'rgba(196,106,43,0.10)' },
};
// 界面里启用的动作（与后端 CARE_KINDS 对齐）
const ACTION_KINDS = ['water', 'fertilize', 'spray', 'photo', 'prune', 'repot'];

const ACTION_PATHS = {
  // Lucide droplets
  water: (<>
    <path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z" />
    <path d="M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97" />
  </>),
  // Lucide flask-conical
  fertilize: (<>
    <path d="M14 2v6a2 2 0 0 0 .245.96l5.51 10.08A2 2 0 0 1 18 22H6a2 2 0 0 1-1.755-2.96l5.51-10.08A2 2 0 0 0 10 8V2" />
    <path d="M6.453 15h11.094" />
    <path d="M8.5 2h7" />
  </>),
  // Lucide spray-can
  spray: (<>
    <path d="M3 3h.01" /><path d="M7 5h.01" /><path d="M11 7h.01" /><path d="M3 7h.01" /><path d="M7 9h.01" /><path d="M3 11h.01" />
    <rect width="4" height="4" x="15" y="5" />
    <path d="m19 9 2 2v10c0 .6-.4 1-1 1h-6c-.6 0-1-.4-1-1V11l2-2" />
    <path d="m13 14 8-2" /><path d="m13 19 8-2" />
  </>),
  // Lucide camera
  photo: (<>
    <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
    <circle cx="12" cy="13" r="3" />
  </>),
  // Lucide scissors
  prune: (<>
    <circle cx="6" cy="6" r="3" /><path d="M8.12 8.12 12 12" /><path d="M20 4 8.12 15.88" /><circle cx="6" cy="18" r="3" /><path d="M14.8 14.8 20 20" />
  </>),
  // 花盆带苗（自绘，Lucide 规格）：盆沿 + 收边盆身 + 双叶新苗
  repot: (<>
    <path d="M5 9h14" />
    <path d="M5 9v3M19 9v3" />
    <path d="M6.5 12h11l-1.1 6.5a2.4 2.4 0 0 1-2.4 2h-4a2.4 2.4 0 0 1-2.4-2z" />
    <path d="M12 9V6.5" />
    <path d="M12 6.5c0-2 1.6-3.5 3.6-3.5 0 2-1.6 3.5-3.6 3.5z" />
    <path d="M12 6.5c0-2-1.6-3.5-3.6-3.5 0 2 1.6 3.5 3.6 3.5z" />
  </>),
};

// color 可覆盖描边色：实底按钮上（如快捷记录条）需要白色描边，其余沿用动作语义色
function ActionIcon({ kind, size = 16, color }) {
  const a = ACTIONS[kind];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color || (a ? a.color : 'currentColor')} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false">{ACTION_PATHS[kind]}</svg>
  );
}

// 动作 chip：同色 8% 底 + 图标（小尺寸下的主要辨识手段）
function ActionChip({ kind, size = 20, iconSize = 13, title }) {
  const a = ACTIONS[kind];
  if (!a) return null;
  return (
    <span className="inline-grid place-items-center flex-shrink-0" title={title || a.label}
      style={{ width: size, height: size, borderRadius: 6, background: a.soft }}>
      <ActionIcon kind={kind} size={iconSize} />
    </span>
  );
}

// 视图切换图标（花架 / 网格 / 列表）
function ViewIcon({ id, size = 14 }) {
  const paths = {
    shelf: (<>
      <path d="M12 10a6 6 0 0 0-6-6H3v2a6 6 0 0 0 6 6h3" />
      <path d="M12 14a6 6 0 0 1 6-6h3v1a6 6 0 0 1-6 6h-3" />
      <path d="M12 20V10" />
    </>),
    grid: (<>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
    </>),
    list: (<>
      <path d="M3 6h.01M3 12h.01M3 18h.01" />
      <path d="M8 6h13M8 12h13M8 18h13" />
    </>),
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[id]}</svg>
  );
}

// ---- 时间戳：'YYYY-MM-DD HH:mm'（与后端 normHappenedAt 同格式，可直接字符串排序）----
function nowStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
const stampDate = (s) => String(s || '').slice(0, 10);
const stampTime = (s) => String(s || '').slice(11, 16);

// 距上次养护的天数（无记录 / 非法值 → Infinity）
function daysSince(dateStr) {
  if (!dateStr) return Infinity;
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const d = new Date(dateStr); d.setHours(0, 0, 0, 0);
  if (Number.isNaN(d.getTime())) return Infinity;
  return Math.round((t - d) / 86400000);
}

// 下一次该做的动作：浇水 / 施肥里「剩余天数」更小者（无记录的一类排在后面）
function nextCare(plant) {
  const mk = (kind, last, cycle) => {
    const d = daysSince(last);
    return { kind, cycle, remain: Number.isFinite(d) ? cycle - d : null };
  };
  const w = mk('water', plant.last_watered, plant.water_cycle_days || 7);
  const f = mk('fertilize', plant.last_fertilized, plant.fert_cycle_days || 30);
  const cand = [w, f].filter((x) => x.remain !== null);
  if (!cand.length) return w;
  cand.sort((a, b) => a.remain - b.remain);
  return cand[0];
}

// 剩余天数 → 文案（与 careStatus 同口径）
function remainText(remain) {
  if (remain === null) return '暂无记录';
  if (remain < 0) return `超期 ${-remain} 天`;
  if (remain === 0) return '今天';
  if (remain === 1) return '明天';
  if (remain === 2) return '后天';
  return `${remain} 天后`;
}

// 相对日：今天 / 昨天 / N 天前
function relativeDay(dateStr) {
  const d = daysSince(dateStr);
  if (!Number.isFinite(d)) return '';
  if (d === 0) return '今天';
  if (d === 1) return '昨天';
  if (d === 2) return '前天';
  return `${d} 天前`;
}

// 列表 / 网格里按「紧急度」升序（无记录的排最后）
function sortByUrgency(list) {
  return [...list].sort((a, b) => {
    const ra = nextCare(a).remain, rb = nextCare(b).remain;
    if (ra === null && rb === null) return 0;
    if (ra === null) return 1;
    if (rb === null) return -1;
    return ra - rb;
  });
}

// ---- 紧急度：下一次该做的动作 + 文案 + 配色（网格 / 列表共用）----
// 越临期越暖：今天/超期用告警色，未到期沿用该动作的语义色，无记录回灰
function urgencyPill(plant) {
  const n = nextCare(plant);
  const a = ACTIONS[n.kind] || ACTIONS.water;
  const remain = n.remain;
  if (remain === null) {
    return { ...n, a, color: 'var(--text-3)', bg: 'rgba(120,120,128,0.10)', text: '暂无记录', ratio: 0 };
  }
  const ratio = Math.max(0, Math.min(1, (n.cycle - remain) / (n.cycle || 1)));
  if (remain < 0) return { ...n, a, color: 'var(--danger)', bg: 'rgba(var(--danger-rgb),0.10)', text: `超期 ${-remain} 天`, ratio };
  if (remain === 0) return { ...n, a, color: 'var(--warning)', bg: 'rgba(217,154,43,0.14)', text: '今天', ratio };
  return { ...n, a, color: a.color, bg: a.soft, text: `${remain} 天后`, ratio };
}

// 网格视图：卡片墙，默认按「离该浇水还有几天」升序（越急越靠前）；
// 不显示摆放位置与装饰物 —— 这里回答的是「谁该浇水了」
function GridView({ plants, onOpen }) {
  const list = sortByUrgency(plants);
  return (
    <div className="absolute inset-0 overflow-y-auto" style={{ zIndex: 2, padding: '56px 16px 16px' }}>
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(128px, 1fr))' }}>
        {list.map((p) => {
          const u = urgencyPill(p);
          return (
            <button key={p.id} onClick={() => onOpen(p)}
              className="text-left rounded-2xl overflow-hidden transition active:scale-[0.98]"
              style={{ background: 'var(--surface-card)', border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
              <div className="aspect-square grid place-items-center" style={{ background: 'rgba(35,142,63,0.045)' }}>
                {p.image
                  ? <img src={p.image} alt="" className="w-[74%] h-[74%] object-contain" draggable={false} />
                  : <span className="w-9 h-9 rounded-full" style={{ background: 'rgba(35,142,63,0.12)' }} />}
              </div>
              <div className="px-2.5 pt-2 pb-2.5">
                <div className="text-[13px] font-semibold truncate" style={{ color: 'var(--text-1)' }}>{p.name || '未命名'}</div>
                <div className="mt-1.5 mb-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold"
                  style={{ color: u.color, background: u.bg }}>
                  <ActionIcon kind={u.kind} size={11} color={u.color} />{u.text}
                </div>
                <div className="h-[3px] rounded-full overflow-hidden" style={{ background: 'rgba(120,120,128,0.14)' }}>
                  <i className="block h-full rounded-full transition-all"
                    style={{ width: `${Math.round(u.ratio * 100)}%`, background: u.color }} />
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// 列表视图：紧凑单行，字段全露出，右侧直接给动作按钮 —— 回答「每株的周期各是多少」
function ListView({ plants, onOpen, onQuick }) {
  const list = sortByUrgency(plants);
  return (
    <div className="absolute inset-0 overflow-y-auto" style={{ zIndex: 2, padding: '56px 16px 16px' }}>
      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface-card)', border: '1px solid rgba(0,0,0,0.06)' }}>
        {list.map((p, i) => {
          const u = urgencyPill(p);
          const last = u.kind === 'water' ? p.last_watered : p.last_fertilized;
          const since = daysSince(last);
          return (
            <div key={p.id} className="flex items-center gap-2.5 px-3 py-2.5"
              style={{ borderTop: i ? '1px solid rgba(0,0,0,0.05)' : 'none' }}>
              <button onClick={() => onOpen(p)} className="flex items-center gap-2.5 flex-1 min-w-0 text-left">
                <span className="w-9 h-9 rounded-lg grid place-items-center flex-shrink-0" style={{ background: 'rgba(35,142,63,0.06)' }}>
                  {p.image
                    ? <img src={p.image} alt="" className="w-7 h-7 object-contain" draggable={false} />
                    : <span className="w-5 h-5 rounded-full" style={{ background: 'rgba(35,142,63,0.14)' }} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="text-[13px] font-semibold truncate" style={{ color: 'var(--text-1)' }}>{p.name || '未命名'}</span>
                    <span className="flex-shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold"
                      style={{ color: u.color, background: u.bg }}>
                      <ActionIcon kind={u.kind} size={11} color={u.color} />{u.text}
                    </span>
                  </span>
                  <span className="mt-0.5 flex items-center gap-2 text-[11px] min-w-0" style={{ color: 'var(--text-3)' }}>
                    {p.traits ? <span className="truncate">{p.traits}</span> : null}
                    <span className="tabular-nums flex-shrink-0">
                      {Number.isFinite(since) ? `上次${u.a.label} ${relativeDay(last)}` : `暂无${u.a.label}记录`}
                    </span>
                  </span>
                </span>
              </button>
              <button onClick={() => onQuick(p, u.kind)}
                className="flex-shrink-0 px-2.5 py-1.5 rounded-lg text-[11.5px] font-semibold transition active:scale-95"
                style={{ color: u.a.color, background: u.a.soft }}>
                {u.a.label}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function PlantingShelf({ onCountChange, addSignal = 0, onAddConsumed }) {
  const toast = useToast();
  // 触摸端长按植物 → 与右键同：打开信息编辑面板
  const lp = useLongPress();
  const [plants, setPlants] = useState([]);
  const [loading, setLoading] = useState(true);
  // 加载完成后把 plants 数量同步给父组件（LifeView 的左侧分类计数）
  useEffect(() => {
    if (typeof onCountChange === 'function') onCountChange(plants.length);
  }, [plants.length, onCountChange]);
  const [selected, setSelected] = useState(null);
  const [selectedPetId, setSelectedPetId] = useState(null); // 宠物选中：cat / corgi / null
  const [dragging, setDragging] = useState(null);
  const [resizing, setResizing] = useState(null);
  // 自动保存反馈：成功短暂轻提示，失败醒目提示
  const [saveToast, setSaveToast] = useState(null);
  // 花架加载错误：API 挂/超时/网络异常
  const [loadErr, setLoadErr] = useState(null);
  const [showInfo, setShowInfo] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  // 归档箱：只在打开时拉取（不进首屏请求）；已归档植物不在花架显示，可随时恢复
  const [showArchive, setShowArchive] = useState(false);
  const [archived, setArchived] = useState([]);
  const [archivedLoading, setArchivedLoading] = useState(false);
  const settingsRef = useRef(null);
  const addRef = useRef(null);
  const infoRef = useRef(null);
  const archiveRef = useRef(null);
  // 顶部栏「纵向三点」菜单：添加植物 / 归档植物 / 花架设置 三个入口收进这里
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const [confirmArchive, setConfirmArchive] = useState(null); // 待归档的植物 id
  // 托板：选中（显示手柄/删除）× 拖拽中
  const [selectedBoard, setSelectedBoard] = useState(null);
  const [boardDragging, setBoardDragging] = useState(null);
  const [settings, setSettings] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('planting_shelf_settings')) || {};
    } catch { return {}; }
  });
  // 悬浮托板：由 settings.boards 派生，写入时显式落库（旧数据经 resolveBoards 迁移）
  const boards = useMemo(() => resolveBoards(settings), [settings]);
  const setBoards = useCallback((updater) => {
    setSettings(st => {
      const cur = resolveBoards(st);
      const next = typeof updater === 'function' ? updater(cur) : updater;
      return { ...st, boards: next };
    });
  }, []);
  // 托板默认色板：把「当前这几块的颜色」记为默认色（新托板沿用 + 「恢复托板颜色」还原）
  const boardPalette = Array.isArray(settings.board_default_colors) && settings.board_default_colors.length
    ? settings.board_default_colors : DEFAULT_BOARD_COLORS;
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const bgInputRef = useRef(null);
  const dragOffset = useRef({ dx: 0, dy: 0 });
  const zCounter = useRef(1);
  const draggingRef = useRef(null);
  const plantsRef = useRef([]);
  // 「添加植物」面板：右上角 + / 拖图到画布 / 左侧「种植」行 + 都打开它
  const [addOpen, setAddOpen] = useState(false);
  const [addDraft, setAddDraft] = useState({ name: '', image: '' });
  const [addBusy, setAddBusy] = useState(false);
  const openAdd = useCallback((image = '') => {
    setAddDraft({ name: '', image });
    setAddOpen(true);
  }, []);
  // 左侧「种植」行 + 触发：父组件把信号 +1，这里打开面板（用完即回 0）
  const addFiredRef = useRef(false);
  useEffect(() => {
    if (addSignal > 0 && !addFiredRef.current) {
      addFiredRef.current = true;
      openAdd();
      if (typeof onAddConsumed === 'function') onAddConsumed();
    } else if (addSignal === 0) {
      addFiredRef.current = false;
    }
  }, [addSignal, onAddConsumed, openAdd]);
  useEffect(() => { draggingRef.current = dragging; }, [dragging]);
  useEffect(() => { plantsRef.current = plants; }, [plants]);
  // toast 自动消失
  useEffect(() => {
    if (!saveToast) return;
    const t = setTimeout(() => setSaveToast(null), saveToast.type === 'ok' ? 1400 : 3500);
    return () => clearTimeout(t);
  }, [saveToast]);
  const notifySaved = (msg) => setSaveToast({ type: 'ok', msg });
  const notifySaveFail = (msg) => setSaveToast({ type: 'fail', msg });
  // settings 持久化
  useEffect(() => { localStorage.setItem('planting_shelf_settings', JSON.stringify(settings)); }, [settings]);

  // ---- 视图切换（花架 / 网格 / 列表）：三视图共用同一份数据，仅呈现方式不同；
  //      选择存进 settings（localStorage），下次打开保持上次的选择 ----
  const view = settings.view_mode || 'shelf';
  const setView = useCallback((v) => setSettings(st => ({ ...st, view_mode: v })), []);

  // ---- 悬浮托板几何 / 默认位置 ----
  const clampN = (v, a, b) => Math.max(a, Math.min(b, v));

  // 布局结果写回状态，仅返回真正变更的项（避免无谓写库）
  function commitLayout(positions) {
    const changed = positions.filter(pos => {
      const p = plantsRef.current.find(x => x.id === pos.id);
      return p && (Math.abs(p.pos_x - pos.pos_x) > 0.05 || Math.abs(p.pos_y - pos.pos_y) > 0.05);
    });
    if (!changed.length) return [];
    setPlants(prev => prev.map(p => {
      const c = changed.find(x => x.id === p.id);
      return c ? { ...p, pos_x: c.pos_x, pos_y: c.pos_y } : p;
    }));
    return changed;
  }

  function persistPositions(changed, msg) {
    Promise.all(changed.map(c => API.plants.update(c.id, { pos_x: c.pos_x, pos_y: c.pos_y })))
      .then(() => notifySaved(msg || '位置已保存'))
      .catch(() => notifySaveFail('位置保存失败，刷新后可能回退'));
  }

  // 一键整理植物：把每株植物搬回「设为默认」时记录的位置（手动触发；平时不自动干预）
  function restoreDefault() {
    const map = settings.plant_default_pos || {};
    const positions = [];
    for (const p of plantsRef.current) {
      const d = map[p.id];
      if (d) positions.push({ id: p.id, pos_x: d.x, pos_y: d.y });
    }
    const changed = commitLayout(positions);
    if (changed.length) persistPositions(changed, '已一键整理');
    else toast.info('已在默认位置');
  }

  // 首次见到某株植物：把它的当前位置记为「默认位置」（只补缺，不覆盖；之后拖动不影响默认值）
  useEffect(() => {
    if (!plants.length) return;
    setSettings(prev => {
      const map = prev.plant_default_pos || {};
      let changed = false;
      const next = { ...map };
      for (const p of plants) {
        if (!next[p.id]) { next[p.id] = { x: p.pos_x, y: p.pos_y }; changed = true; }
      }
      return changed ? { ...prev, plant_default_pos: next } : prev;
    });
  }, [plants]);

  // 首次见到托板：把这几块的颜色记为「默认色板」（只补缺，不覆盖）
  useEffect(() => {
    if (!boards.length) return;
    setSettings(prev => {
      if (Array.isArray(prev.board_default_colors) && prev.board_default_colors.length) return prev;
      return { ...prev, board_default_colors: boards.map(b => b.color) };
    });
  }, [boards]);

  // 首次加载：把 boards 落地进 settings（旧数据从 layer_colors 迁移几何），只做一次
  //   注意：不自动移动植物 —— 植物位置完全由用户决定
  const migratedRef = useRef(false);
  useEffect(() => {
    if (migratedRef.current) return;
    migratedRef.current = true;
    setSettings(prev => (Array.isArray(prev.boards) && prev.boards.length ? prev : { ...prev, boards: resolveBoards(prev) }));
  }, []);

  // ---- 托板交互：拖动移动 / 快捷增删改 ----
  const onBoardMouseDown = (e, b) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    setSelectedBoard(b.id);
    setSelected(null);
    setShowInfo(false);
    const r = canvasRef.current?.getBoundingClientRect();
    if (!r) return;
    const sx = e.clientX, sy = e.clientY, bx = b.x, by = b.y, bw = b.w;
    let moved = false;
    setBoardDragging(b.id);
    const onMove = (ev) => {
      const dx = ((ev.clientX - sx) / r.width) * 100;
      const dy = ((ev.clientY - sy) / r.height) * 100;
      if (Math.abs(dx) > 0.4 || Math.abs(dy) > 0.4) moved = true;
      setBoards(list => list.map(x => x.id === b.id
        ? { ...x, x: clampN(bx + dx, 1, 99 - bw), y: clampN(by + dy, 2, 95) }
        : x));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setBoardDragging(null);
      if (moved) notifySaved('托板位置已保存');
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const nudgeBoardWidth = (id, delta) => {
    setBoards(list => list.map(b => {
      if (b.id !== id) return b;
      const w = clampN(b.w + delta, 16, 72);
      return { ...b, w, x: Math.min(b.x, 100 - w - 1) };
    }));
  };

  const setBoardColor = (id, color) => setBoards(list => list.map(b => (b.id === id ? { ...b, color } : b)));

  const removeBoard = (id) => {
    setBoards(list => (list.length <= 1 ? list : list.filter(b => b.id !== id)));
    setSelectedBoard(null);
  };

  const addBoard = () => {
    const id = 'bd' + uid();
    setBoards(list => (list.length >= MAX_BOARDS ? list : [...list, { id, ...nextBoardSlot(list, boardPalette) }]));
    setSelectedBoard(id);
  };

  // 老图自动瘦身（自愈）：压缩功能上线前的大图（>400KB base64）首次加载后
  // 客户端 canvas 压成 WebP 存回 → image_ver+1 → URL 更新，之后每次打开都快。
  // 失败静默，下次打开再试；只补丁 image/image_ver 两字段，不覆盖并发中的位置编辑
  async function optimizeIfBig(id, image) {
    try {
      if (!image || image.length < 400 * 1024) return;
      const out = await compressDataUrl(image, 480);
      if (!out || out.length >= image.length * 0.7) return;
      const { plant } = await API.plants.update(id, { image: out });
      if (plant?.image) {
        setPlants(prev => prev.map(q => q.id === id ? { ...q, image: plant.image, image_ver: plant.image_ver || 0 } : q));
        notifySaved('图片已自动瘦身');
      }
    } catch { /* 静默：下次打开再试 */ }
  }

  // 加载植物列表：元数据先行（几 KB，花架结构秒出），图片并行补载（浏览器缓存 7 天）
  const loadPlants = useCallback(async () => {
    setLoadErr(null);
    try {
      const res = await API.plants.list();
      const list = res?.plants || [];
      setPlants(list);
      // 更新 zCounter 为最大 z_index + 1
      const maxZ = list.reduce((mx, p) => Math.max(mx, p.z_index || 0), 0);
      zCounter.current = maxZ + 1;
      // 图片懒加载：每株单独拉（URL 带 image_ver，命中浏览器缓存时零网络）
      list.filter(p => p.has_image && !p.image).forEach(p => {
        API.plants.image(p.id, p.image_ver).then(r => {
          if (!r?.image) return;
          setPlants(prev => prev.map(q => q.id === p.id ? { ...q, image: r.image } : q));
          optimizeIfBig(p.id, r.image);
        }).catch(() => { /* 单株失败不影响其他 */ });
      });
    } catch (e) {
      setLoadErr(e?.message || '花架加载失败，请检查网络后刷新');
      setPlants([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadPlants(); }, [loadPlants]);

  // ---- 文件上传（跳过 upload 校验接口，base64 直接 create；入库前 canvas 压缩）----
  // 读取 + 压缩一张图片 → dataUrl（校验失败返回 null，不创建任何东西）
  const prepareImage = useCallback(async (file) => {
    if (!file || !file.type.startsWith('image/')) return null;
    if (file.size > 8 * 1024 * 1024) { toast.warn('图片不能超过 8MB'); return null; }
    // 转 base64
    const reader = new FileReader();
    let dataUrl;
    try {
      dataUrl = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    } catch (e) { toast.error('读取图片失败'); return null; }
    // 压缩（480px + WebP 保透明）：新图从源头就小，加载快
    dataUrl = await compressDataUrl(dataUrl, 480);
    if (dataUrl.length > 3 * 1024 * 1024) { toast.warn('图片过大，请换一张'); return null; }
    return dataUrl;
  }, [toast]);

  const onFileInputChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const dataUrl = await prepareImage(file);
    if (dataUrl) setAddDraft(d => ({ ...d, image: dataUrl }));
  };

  // 「添加植物」面板确认：按草稿创建植物（默认落在画布中上部）
  const confirmAdd = async () => {
    if (!addDraft.image) { toast.warn('请先选择植物图片'); return; }
    const z = zCounter.current++;
    setAddBusy(true);
    try {
      const { plant } = await API.plants.create({
        name: addDraft.name.trim() || '新植物',
        image: addDraft.image,
        pos_x: 50,
        pos_y: 30,
        z_index: z,
        planted_at: new Date().toISOString().slice(0, 10),
        water_cycle_days: 7,
        last_watered: new Date().toISOString().slice(0, 10),
      });
      setPlants(prev => [...prev, plant]);
      setAddOpen(false);
      setSelected(plant);
      setShowInfo(true);
    } catch (e) {
      toast.error('添加植物失败: ' + e.message + '\n请确认 Cloudflare Pages Functions 已部署最新版本');
    } finally {
      setAddBusy(false);
    }
  };

  // ---- 拖拽逻辑 ----
  const hasMovedRef = useRef(false);
  const onPlantMouseDown = (e, plant) => {
    if (e.button !== 0) return; // 只响应左键
    e.preventDefault();
    setSelected(plant); // 左键点选 → 显示四角缩放手柄
    setSelectedBoard(null);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = (plant.pos_x / 100) * rect.width;
    const py = (plant.pos_y / 100) * rect.height;
    dragOffset.current = { dx: e.clientX - rect.left - px, dy: e.clientY - rect.top - py };
    hasMovedRef.current = false;
    setDragging(plant.id);
    // 置顶
    const newZ = zCounter.current++;
    API.plants.update(plant.id, { z_index: newZ }).catch(() => {});
    setPlants(prev => prev.map(p => p.id === plant.id ? { ...p, z_index: newZ } : p));
  };

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = Math.max(0, Math.min(100, ((e.clientX - rect.left - dragOffset.current.dx) / rect.width) * 100));
      const y = Math.max(0, Math.min(100, ((e.clientY - rect.top - dragOffset.current.dy) / rect.height) * 100));
      const id = draggingRef.current;
      if (id) {
        hasMovedRef.current = true;
        setPlants(prev => prev.map(p => p.id === id ? { ...p, pos_x: x, pos_y: y } : p));
      }
    };
    const onUp = () => {
      const id = draggingRef.current;
      // 松手就地保存位置（没移动则跳过，避免无效写库）；不做任何吸附/重排
      if (id && hasMovedRef.current) {
        const plant = plantsRef.current.find(p => p.id === id);
        if (plant) {
          API.plants.update(id, { pos_x: plant.pos_x, pos_y: plant.pos_y })
            .then(() => notifySaved('位置已保存'))
            .catch(() => notifySaveFail('位置保存失败，刷新后可能回退'));
        }
      }
      setDragging(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [dragging]);

  // ---- 四角拉伸缩放（以植物中心为锚点，对角拖动等比缩放 0.4-2.5 倍）----
  const onResizeMouseDown = (e, plant) => {
    e.preventDefault();
    e.stopPropagation();
    const box = e.currentTarget.parentElement;
    if (!box) return;
    const r = box.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const startScale = plant.size || 1;
    const startDist = Math.hypot(e.clientX - cx, e.clientY - cy) || 1;
    let moved = false;
    setResizing(plant.id);
    const onMove = (ev) => {
      const d = Math.hypot(ev.clientX - cx, ev.clientY - cy);
      const ns = Math.max(0.4, Math.min(2.5, startScale * (d / startDist)));
      moved = true;
      setPlants(prev => prev.map(p => p.id === plant.id ? { ...p, size: ns } : p));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setResizing(null);
      if (moved) {
        const p = plantsRef.current.find(p => p.id === plant.id);
        if (p) {
          API.plants.update(p.id, { size: p.size })
            .then(() => notifySaved('大小已保存'))
            .catch(() => notifySaveFail('大小保存失败，刷新后可能回退'));
        }
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // ---- 右键信息面板 ----
  const onPlantContextMenu = (e, plant) => {
    e.preventDefault();
    e.stopPropagation();
    setSelected(plant);
    setShowInfo(true);
  };

  // ---- 保存植物信息 ----
  const savePlant = async (data) => {
    if (!selected) return;
    try {
      const { plant } = await API.plants.update(selected.id, data);
      setPlants(prev => prev.map(p => p.id === selected.id ? plant : p));
      setSelected(plant);
    } catch (e) { toast.error('保存失败: ' + e.message); }
  };

  // ---- 归档植物（不再硬删）：写 archived_at → 从花架移出，养护记录完整保留 ----
  const doArchivePlant = async (id) => {
    try {
      await API.plants.archive(id, nowStamp());
      setPlants(prev => prev.filter(p => p.id !== id));
      setShowInfo(false);
      setSelected(null);
      toast.success('已归档，可在右上角「更多」→「归档植物」中恢复');
    } catch (e) { toast.error('归档失败: ' + e.message); }
  };

  const archivePlant = (id) => {
    setConfirmArchive(id);
  };

  // ---- 归档箱：打开时才拉取（元数据先行，图片并行补载，与花架同套路）----
  const loadArchived = useCallback(async () => {
    setArchivedLoading(true);
    try {
      const res = await API.plants.list(true);
      const list = res?.plants || [];
      setArchived(list);
      list.filter(p => p.has_image && !p.image).forEach(p => {
        API.plants.image(p.id, p.image_ver).then(r => {
          if (!r?.image) return;
          setArchived(prev => prev.map(q => q.id === p.id ? { ...q, image: r.image } : q));
        }).catch(() => { /* 单株失败不影响其他 */ });
      });
    } catch (e) {
      toast.error('归档加载失败: ' + e.message);
    } finally { setArchivedLoading(false); }
  }, [toast]);

  const openArchive = useCallback(() => { setShowArchive(true); loadArchived(); }, [loadArchived]);

  // ---- 恢复：清空 archived_at → 回到花架（接口回传整株，含图片，直接挂上）----
  const restorePlant = useCallback(async (id) => {
    try {
      const { plant } = await API.plants.restore(id);
      setArchived(prev => prev.filter(p => p.id !== id));
      if (plant) {
        setPlants(prev => [...prev, plant]);
        zCounter.current = Math.max(zCounter.current, (plant.z_index || 0) + 1);
      }
      toast.success('已恢复');
    } catch (e) { toast.error('恢复失败: ' + e.message); }
  }, [toast]);

  // 养护记录写入后，后端回传更新过的植物（last_* 派生缓存已按记录重算）→ 同步进列表与抽屉快照
  const patchPlant = useCallback((updated) => {
    if (!updated || !updated.id) return;
    setPlants(prev => prev.map(p => (p.id === updated.id ? { ...p, ...updated } : p)));
    setSelected(prev => (prev && prev.id === updated.id ? { ...prev, ...updated } : prev));
  }, []);

  // 网格 / 列表视图的「一键记录」：直接建一条记录（= 打卡），派生缓存随之更新
  const quickRecord = useCallback(async (plant, kind) => {
    try {
      const { plant: updated } = await API.plants.careLogCreate({ plant_id: plant.id, kind, happened_at: nowStamp() });
      patchPlant(updated);
      toast.success(`${(ACTIONS[kind] || {}).label || '养护'}已记录`);
    } catch (e) {
      toast.error('记录失败: ' + e.message);
    }
  }, [patchPlant, toast]);

  // ---- 画布拖拽上传（拖图到画布 → 用该图预置「添加植物」面板）----
  const onCanvasDragOver = (e) => { e.preventDefault(); };
  const onCanvasDrop = async (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const dataUrl = await prepareImage(file);
      if (dataUrl) openAdd(dataUrl);
    }
  };

  // 画布点击（空白处）：取消选中植物（隐藏缩放/托板手柄）+ 取消宠物选中 + 关闭信息面板
  const onCanvasClick = () => {
    setSelected(null);
    setSelectedPetId(null);
    setSelectedBoard(null);
    setShowInfo(false);
  };

  // 悬浮面板：点面板之外的任意地方都能关闭（顶部栏、画布、植物、托板、页面空白都算外部）。
  // 信息面板 / 设置面板 / 「添加植物」面板 / 归档箱 / 顶部栏「纵向三点」菜单共用这一套判定：
  // 前四者在花架里互斥（打开一个会先关掉另一个），菜单是瞬时控件，点外部即收。
  // 面板自身内部的点击不算（含滑杆拖动、取色、上传、名称输入、时间轴、编辑记录），
  // 面板外各处理函数又普遍 stopPropagation，所以放在捕获阶段监听，冒泡阶段会被它们拦掉。
  // 这正是网格 / 列表视图下信息面板此前关不掉的原因：那两个视图没有画布点击兜底，
  // 而信息面板当时没接入这套判定（只有设置 / 添加两个面板接了）。
  // 删除记录 / 归档确认弹窗虽然渲染在面板之外，但它是从面板里弹出来的——弹窗打开期间停用监听，
  // 否则点弹窗会把后面的面板一起关掉。
  useEffect(() => {
    if (confirmArchive != null) return;
    if (!showSettings && !addOpen && !showInfo && !showArchive && !menuOpen) return;
    const onDown = (e) => {
      if (infoRef.current?.contains(e.target)) return;
      if (archiveRef.current?.contains(e.target)) return;
      if (settingsRef.current?.contains(e.target)) return;
      if (addRef.current?.contains(e.target)) return;
      if (menuRef.current?.contains(e.target)) return;
      setShowSettings(false);
      setAddOpen(false);
      setShowArchive(false);
      setMenuOpen(false);
      if (showInfo) { setShowInfo(false); setSelected(null); }
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [showSettings, addOpen, showInfo, showArchive, menuOpen, confirmArchive]);

  // 默认 settings + 合并
  const s = useMemo(() => ({
    bg_type: 'solid',           // 'solid' | 'image'
    bg_color: '#FFFFFF',
    bg_image: '',                // base64
    ...settings,
  }), [settings]);

  // 按层级排序
  const sortedPlants = useMemo(() => [...plants].sort((a, b) => (a.z_index || 0) - (b.z_index || 0)), [plants]);

  // 顶部栏顺带显示的「待浇水」株数（超期 + 临期）：把最该看的数字提到第一眼
  const dueWater = useMemo(() => plants.filter((p) => {
    const lv = careStatus(p.last_watered, p.water_cycle_days, '浇水').level;
    return lv === 'alert' || lv === 'warn';
  }).length, [plants]);

  // 网格 / 列表点卡片 → 打开详情抽屉（与右键同路径）
  const openPlant = useCallback((p) => { setSelected(p); setShowInfo(true); }, []);

  // 选中的植物归属哪块托板（仅用于信息面板上的小标签）
  const selBoardLabel = useMemo(() => {
    if (!selected || !boards.length) return '';
    let best = null, bestD = Infinity;
    for (const b of boards) {
      const d = Math.abs((selected.pos_y || 0) - b.y);
      if (d < bestD) { bestD = d; best = b; }
    }
    return best && bestD <= 9 ? `托板 ${boards.findIndex(x => x.id === best.id) + 1}` : '';
  }, [selected, boards]);

  return (
    <div className="planting-shelf-wrap relative h-full flex flex-col overflow-hidden">
      <style>{`
        /* 蜜蜂翅膀扇动（transform-box 让每片翅绕自身中心收拢，不朝画布中心漂移） */
        .bee-wing { transform-box: fill-box; transform-origin: center; animation: wing-flap 0.15s ease-in-out infinite alternate; }
        @keyframes wing-flap { 0% { transform: scaleY(1); } 100% { transform: scaleY(0.3); } }
        /* 自动保存提示弹出 */
        @keyframes toast-pop { 0% { opacity: 0; transform: translate(-50%, -4px); } 100% { opacity: 1; transform: translate(-50%, 0); } }
        /* 蝴蝶翅膀开合 */
        .bf-wing { transform-origin: center; animation: b-wing 0.4s ease-in-out infinite alternate; }
        @keyframes b-wing { 0% { transform: scaleX(1); } 100% { transform: scaleX(0.6); } }
        /* 植物微摇（已移除：用户反馈不喜欢摇晃效果） */
        /* 蜜蜂飞行 */
        .bee-fly-1 { animation: bee-fly-1 14s ease-in-out infinite; }
        @keyframes bee-fly-1 { 0%{transform:translate(0,0) rotate(-5deg)} 20%{transform:translate(40px,-20px) rotate(10deg)} 40%{transform:translate(80px,10px) rotate(-8deg)} 60%{transform:translate(30px,30px) rotate(5deg)} 80%{transform:translate(-20px,-15px) rotate(-12deg)} 100%{transform:translate(0,0) rotate(-5deg)} }
        .bee-fly-2 { animation: bee-fly-2 16s ease-in-out infinite; }
        @keyframes bee-fly-2 { 0%{transform:translate(0,0) rotate(5deg)} 25%{transform:translate(-30px,15px) rotate(-10deg)} 50%{transform:translate(50px,-10px) rotate(8deg)} 75%{transform:translate(10px,25px) rotate(-3deg)} 100%{transform:translate(0,0) rotate(5deg)} }
        /* 蝴蝶飞行 */
        .bf-fly-1 { animation: bf-fly-1 18s ease-in-out infinite; }
        @keyframes bf-fly-1 { 0%{transform:translate(0,0)} 25%{transform:translate(-30px,-25px) rotate(-8deg)} 50%{transform:translate(50px,-15px) rotate(5deg)} 75%{transform:translate(20px,25px) rotate(-3deg)} 100%{transform:translate(0,0)} }
        .bf-fly-2 { animation: bf-fly-2 22s ease-in-out infinite; }
        @keyframes bf-fly-2 { 0%{transform:translate(0,0)} 30%{transform:translate(40px,-20px) rotate(6deg)} 60%{transform:translate(-20px,15px) rotate(-4deg)} 100%{transform:translate(0,0)} }
        .bee-fly-2 { animation: bee-fly-2 26s ease-in-out infinite; }
        /* 瓢虫：空中飞约 18s → 落在叶子上停约 4s → 再次起飞（26s 一轮，首尾同帧无缝循环）
           48% 处 translate(0,0) = 落在基准位置（叶丛），也是它停下来的位置 */
        .lady-fly { animation: lady-fly 26s ease-in-out infinite; }
        @keyframes lady-fly {
          0%   { transform: translate(0,-26px) rotate(-4deg); }
          6%   { transform: translate(18px,-40px) rotate(6deg); }
          14%  { transform: translate(-14px,-46px) rotate(-6deg); }
          22%  { transform: translate(26px,-34px) rotate(8deg); }
          30%  { transform: translate(-20px,-44px) rotate(-5deg); }
          36%  { transform: translate(6px,-30px) rotate(3deg); }
          44%  { transform: translate(2px,-10px) rotate(-1deg); }
          48%  { transform: translate(0,0) rotate(0deg); }
          52%  { transform: translate(0,-1px) rotate(0deg); }
          68%  { transform: translate(0,-1px) rotate(0deg); }
          74%  { transform: translate(0,-4px) rotate(-2deg); }
          80%  { transform: translate(-6px,-22px) rotate(-6deg); }
          88%  { transform: translate(14px,-38px) rotate(5deg); }
          94%  { transform: translate(-6px,-32px) rotate(-3deg); }
          100% { transform: translate(0,-26px) rotate(-4deg); }
        }
        /* 瓢虫飞行态：左右两片红色鞘翅向外张开并高频振动 —— 振动的就是它自己的鞘翅，
           不另加白色后翅；停落段整壳合拢、振动停止 */
        .lady-wing-l, .lady-wing-r { transform-box: fill-box; }
        .lady-wing-l { transform-origin: 100% 12%; animation: lady-wing-l 0.11s ease-in-out infinite alternate; }
        @keyframes lady-wing-l { from { transform: rotate(13deg); } to { transform: rotate(25deg); } }
        .lady-wing-r { transform-origin: 0% 12%; animation: lady-wing-r 0.11s ease-in-out infinite alternate; }
        @keyframes lady-wing-r { from { transform: rotate(-13deg); } to { transform: rotate(-25deg); } }
        /* 飞行态 / 停落态切换（与 .lady-fly 同一条 26s 时间轴；step-end 让可见性整段保持，
           不出现两套画法叠在一起的重影）：
           0–47% 飞行（翅张、壳隐）→ 47–71% 停落（翅隐、壳显）→ 71–100% 飞行 */
        .lady-wings { animation: lady-wings-vis 26s step-end infinite; }
        @keyframes lady-wings-vis { 0% { visibility: visible; } 47% { visibility: hidden; } 71% { visibility: visible; } }
        .lady-shell { visibility: hidden; animation: lady-shell-vis 26s step-end infinite; }
        @keyframes lady-shell-vis { 0% { visibility: hidden; } 47% { visibility: visible; } 71% { visibility: hidden; } }
        /* 睡猫：整只极轻微呼吸起伏（绕底边中心鼓收，不漂移） */
        @keyframes pet-breathe { 0%, 100% { transform: scale(1, 1); } 50% { transform: scale(1.012, 1.035); } }
        .cat-breathe { transform-origin: 50% 100%; animation: pet-breathe 3.4s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .bee-wing, .bf-wing,
          .bee-fly-1, .bee-fly-2, .bf-fly-1, .bf-fly-2, .lady-fly,
          .lady-wing-l, .lady-wing-r, .lady-wings, .lady-shell,
          .cat-breathe { animation: none !important; }
          /* 静止时收敛成一只合拢的瓢虫 */
          .lady-wings { display: none; }
          .lady-shell { visibility: visible; }
        }
      `}</style>

      {/* 花架画布 */}
      <div ref={canvasRef}
        className="relative w-full flex-1 min-h-0 overflow-hidden rounded-2xl"
        style={{
          backgroundImage: s.bg_type === 'image' && s.bg_image ? `url(${s.bg_image})` : 'none',
          backgroundSize: s.bg_type === 'image' ? 'cover' : 'auto',
          backgroundPosition: s.bg_type === 'image' ? 'center' : 'auto',
          backgroundColor: s.bg_type === 'solid' ? s.bg_color : undefined,
        }}
        onClick={view === 'shelf' ? onCanvasClick : undefined}
        onDragOver={view === 'shelf' ? onCanvasDragOver : undefined}
        onDrop={view === 'shelf' ? onCanvasDrop : undefined}>

        {/* ---- 以下为「花架」视图专属层：托板 / 装饰物 / 植物摆放 / 选中态 ----
            网格与列表视图不渲染这些（装饰物只属于花架视图），避免数据视图被干扰 */}
        {view === 'shelf' && (<>

        {/* 悬浮托板（概念 A）：不贴边、长短不一、左右错落、无立柱。
            画在植物之上（zIndex 4 > 植物层 2），盖住花盆底部 → 形成"坐在板上"的错觉。
            实木三明治：上缘高光 + 本体 + 下缘暗边 + 柔和落影；点板选中、拖动移位 */}
        {boards.map((b) => {
          const isSel = selectedBoard === b.id;
          return (
            <div key={b.id}
              className="shelf-board absolute select-none"
              style={{
                left: `${b.x}%`, top: `${b.y}%`, width: `${b.w}%`, height: BOARD_H,
                zIndex: 4,
                cursor: boardDragging === b.id ? 'grabbing' : 'grab',
                borderRadius: '9px',
                background: `linear-gradient(180deg, ${shade(b.color, 0.26)} 0%, ${b.color} 46%, ${shade(b.color, -0.16)} 100%)`,
                boxShadow: isSel
                  ? 'inset 0 1px 0 rgba(255,247,232,0.6), inset 0 -2px 3px rgba(0,0,0,0.22), 0 9px 15px rgba(58,38,18,0.20), 0 0 0 2px rgba(35,142,63,0.6)'
                  : 'inset 0 1px 0 rgba(255,247,232,0.55), inset 0 -2px 3px rgba(0,0,0,0.2), 0 7px 13px rgba(58,38,18,0.15)',
                transition: boardDragging === b.id ? 'none' : 'left .16s ease, top .16s ease, width .16s ease',
              }}
              onMouseDown={(e) => onBoardMouseDown(e, b)}
              onClick={(e) => e.stopPropagation()}
            />
          );
        })}

        {/* 选中托板的快捷操作：缩短 / 加长 / 改色 / 删除 */}
        {(() => {
          const b = boards.find(x => x.id === selectedBoard);
          if (!b) return null;
          return (
            <div className="absolute flex items-center gap-0.5 p-1"
              style={{
                left: `${b.x + b.w / 2}%`, top: `${b.y}%`,
                transform: `translate(-50%, ${b.y < 12 ? '12px' : 'calc(-100% - 14px)'})`,
                zIndex: 6,
                background: 'var(--surface-card)', borderRadius: '10px',
                border: '1px solid rgba(0,0,0,0.07)',
                boxShadow: '0 6px 18px rgba(0,0,0,0.14)',
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}>
              <button onClick={() => nudgeBoardWidth(b.id, -4)} title="缩短托板"
                className="w-6 h-6 rounded-md grid place-items-center text-[var(--text-2)] hover:bg-black/5">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M5 12h14" /></svg>
              </button>
              <button onClick={() => nudgeBoardWidth(b.id, 4)} title="加长托板"
                className="w-6 h-6 rounded-md grid place-items-center text-[var(--text-2)] hover:bg-black/5">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
              </button>
              <label className="relative w-6 h-6 rounded-md grid place-items-center cursor-pointer hover:bg-black/5" title="托板颜色">
                <span className="w-3.5 h-3.5 rounded-full border border-black/15" style={{ background: b.color }} />
                <input type="color" value={b.color} onChange={(e) => setBoardColor(b.id, e.target.value)}
                  className="absolute inset-0 opacity-0 cursor-pointer" />
              </label>
              <button onClick={() => removeBoard(b.id)} disabled={boards.length <= 1} title="删除托板"
                className="w-6 h-6 rounded-md grid place-items-center text-[var(--danger)] hover:bg-[rgba(var(--danger-rgb),0.08)] disabled:opacity-30">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" /></svg>
              </button>
            </div>
          );
        })()}

        {/* 蜜蜂（可拖拽，两只）：左边一只朝左飞，右边一只水平镜像成朝右飞 */}
        {[{ id: 'bee1', size: 30, anim: 'bee-fly-1', flip: false, pos: s.bee1 || { left: '5%', top: '6%' } },
          { id: 'bee2', size: 26, anim: 'bee-fly-2', flip: true, pos: s.bee2 || { left: '88%', top: '68%' } }].map(b => (
          <BeeDrop key={b.id} id={b.id} pos={b.pos} size={b.size} anim={b.anim} flip={b.flip}
            onPosChange={(np) => setSettings(st => ({ ...st, [b.id]: np }))} />
        ))}

        {/* 瓢虫（可拖拽）：空中盘旋 → 落在叶子上停一会 → 再次起飞。
            它的基准位置就是「落点」，默认取最靠后那株植物的叶丛（pos_y 上移 7%×尺寸 ≈ 叶丛中部）；
            手动拖过之后以手动位置为准，不再跟随植物 */}
        {(() => {
          const host = sortedPlants[0];
          const def = host
            ? { left: `${host.pos_x}%`, top: `${Math.max(5, Math.min(94, (host.pos_y || 0) - 7 * (host.size || 1)))}%` }
            : { left: '58%', top: '34%' };
          return (
            <LadybugDrop size={20} anim="lady-fly" pos={s.lady1 || def}
              onPosChange={(np) => setSettings(st => ({ ...st, lady1: np }))} />
          );
        })()}

        {/* 蝴蝶（可拖拽） */}
        {[{ id: 'bf1', size: 34, color: '#FFB347', anim: 'bf-fly-1', pos: s.bf1 || { left: '88%', top: '28%' } },
          { id: 'bf2', size: 26, color: '#C77DFF', anim: 'bf-fly-2', pos: s.bf2 || { left: '3%', top: '66%' } }].map(b => (
          <BFDrop key={b.id} id={b.id} pos={b.pos} size={b.size} color={b.color} anim={b.anim}
            onPosChange={(np) => setSettings(st => ({ ...st, [b.id]: np }))} />
        ))}

        {/* 宠物区：垫子（固定位置，独立 state）→ 两只宠物（可自由拖拽缩放）
            垫子像浮板一样是布景元素，不跟随宠物移动；宠物拖到哪里垫子就在原地
            垫子位置持久化到 settings.pet_mat — 下次打开仍在原位 */}
        {(() => {
          const mat = s.pet_mat || { left: 30, top: 56, width: 28, height: 9 };
          return <PetCushion left={mat.left} top={mat.top} width={mat.width} height={mat.height} />;
        })()}
        {/* 猫 — 默认左 22% 上 48%（在垫子左半） */}
        <PetDrop
          id="cat"
          imgSrc={catLying}
          pos={s.cat || { left: '22%', top: '48%' }}
          size={Math.max(40, Math.min(320, s.cat_size || 100))}
          selected={selectedPetId === 'cat'}
          onSelect={() => { setSelectedPetId('cat'); setSelected(null); }}
          onPosChange={(np) => setSettings(st => ({ ...st, cat: np }))}
          onSizeChange={(ns) => setSettings(st => ({ ...st, cat_size: ns }))}
        />
        {/* 柯基（透明底 PNG）— 默认右 38% 上 48%（在垫子右半） */}
        <PetDrop
          id="corgi"
          imgSrc={corgiSleeping}
          pos={s.corgi || { left: '38%', top: '48%' }}
          size={Math.max(40, Math.min(320, s.corgi_size || 92))}
          selected={selectedPetId === 'corgi'}
          onSelect={() => { setSelectedPetId('corgi'); setSelected(null); }}
          onPosChange={(np) => setSettings(st => ({ ...st, corgi: np }))}
          onSizeChange={(ns) => setSettings(st => ({ ...st, corgi_size: ns }))}
        />
        </>)}

        {/* 顶部栏（zIndex 7：常驻 chrome，须高于选中植物的置顶层 5 与托板工具条 6） */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3" style={{ zIndex: 7 }}>
          <div className="flex items-baseline gap-2">
            <span className="text-[15px] font-semibold text-[var(--text-1)] tracking-tight">我的植物</span>
            <span className="text-[12px] text-[var(--text-3)]">
              {plants.length} 株{dueWater > 0 ? ` · ${dueWater} 株待浇水` : ''}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* 视图切换：花架 / 网格 / 列表（窄屏折叠为纯图标） */}
            <div className="inline-flex" style={{ background: 'rgba(120,120,128,0.12)', borderRadius: 9, padding: 2 }}>
              {[['shelf', '花架'], ['grid', '网格'], ['list', '列表']].map(([id, label]) => {
                const on = view === id;
                return (
                  <button key={id} onClick={(e) => { e.stopPropagation(); setView(id); }} title={label}
                    className="flex items-center gap-1 transition"
                    style={{
                      padding: '3px 8px', fontSize: 12, fontWeight: on ? 600 : 500, borderRadius: 7,
                      color: on ? '#fff' : 'var(--text-2)', background: on ? '#238E3F' : 'transparent',
                      border: 'none', cursor: 'pointer', transition: 'all .2s',
                    }}>
                    <ViewIcon id={id} />
                    <span className="hidden sm:inline">{label}</span>
                  </button>
                );
              })}
            </div>
            {/* 「纵向三点」菜单：把 添加植物 / 归档植物 / 花架设置 三个入口收进来，
                顶部栏只留「视图切换 + ⋮」两个控件，窄屏不再拥挤。
                「一键整理」不属于高频操作，已移入设置面板的「布局」段。 */}
            <div className="relative" ref={menuRef}>
              <button onClick={(e) => {
                e.stopPropagation();
                const next = !menuOpen;
                setMenuOpen(next);
                // 展开菜单时先收起其它面板：顶部栏自身是 zIndex 7 的层叠上下文，
                // 菜单再高也压不过详情面板（10）/ 设置面板（11），互斥展示最干净
                if (next) {
                  setShowSettings(false); setAddOpen(false); setShowArchive(false);
                  setShowInfo(false); setSelected(null);
                }
              }}
                className="w-7 h-7 rounded-lg grid place-items-center transition hover:bg-black/5"
                style={{ background: menuOpen ? 'rgba(120,120,128,0.12)' : 'transparent' }}
                title="更多操作">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={menuOpen ? '#238E3F' : 'var(--text-muted)'} strokeWidth="2" strokeLinecap="round">
                  <circle cx="12" cy="12" r="1" /><circle cx="12" cy="5" r="1" /><circle cx="12" cy="19" r="1" />
                </svg>
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-9 p-1"
                  style={{
                    zIndex: 12, width: 176,
                    background: 'var(--surface-card)',
                    borderRadius: 12,
                    border: '1px solid rgba(0,0,0,0.07)',
                    boxShadow: '0 14px 38px rgba(0,0,0,0.13), 0 3px 10px rgba(0,0,0,0.05)',
                    animation: 'menu-pop 0.14s ease-out',
                  }}>
                  <style>{`@keyframes menu-pop { 0% { opacity: 0; transform: translateY(-4px) scale(0.98); } 100% { opacity: 1; transform: none; } }`}</style>
                  {[
                    { id: 'add', label: '添加植物', color: 'var(--text-2)', run: openAdd, icon: <path d="M12 5v14M5 12h14" /> },
                    { id: 'archive', label: '归档植物', color: 'var(--text-2)', run: openArchive, icon: (<><rect width="20" height="5" x="2" y="3" rx="1" /><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" /><path d="M10 12h4" /></>) },
                    { id: 'settings', label: '花架设置', color: 'var(--text-2)', run: () => setShowSettings(true), icon: (<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></>) },
                  ].map((it) => (
                    <button key={it.id}
                      onClick={(e) => { e.stopPropagation(); setMenuOpen(false); it.run(); }}
                      className="w-full flex items-center gap-2.5 px-2.5 py-[7px] rounded-lg text-left transition hover:bg-black/[0.05]"
                      style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={it.color}
                        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                        {it.icon}
                      </svg>
                      <span className="text-[12.5px] font-medium" style={{ color: 'var(--text-1)' }}>{it.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 自动保存轻提示（成功静默短暂显示，失败醒目常驻数秒） */}
        {saveToast && (
          <div key={saveToast.msg + saveToast.type}
            className="absolute left-1/2 top-14 -translate-x-1/2 px-3 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap"
            style={{
              zIndex: 9,
              background: saveToast.type === 'ok' ? 'rgba(35,142,63,0.94)' : 'rgba(var(--danger-rgb),0.96)',
              color: 'var(--surface-card)',
              boxShadow: '0 4px 14px rgba(0,0,0,0.16)',
              animation: 'toast-pop 0.18s ease-out',
            }}>
            {saveToast.type === 'ok'
              ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}><IconCheck size={12} strokeWidth={2.6} />{saveToast.msg}</span>
              : saveToast.msg}
          </div>
        )}

        {view === 'shelf' && (<>
        {/* 植物们（独立层叠上下文 zIndex 2 < 木板层 4：无论 z_index 多大都在木板之下，
            植物间相互层叠用排序索引，容器 pointer-events:none 透传画布点击） */}
        <div className="absolute inset-0" style={{ zIndex: 2, pointerEvents: 'none' }}>
        {sortedPlants.map((plant, i) => {
          const isSel = selected?.id === plant.id;
          const ws = waterStatus(plant);
          return (
            <div key={plant.id}
              className="absolute cursor-grab active:cursor-grabbing select-none"
              style={{
                left: `${plant.pos_x}%`, top: `${plant.pos_y}%`,
                zIndex: isSel ? sortedPlants.length + 1 : i + 1,
                pointerEvents: 'auto',
                transform: 'translate(-50%, -50%)',
                transition: dragging === plant.id ? 'none' : 'transform 0.18s cubic-bezier(.34,1.56,.64,1)',
              }}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => onPlantMouseDown(e, plant)}
              onContextMenu={(e) => onPlantContextMenu(e, plant)}
              {...lp.bind(() => { setSelected(plant); setShowInfo(true); })}>
              {/* 绿色光晕 */}
              <div className="absolute pointer-events-none" style={{
                inset: '-8px -8px -4px', borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(35,142,63,0.18), transparent 70%)',
                opacity: isSel || dragging === plant.id ? 1 : 0,
                transition: 'opacity 0.2s',
              }} />
              {/* 植物图片（maxWidth/maxHeight × size 实现真实布局缩放，命中区域随之变化）；
                  图片未加载完 → 绿色虚线占位圈（列表元数据秒开，图片并行补载） */}
              {plant.image ? (
                <img src={plant.image} alt={plant.name || '植物'}
                  className="block object-contain"
                  draggable={false}
                  style={{
                    filter: 'drop-shadow(0 5px 6px rgba(80,60,30,0.15))',
                    pointerEvents: 'none',
                    maxWidth: `${140 * (plant.size || 1)}px`,
                    maxHeight: `${160 * (plant.size || 1)}px`,
                  }} />
              ) : (
                <div className="animate-pulse rounded-full"
                  style={{
                    width: 64, height: 64, pointerEvents: 'none',
                    border: '2px dashed rgba(35,142,63,0.35)',
                    background: 'rgba(35,142,63,0.06)',
                  }} />
              )}
              {/* 四角缩放手柄 + 名称气泡已移到「置顶层」（见下方 zIndex 5 区块）：
                  它们原本贴着植物盒子边缘/底部，会被托板（zIndex 4）压住，
                  而植物本体需要继续被托板遮挡，所以只能把这两样单独提层，不能整体提层 */}
              {/* 浇水超期角标 */}
              {ws?.level === 'alert' && (
                <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center animate-pulse"
                  style={{
                    background: 'var(--danger)',
                    boxShadow: '0 2px 8px rgba(var(--danger-rgb),0.55), 0 0 0 2px var(--surface-card)',
                    color: 'var(--surface-card)',
                    fontSize: '13px',
                    fontWeight: '900',
                    lineHeight: '1',
                  }}>!</div>
              )}
            </div>
          );
        })}
        </div>

        {/* 选中植物的「四角缩放手柄 + 名称气泡」置顶层：
            zIndex 5 > 托板层 4，只把这两类交互信息提到托板之上；
            植物本体仍留在 zIndex 2 层被托板遮挡（视觉上依旧"坐在板上"）。
            盒子尺寸靠一个不可见的同款占位撑出，与下方植物完全同位同尺寸 →
            手柄贴角、名称贴底，与植物不产生偏差；位置取 sortedPlants 实时值，
            避免用 selected 快照导致拖动/缩放时置顶层滞后 */}
        {(() => {
          const p = selected ? sortedPlants.find(x => x.id === selected.id) : null;
          if (!p) return null;
          const size = p.size || 1;
          return (
            <div className="absolute"
              style={{
                left: `${p.pos_x}%`, top: `${p.pos_y}%`,
                zIndex: 5, pointerEvents: 'none',
                transform: 'translate(-50%, -50%)',
                transition: dragging === p.id ? 'none' : 'transform 0.18s cubic-bezier(.34,1.56,.64,1)',
              }}>
              {/* 不可见占位：仅撑出与植物一致的盒子，供手柄/名称定位 */}
              {p.image ? (
                <img src={p.image} alt="" aria-hidden="true"
                  className="block object-contain invisible"
                  style={{ maxWidth: `${140 * size}px`, maxHeight: `${160 * size}px` }} />
              ) : (
                <div style={{ width: 64, height: 64 }} />
              )}

              {/* 四角缩放手柄（选中时显示，对角拖动等比缩放；缩放过程中隐藏） */}
              {resizing !== p.id && (
                <>
                  {[['nw', '-top-1.5 -left-1.5', 'nwse-resize'], ['ne', '-top-1.5 -right-1.5', 'nesw-resize'],
                    ['sw', '-bottom-1.5 -left-1.5', 'nesw-resize'], ['se', '-bottom-1.5 -right-1.5', 'nwse-resize']].map(([corner, pos, cur]) => (
                    <div key={corner}
                      className={`absolute ${pos} w-2.5 h-2.5 rounded-full`}
                      title="拖动缩放"
                      style={{
                        background: 'var(--surface-card)',
                        border: '2px solid #238E3F',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
                        cursor: cur,
                        pointerEvents: 'auto',
                      }}
                      onMouseDown={(e) => onResizeMouseDown(e, p)} />
                  ))}
                </>
              )}

              {/* 名称气泡 */}
              <div className="absolute left-1/2 -bottom-5 -translate-x-1/2 px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap"
                style={{
                  background: '#238E3F',
                  color: 'var(--surface-card)',
                  pointerEvents: 'none',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                }}>
                {p.name || '未命名'}
              </div>
            </div>
          );
        })()}
        </>)}

        {/* 空状态 */}
        {plants.length === 0 && !loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-ink-500" style={{ zIndex: 3 }}>
            <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
              <ellipse cx="36" cy="52" rx="22" ry="12" fill="#E8D5C4" />
              <path d="M36 48 C36 30 44 18 52 14 C50 28 44 40 36 48 Z" fill="#238E3F" opacity="0.7" />
              <path d="M36 48 C36 34 28 22 20 18 C22 32 28 44 36 48 Z" fill="#7ED6A0" opacity="0.7" />
              <path d="M36 48 C36 36 36 22 36 8 C36 22 36 36 36 48 Z" fill="#238E3F" opacity="0.6" />
            </svg>
            <div className="text-center">
              <div className="text-sm font-semibold text-ink-400">还没有植物</div>
              <div className="text-[11px] mt-1 text-ink-300">点右上角 + 添加你的第一株植物</div>
              <div className="text-[10px] mt-0.5 text-ink-300">推荐上传透明背景 PNG</div>
            </div>
          </div>
        )}

        {/* 加载状态 */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center text-[12px]" style={{ zIndex: 3, color: 'var(--text-3)' }}>
            正在加载花架…
          </div>
        )}
        {/* 加载失败（API 挂/超时） */}
        {!loading && loadErr && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2" style={{ zIndex: 3 }}>
            <div className="text-[12px]" style={{ color: 'var(--danger)' }}>{loadErr}</div>
            <button onClick={loadPlants}
              className="text-[11px] font-semibold px-3 py-1 rounded-md transition active:scale-95"
              style={{ color: '#238E3F', background: 'rgba(35,142,63,0.12)', border: '1px solid rgba(35,142,63,0.25)' }}>
              重试
            </button>
          </div>
        )}

        {/* 网格 / 列表视图：与花架共用同一份数据，仅呈现方式不同（位置在此不可编辑） */}
        {view === 'grid' && plants.length > 0 && (
          <GridView plants={plants} onOpen={openPlant} onQuick={quickRecord} />
        )}
        {view === 'list' && plants.length > 0 && (
          <ListView plants={plants} onOpen={openPlant} onQuick={quickRecord} />
        )}

        <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
          onChange={onFileInputChange} />

        {/* 添加植物面板（+ / 拖图 / 左侧「种植」行 + 触发） */}
        {addOpen && (
          <AddPlantDrawer
            rootRef={addRef}
            draft={addDraft}
            busy={addBusy}
            onNameChange={(v) => setAddDraft(d => ({ ...d, name: v }))}
            onPickImage={() => fileInputRef.current?.click()}
            onConfirm={confirmAdd}
            onClose={() => setAddOpen(false)}
          />
        )}

        {/* 信息面板（右键 / 网格·列表点卡片）：顶部栏与画布空白处点击均可关闭 */}
        {showInfo && selected && (
          <InfoDrawer key={selected.id}
            rootRef={infoRef}
            plant={selected}
            boardLabel={selBoardLabel}
            onSave={savePlant}
            onArchive={archivePlant}
            onPatch={patchPlant}
            onClose={() => { setShowInfo(false); setSelected(null); }}
          />
        )}

        {/* 归档箱：已归档植物一览 + 单株恢复 */}
        {showArchive && (
          <ArchiveDrawer
            rootRef={archiveRef}
            items={archived}
            loading={archivedLoading}
            onRestore={restorePlant}
            onClose={() => setShowArchive(false)}
          />
        )}

        {/* 设置面板 */}
        {showSettings && (
          <SettingsDrawer
            rootRef={settingsRef}
            settings={settings}
            onChange={setSettings}
            bgInputRef={bgInputRef}
            boards={boards}
            boardPalette={boardPalette}
            onBoardsChange={setBoards}
            onAddBoard={addBoard}
            onRemoveBoard={removeBoard}
            onTidy={restoreDefault}
            isShelf={view === 'shelf'}
            onClose={() => setShowSettings(false)}
          />
        )}
        <input ref={bgInputRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const reader = new FileReader();
            reader.onload = () => {
              setSettings(s => ({ ...s, bg_type: 'image', bg_image: reader.result }));
            };
            reader.readAsDataURL(f);
            e.target.value = '';
          }} />
      </div>

      {/* 归档确认：非破坏性操作，确认键沿用主题色（不用危险红） */}
      <ConfirmDialog
        open={confirmArchive != null}
        title="归档确认"
        message="归档后不在花架显示，养护记录完整保留；可在右上角「更多」→「归档植物」中随时恢复。"
        confirmText="归档"
        onCancel={() => setConfirmArchive(null)}
        onConfirm={() => { const id = confirmArchive; setConfirmArchive(null); doArchivePlant(id); }}
      />
    </div>
  );
}

// ============================================================
// AddPlantDrawer — 「添加植物」面板（花架页面水平居中）
//   名称可改 + 选一张图片（PNG 透明背景最佳）→ 添加
//   居中而非贴右上角：它是从顶栏 + 号发起的创建流程（带遮罩、需连续输入），
//   居中让它成为当前唯一的焦点；设置/信息面板则是挂在各自触发控件下的查看器，仍贴右
//   动画随之由「右侧滑入」改成「顶部落下」，否则居中面板从右侧滑入会显得错位
//   rootRef：供外层做「点面板外任意地方即关闭」的外部判定
// ============================================================
function AddPlantDrawer({ rootRef, draft, busy, onNameChange, onPickImage, onConfirm, onClose }) {
  const canAdd = !!draft.image && !busy;
  return (
    <>
      {/* 遮罩（不遮画布，仅阻止穿透） */}
      <div className="absolute inset-0" style={{ zIndex: 10, pointerEvents: 'none' }} />

      <div ref={rootRef} onClick={(e) => e.stopPropagation()}
        className="absolute top-12 inset-x-0 mx-auto w-[320px] max-w-[calc(100%-32px)] overflow-hidden"
        style={{
          zIndex: 11,
          background: 'var(--surface-card)',
          borderRadius: '16px',
          border: '1px solid rgba(0,0,0,0.06)',
          boxShadow: '0 20px 56px rgba(0,0,0,0.14), 0 4px 16px rgba(0,0,0,0.06)',
          animation: 'sheet-drop-in 0.2s ease-out',
          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", system-ui, sans-serif',
        }}>
        <style>{`@keyframes sheet-drop-in { 0% { opacity: 0; transform: translateY(-8px); } 100% { opacity: 1; transform: translateY(0); } }`}</style>
        {/* 页头 */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <span className="text-[13px] font-bold text-ink-900">添加植物</span>
          <button onClick={onClose} title="关闭"
            className="w-6 h-6 rounded-md grid place-items-center text-ink-400 hover:bg-ink-50 transition">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <div className="px-4 pb-4 flex flex-col gap-3">
          {/* 图片选择 / 预览 */}
          <div>
            <div className="text-[11px] font-semibold text-ink-500 mb-1.5">植物图片</div>
            <button type="button" onClick={onPickImage}
              className="w-full h-[120px] rounded-xl border border-dashed grid place-items-center overflow-hidden transition hover:bg-ink-50"
              style={{ borderColor: 'rgba(35,142,63,0.35)', background: 'rgba(35,142,63,0.04)' }}>
              {draft.image ? (
                <img src={draft.image} alt="预览" className="max-h-[104px] max-w-full object-contain" draggable={false} />
              ) : (
                <span className="flex flex-col items-center gap-1 text-[11px] text-ink-400">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>
                  点击选择图片（PNG 透明背景最佳）
                </span>
              )}
            </button>
            {draft.image && (
              <button type="button" onClick={onPickImage}
                className="mt-1.5 text-[10px] font-semibold text-ink-500 hover:text-ink-700 transition">重新选择图片</button>
            )}
          </div>

          {/* 名称 */}
          <div>
            <div className="text-[11px] font-semibold text-ink-500 mb-1.5">名称</div>
            <input value={draft.name} onChange={(e) => onNameChange(e.target.value)}
              maxLength={20}
              className="w-full px-2.5 py-1.5 rounded-lg text-[12px] text-ink-900 outline-none transition border border-transparent focus:border-[#238E3F] bg-[rgba(120,120,128,0.03)]" />
          </div>

          {/* 操作 */}
          <div className="flex items-center gap-2 pt-0.5">
            <button type="button" onClick={onClose}
              className="flex-1 py-1.5 rounded-lg text-[11px] font-bold text-ink-500 border border-ink-100 hover:bg-ink-50 transition">取消</button>
            <button type="button" onClick={onConfirm} disabled={!canAdd}
              className="flex-1 py-1.5 rounded-lg text-[11px] font-bold transition disabled:opacity-40"
              style={{ background: '#238E3F', color: '#fff' }}>{busy ? '添加中…' : '添加植物'}</button>
          </div>
        </div>
      </div>
    </>
  );
}

// ============================================================
// InfoDrawer — 植物信息面板（从右侧滑入）
//   信息架构：状态行=行动指引 / 控制行=可编辑参数 / 打卡即时生效
// ============================================================

/* 养护卡片（浇水/施肥同构）：
 * icon 状态 icon · status 状态对象 · doneToday 今日已打卡（复选框选中态）
 * last/cycle 及其 onChange 控制行参数 · markLabel/markColor 打卡标签与主色
 * 打卡用复选框语义：勾选 = 已做，再点一次 = 撤销（回退一个周期），故不再单独放撤销按钮
 * 容器：一层无描边的 3% 中性底（原为 6% 底 + 内层白底描边字段，两层框边叠加显脏）。
 * 3% 在白底上合成约 #FBFAFB，几乎看不出边界——近似「无框但保留成组」的中间态 */
function CareCard({ icon, status, doneToday, markLabel, onMark, onUndo, last, cycle, maxCycle, onLastChange, onCycleChange, markColor }) {
  /* 周期数字：允许「清空后重填」。受控 number 若直接接父级，一按删除就会被
     parseInt('') || 1 顶回 1，根本删不掉。故本地存一份编辑中的文本：输入时同步父级
     （夹到 1..maxCycle 防止空/0 落库），失焦时丢掉草稿——回到父级里的有效值 */
  const [cycleText, setCycleText] = useState(null);
  const cycleShown = cycleText ?? String(cycle ?? '');
  const editCycle = (raw) => {
    const digits = raw.replace(/\D/g, '').slice(0, 3);
    setCycleText(digits);
    if (digits !== '') onCycleChange(Math.max(1, Math.min(Number(digits), maxCycle)));
  };

  return (
    <div className="rounded-xl px-3 py-2.5" style={{ background: 'rgba(120,120,128,0.03)' }}>
      {/* 状态行：行动指引 + 打卡复选框 */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex-shrink-0" style={{ color: status.color }}>{icon}</span>
          <span className="text-[12px] font-semibold truncate" style={{ color: status.color }}>{status.text}</span>
        </div>
        <button onClick={doneToday ? onUndo : onMark}
          title={doneToday ? '取消打卡，回退一个周期' : `标记今日已${markLabel}`}
          className="flex items-center gap-1.5 py-1 pr-1 rounded-md transition active:scale-95 flex-shrink-0">
          <span className="w-[15px] h-[15px] rounded-full grid place-items-center flex-shrink-0"
            style={{
              background: doneToday ? markColor : 'transparent',
              border: `1.5px solid ${doneToday ? markColor : 'rgba(120,120,128,0.42)'}`,
              boxShadow: doneToday ? `0 1px 3px ${markColor}4D` : 'none',
            }}>
            {doneToday && (
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
            )}
          </span>
          <span className="text-[12px] font-semibold" style={{ color: doneToday ? markColor : 'var(--text-2)' }}>{markLabel}</span>
        </button>
      </div>
      {/* 控制行：上次日期 + 周期天数。方案 B：字段不再套白底描边输入框，内联成
          「灰标签 + 深色值」；日期用点号格式 + 工作台同源日历图标，周期用虚线下划线表达可编辑 */}
      <div className="flex items-center justify-between gap-3">
        {/* 上次日期：可视层是自绘的点号日期 + 24px 圆角方形日历图标；
            上面盖一层 opacity-0 的原生 date input —— 点击直接落在它身上弹系统日历。
            宽度不再靠 ch 估算（此前 10ch 在 iOS 上仍差几 px，末位数字被裁），也不受内部
            月/日/年子字段最小宽度影响 */}
        <span className="relative flex items-center gap-1.5 min-w-0 cursor-pointer">
          <span className="text-[11px] text-[var(--text-3)] font-medium flex-shrink-0">上次</span>
          <span className="text-[12px] font-semibold tabular-nums flex-shrink-0"
            style={{ color: 'var(--text-2)', borderBottom: '1px dashed rgba(120,120,128,0.28)', paddingBottom: 2 }}>
            {dotDate(last)}
          </span>
          <span className="w-6 h-6 grid place-items-center flex-shrink-0"
            style={{ borderRadius: 7, background: 'rgba(120,120,128,0.10)', color: 'var(--text-3)' }}>
            <CalendarGlyph />
          </span>
          <input type="date" value={last} onChange={(e) => onLastChange(e.target.value)}
            onClick={openNativePicker}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            title="修改上次日期" aria-label={`修改上次${markLabel}日期`} />
        </span>
        <label className="flex items-center gap-1 flex-shrink-0 cursor-pointer">
          <span className="text-[11px] text-[var(--text-3)] font-medium flex-shrink-0">周期</span>
          <input type="text" inputMode="numeric" value={cycleShown}
            onChange={(e) => editCycle(e.target.value)} onBlur={() => setCycleText(null)}
            className="text-[12px] text-center bg-transparent outline-none font-semibold tabular-nums"
            style={{ color: markColor, width: `${Math.max(2, cycleShown.length)}ch`,
              borderBottom: '1px dashed rgba(120,120,128,0.28)', paddingBottom: 2 }}
            title="周期天数，可清空后重新输入" />
          <span className="text-[11px] text-[var(--text-3)] font-medium">天</span>
        </label>
      </div>
    </div>
  );
}

// ---- 记录照片缩略图：列表只回照片 id，图片按 id+ver 单独拉取（可长缓存、按需加载）----
function CareThumb({ id, ver = 0, size = 48, onOpen }) {
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    API.plants.carePhoto(id, ver)
      .then((r) => { if (!alive) return; if (r && r.image) setSrc(r.image); else setFailed(true); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [id, ver]);
  return (
    <button type="button" onClick={() => src && onOpen && onOpen(src)} title="查看大图"
      className="rounded-lg overflow-hidden flex-shrink-0 grid place-items-center transition active:scale-95"
      style={{ width: size, height: size, background: 'rgba(120,120,128,0.10)' }}>
      {src
        ? <img src={src} alt="" className="w-full h-full object-cover" />
        : failed
          ? <span className="text-[12px]" style={{ color: 'var(--text-3)' }}>—</span>
          : <span className="w-full h-full animate-pulse" style={{ background: 'rgba(120,120,128,0.12)' }} />}
    </button>
  );
}

// ============================================================
// InfoDrawer — 植物详情抽屉：记录（默认页）/ 提醒 / 简介
//   · 「记录即打卡」：打卡写一条 plant_care_logs，last_watered / last_fertilized
//     由后端按「同类记录最新一条」重算后回传
//   · 撤销 = 删掉最近一条同类记录；补录允许选过去时间，不允许未来
//   · 时间轴是事实来源；旧数据由后端在首次拉取时自动补一条，避免一进来是空的
//   · rootRef：供外层做「点面板外任意地方即关闭」的外部判定（花架 / 网格 / 列表三种视图都生效）
// ============================================================
function InfoDrawer({ rootRef, plant, boardLabel, onSave, onArchive, onClose, onPatch }) {
  const toast = useToast();
  const [tab, setTab] = useState('logs');
  const [form, setForm] = useState({
    name: plant.name || '',
    planted_at: plant.planted_at || '',
    traits: plant.traits || '',
    care_method: plant.care_method || '',
    water_cycle_days: plant.water_cycle_days || 7,
    last_watered: plant.last_watered || '',
    fert_cycle_days: plant.fert_cycle_days || 30,
    last_fertilized: plant.last_fertilized || '',
  });
  const [dirty, setDirty] = useState(false);

  // ---- 养护记录状态 ----
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [busy, setBusy] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);
  const [lastDone, setLastDone] = useState(null);   // 刚记录的那条 → 提供「撤销」
  const [editor, setEditor] = useState(null);       // 补录 / 编辑：{mode,kind,id,happened_at,note,kept,added}
  const [confirmDel, setConfirmDel] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const photoInputRef = useRef(null);

  const update = (field, val) => { setForm(f => ({ ...f, [field]: val })); setDirty(true); };

  // 后端回传的植物带重算过的 last_* → 同步进抽屉表单与父级列表
  const syncLast = useCallback((fields) => {
    setForm(f => ({ ...f, ...fields }));
    if (onPatch) onPatch({ id: plant.id, ...fields });
  }, [onPatch, plant.id]);

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const r = await API.plants.careLogs(plant.id);
      setLogs(Array.isArray(r.logs) ? r.logs : []);
    } catch (e) {
      toast.error('养护记录加载失败: ' + e.message);
    } finally { setLogsLoading(false); }
  }, [plant.id, toast]);
  useEffect(() => { loadLogs(); }, [loadLogs]);

  // ---- 记录即打卡：写一条日志；派生缓存由后端重算 ----
  const record = useCallback(async (kind) => {
    setBusy(true);
    try {
      const { log, plant: p } = await API.plants.careLogCreate({ plant_id: plant.id, kind, happened_at: nowStamp() });
      if (log) setLogs(prev => [log, ...prev]);
      if (p) syncLast({ last_watered: p.last_watered || '', last_fertilized: p.last_fertilized || '' });
      setLastDone({ kind, logId: log && log.id });
      toast.success(`${(ACTIONS[kind] || {}).label || '养护'}已记录`);
    } catch (e) {
      toast.error('记录失败: ' + e.message);
    } finally { setBusy(false); }
  }, [plant.id, syncLast, toast]);

  // ---- 撤销：删掉最近一条同类记录（后端按剩余记录回滚 last_*）----
  const undo = useCallback(async (kind) => {
    const target = kind
      ? logs.find(l => l.kind === kind)
      : (lastDone && logs.find(l => l.id === lastDone.logId));
    if (!target) return;
    setBusy(true);
    try {
      const { plant: p } = await API.plants.careLogRemove(target.id);
      setLogs(prev => prev.filter(l => l.id !== target.id));
      if (p) syncLast({ last_watered: p.last_watered || '', last_fertilized: p.last_fertilized || '' });
      setLastDone(null);
      toast.info('已撤销');
    } catch (e) {
      toast.error('撤销失败: ' + e.message);
    } finally { setBusy(false); }
  }, [logs, lastDone, syncLast, toast]);

  // ---- 补录 / 编辑面板 ----
  const primaryKind = nextCare({
    ...plant,
    water_cycle_days: form.water_cycle_days, last_watered: form.last_watered,
    fert_cycle_days: form.fert_cycle_days, last_fertilized: form.last_fertilized,
  }).kind;

  const openCreate = (kind) => {
    setConfirmDel(false);
    setEditor({ mode: 'create', kind: kind || primaryKind, happened_at: nowStamp().replace(' ', 'T'), note: '', kept: [], added: [] });
  };
  const openEdit = (log) => {
    setConfirmDel(false);
    setEditor({
      mode: 'edit', kind: log.kind, id: log.id,
      happened_at: String(log.happened_at || '').replace(' ', 'T'),
      note: log.note || '', kept: (log.photos || []).slice(), added: [],
    });
  };
  const closeEditor = () => { setEditor(null); setConfirmDel(false); };

  const pickPhotos = async (files) => {
    const picked = [];
    for (const f of Array.from(files || [])) {
      const dataUrl = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f); });
      try { picked.push(await compressDataUrl(dataUrl, 480)); } catch { /* 跳过压缩失败的 */ }
    }
    setEditor(e => e ? { ...e, added: [...e.added, ...picked].slice(0, Math.max(0, 9 - e.kept.length)) } : e);
  };

  const saveEditor = async () => {
    if (!editor) return;
    setBusy(true);
    try {
      if (editor.mode === 'create') {
        const { log, plant: p } = await API.plants.careLogCreate({
          plant_id: plant.id, kind: editor.kind,
          happened_at: String(editor.happened_at || '').replace('T', ' '),
          note: editor.note, photos: editor.added,
        });
        if (log) setLogs(prev => [log, ...prev]);
        if (p) syncLast({ last_watered: p.last_watered || '', last_fertilized: p.last_fertilized || '' });
        toast.success('已补录');
      } else {
        const original = logs.find(l => l.id === editor.id);
        const removed = ((original && original.photos) || []).filter(pid => !editor.kept.includes(pid));
        const { log } = await API.plants.careLogUpdate(editor.id, {
          happened_at: String(editor.happened_at || '').replace('T', ' '),
          note: editor.note,
          add_photos: editor.added,
          remove_photo_ids: removed,
        });
        if (log) {
          const nextLogs = logs.map(l => (l.id === log.id ? log : l));
          setLogs(nextLogs);
          // 改了发生时间 → 该类型的派生缓存可能变化，按本地记录重算（与后端同口径：取最大日期）
          if (log.kind === 'water' || log.kind === 'fertilize') {
            const dates = nextLogs.filter(l => l.kind === log.kind).map(l => stampDate(l.happened_at)).sort();
            const col = log.kind === 'water' ? 'last_watered' : 'last_fertilized';
            syncLast({ [col]: dates.length ? dates[dates.length - 1] : '' });
          }
        }
        toast.success('记录已更新');
      }
      closeEditor();
    } catch (e) {
      toast.error('保存失败: ' + e.message);
    } finally { setBusy(false); }
  };

  const removeLog = async (id) => {
    setBusy(true);
    try {
      const { plant: p } = await API.plants.careLogRemove(id);
      setLogs(prev => prev.filter(l => l.id !== id));
      if (p) syncLast({ last_watered: p.last_watered || '', last_fertilized: p.last_fertilized || '' });
      setLastDone(null);
      closeEditor();
      toast.info('记录已删除');
    } catch (e) {
      toast.error('删除失败: ' + e.message);
    } finally { setBusy(false); }
  };

  const days = plantedDays(form.planted_at);
  const today = new Date().toISOString().slice(0, 10);
  const nowLocal = nowStamp().replace(' ', 'T');
  // 状态从 form 实时计算，编辑周期/日期时状态文案即时跟随
  const ws = careStatus(form.last_watered, form.water_cycle_days, '浇水');
  const fs = careStatus(form.last_fertilized, form.fert_cycle_days, '施肥', '#8B6B4F');
  // 提醒徽标 = 待浇水 / 待施肥（临期或超期）
  const dueCount = [ws, fs].filter(s => s.level === 'alert' || s.level === 'warn').length;
  const nextA = ACTIONS[primaryKind] || ACTIONS.water;

  const handleSave = () => {
    onSave(form);
    setDirty(false);
  };

  const shownLogs = filter === 'all' ? logs : logs.filter(l => l.kind === filter);

  return (
    <>
      {/* 遮罩（不遮画布，仅阻止穿透） */}
      <div className="absolute inset-0" style={{ zIndex: 8, pointerEvents: 'none' }} />

      {/* 抽屉卡片（360px：撑开时间轴的日期列与内容；固定高度 560px 上限，内容区滚动，
          记录再多面板也不再被撑长，用右侧滑块上下查看） */}
      <div ref={rootRef} onClick={(e) => e.stopPropagation()}
        className="absolute top-12 right-4 w-[360px] max-w-[calc(100%-32px)] flex flex-col overflow-hidden"
        style={{
          zIndex: 10,
          height: 'min(calc(100% - 64px), 560px)',
          background: 'var(--surface-card)',
          borderRadius: '16px',
          border: '1px solid rgba(0,0,0,0.06)',
          boxShadow: '0 20px 56px rgba(0,0,0,0.14), 0 4px 16px rgba(0,0,0,0.06)',
          animation: 'drawer-slide-in 0.2s ease-out',
          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", system-ui, sans-serif',
        }}>
        <style>{`
          @keyframes drawer-slide-in { 0% { transform: translateX(20px); opacity: 0; } 100% { transform: translateX(0); opacity: 1; } }
          /* 内容区滚动滑块：常驻可见、可拖拽，替代默认细若发丝的样式 */
          .drawer-scroll { scrollbar-width: thin; scrollbar-color: rgba(120,120,128,0.32) transparent; }
          .drawer-scroll::-webkit-scrollbar { width: 10px; }
          .drawer-scroll::-webkit-scrollbar-track { background: transparent; }
          .drawer-scroll::-webkit-scrollbar-thumb {
            background: rgba(120,120,128,0.32); border-radius: 999px;
            border: 3px solid transparent; background-clip: content-box; min-height: 36px;
          }
          .drawer-scroll::-webkit-scrollbar-thumb:hover { background: rgba(120,120,128,0.5); border: 3px solid transparent; background-clip: content-box; }
        `}</style>

        {/* 头部 */}
        <div className="flex items-start gap-3 pl-4 pr-5 pt-3.5 pb-3 flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
          <div className="w-12 h-12 rounded-xl grid place-items-center flex-shrink-0"
            style={{ background: 'rgba(35,142,63,0.08)', border: '1px solid rgba(0,0,0,0.04)' }}>
            {plant.image
              ? <img src={plant.image} alt="" className="w-8 h-8 object-contain" />
              : <div className="w-8 h-8 rounded-full animate-pulse" style={{ background: 'rgba(35,142,63,0.12)' }} />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <input value={form.name} onChange={(e) => update('name', e.target.value)}
                placeholder="植物名称"
                className="flex-1 min-w-0 text-[15px] font-semibold text-[var(--text-1)] bg-transparent outline-none border-b border-transparent focus:border-[#238E3F] transition leading-tight" />
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0"
                style={{ color: '#238E3F', background: 'rgba(35,142,63,0.1)' }}>
                {boardLabel || '自由摆放'}
              </span>
            </div>
            {/* 已种植天数 + 种植日期：日期与养护卡同构（点号格式 + 同源日历图标 +
                透明原生 date 覆盖层），点整块即弹系统日历 */}
            <div className="flex items-center gap-1.5 mt-1.5 text-[11px]" style={{ color: 'var(--text-3)' }}>
              <span>已种植</span>
              <span className="font-bold tabular-nums" style={{ color: '#238E3F' }}>{days}</span>
              <span>天 ·</span>
              <span className="relative flex items-center gap-1 cursor-pointer">
                <span className="text-[12px] font-semibold tabular-nums"
                  style={{ color: 'var(--text-2)', borderBottom: '1px dashed rgba(120,120,128,0.28)', paddingBottom: 1 }}>
                  {dotDate(form.planted_at)}
                </span>
                <span className="w-5 h-5 grid place-items-center flex-shrink-0"
                  style={{ borderRadius: 6, background: 'rgba(120,120,128,0.10)', color: 'var(--text-3)' }}>
                  <CalendarGlyph size={11} />
                </span>
                <input type="date" value={form.planted_at} onChange={(e) => update('planted_at', e.target.value)}
                  onClick={openNativePicker}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  title="修改种植日期" aria-label="修改种植日期" />
              </span>
            </div>
          </div>
        </div>

        {/* 标签页：记录（默认）/ 提醒 / 简介 —— 三个两字标签，等宽节奏，扫读更快 */}
        <div className="flex px-2 flex-shrink-0" style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
          {[['logs', '记录'], ['remind', '提醒'], ['info', '简介']].map(([id, label]) => {
            const on = tab === id;
            return (
              <button key={id} onClick={() => { setTab(id); closeEditor(); }}
                className="relative px-3 py-2 text-[12.5px] transition"
                style={{ color: on ? 'var(--text-1)' : 'var(--text-3)', fontWeight: on ? 600 : 500 }}>
                {label}
                {id === 'remind' && dueCount > 0 && (
                  <span className="ml-1 inline-grid place-items-center px-1 rounded-full text-[10px] font-bold align-middle"
                    style={{ minWidth: 15, height: 15, background: 'var(--danger)', color: '#fff' }}>{dueCount}</span>
                )}
                {on && <span className="absolute left-2 right-2 -bottom-px h-[2px] rounded-full" style={{ background: '#238E3F' }} />}
              </button>
            );
          })}
        </div>

        {/* 内容 */}
        <div className="drawer-scroll flex-1 min-h-0 overflow-y-auto px-4 py-3">

          {/* ---- 养护记录 ---- */}
          {tab === 'logs' && (editor ? (
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-1.5">
                <span className="text-[13px] font-semibold" style={{ color: 'var(--text-1)' }}>
                  {editor.mode === 'create' ? '补录一次记录' : '编辑记录'}
                </span>
                <button onClick={closeEditor} title="关闭编辑"
                  className="ml-auto px-2.5 py-1 rounded-lg text-[11.5px] font-semibold transition hover:brightness-95 active:scale-95"
                  style={{ color: 'var(--text-2)', background: 'rgba(120,120,128,0.08)', border: '1px solid rgba(120,120,128,0.28)' }}>
                  取消
                </button>
              </div>

              {/* 动作类型：补录可选；编辑固定（要改类型请删除后重记） */}
              {editor.mode === 'create' ? (
                <div className="flex flex-wrap gap-1.5">
                  {ACTION_KINDS.map(k => {
                    const on = editor.kind === k;
                    return (
                      <button key={k} onClick={() => setEditor(s => ({ ...s, kind: k }))}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11.5px] font-semibold transition"
                        style={{ color: on ? '#fff' : ACTIONS[k].color, background: on ? ACTIONS[k].color : ACTIONS[k].soft }}>
                        <ActionIcon kind={k} size={12} color={on ? '#fff' : undefined} />{ACTIONS[k].label}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <ActionChip kind={editor.kind} size={22} iconSize={14} />
                  <span className="text-[12.5px] font-semibold" style={{ color: 'var(--text-1)' }}>{(ACTIONS[editor.kind] || {}).label}</span>
                  <span className="ml-auto text-[10.5px]" style={{ color: 'var(--text-3)' }}>类型不可改</span>
                </div>
              )}

              {/* 时间（不允许未来） */}
              <label className="flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer"
                style={{ background: 'rgba(120,120,128,0.05)' }}>
                <span className="text-[11px] font-medium flex-shrink-0" style={{ color: 'var(--text-3)' }}>时间</span>
                <input type="datetime-local" value={editor.happened_at} max={nowLocal}
                  onChange={(e) => setEditor(s => ({ ...s, happened_at: e.target.value }))}
                  className="flex-1 min-w-0 bg-transparent outline-none text-[12.5px] font-semibold tabular-nums"
                  style={{ color: 'var(--text-1)' }} />
              </label>

              {/* 备注 */}
              <textarea value={editor.note} onChange={(e) => setEditor(s => ({ ...s, note: e.target.value }))} rows={2}
                placeholder="备注：浇透，托盘不留积水…"
                className="w-full text-[13px] text-[var(--text-1)] font-medium bg-[rgba(120,120,128,0.03)] rounded-xl px-3 py-2.5 outline-none border border-transparent focus:border-[#238E3F] resize-none leading-relaxed transition placeholder:text-[var(--ink-300)]" />

              {/* 照片（单条最多 9 张） */}
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[11px] font-semibold tracking-wide" style={{ color: 'var(--text-3)' }}>照片</span>
                  <span className="text-[10.5px]" style={{ color: 'var(--text-3)' }}>最多 9 张</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {editor.kept.map(pid => (
                    <div key={pid} className="relative">
                      <CareThumb id={pid} size={52} onOpen={setLightbox} />
                      <button onClick={() => setEditor(s => ({ ...s, kept: s.kept.filter(x => x !== pid) }))}
                        title="移除这张"
                        className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full grid place-items-center text-[10px] font-bold leading-none"
                        style={{ background: 'var(--danger)', color: '#fff' }}>×</button>
                    </div>
                  ))}
                  {editor.added.map((src, i) => (
                    <div key={`n${i}`} className="relative">
                      <button onClick={() => setLightbox(src)} className="rounded-lg overflow-hidden block"
                        style={{ width: 52, height: 52 }}>
                        <img src={src} alt="" className="w-full h-full object-cover" />
                      </button>
                      <button onClick={() => setEditor(s => ({ ...s, added: s.added.filter((_, j) => j !== i) }))}
                        title="移除这张"
                        className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full grid place-items-center text-[10px] font-bold leading-none"
                        style={{ background: 'var(--danger)', color: '#fff' }}>×</button>
                    </div>
                  ))}
                  {(editor.kept.length + editor.added.length) < 9 && (
                    <button onClick={() => photoInputRef.current?.click()} title="添加照片"
                      className="w-[52px] h-[52px] rounded-lg grid place-items-center transition hover:brightness-95"
                      style={{ background: 'rgba(120,120,128,0.08)', color: 'var(--text-3)' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                    </button>
                  )}
                </div>
                <input ref={photoInputRef} type="file" accept="image/*" multiple className="hidden"
                  onChange={(e) => { pickPhotos(e.target.files); e.target.value = ''; }} />
              </div>

              <div className="flex gap-2 pt-0.5">
                {editor.mode === 'edit' && (
                  <button onClick={() => (confirmDel ? removeLog(editor.id) : setConfirmDel(true))} disabled={busy}
                    className="px-3 py-2.5 rounded-lg text-[12px] font-semibold transition active:scale-[0.98] disabled:opacity-50"
                    style={{ background: 'rgba(var(--danger-rgb),0.06)', color: 'var(--danger)', border: '1px solid rgba(var(--danger-rgb),0.12)' }}>
                    {confirmDel ? '确认删除' : '删除'}
                  </button>
                )}
                <button onClick={saveEditor} disabled={busy}
                  className="flex-1 py-2.5 rounded-lg text-[12px] font-semibold transition active:scale-[0.98] disabled:opacity-50"
                  style={{ background: '#238E3F', color: 'var(--surface-card)', boxShadow: '0 2px 8px rgba(35,142,63,0.2)' }}>
                  {editor.mode === 'create' ? '补录' : '保存'}
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* 类型筛选 chips */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                {[['all', '全部'], ...ACTION_KINDS.map(k => [k, ACTIONS[k].label])].map(([id, label]) => {
                  const on = filter === id;
                  return (
                    <button key={id} onClick={() => setFilter(id)}
                      className="px-2 py-1 rounded-full text-[11.5px] font-semibold transition"
                      style={{ color: on ? '#fff' : 'var(--text-2)', background: on ? '#238E3F' : 'rgba(120,120,128,0.10)' }}>
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* 时间轴：一条记录一行，左日期 / 中轴色点 / 右内容 */}
              {logsLoading ? (
                <div className="py-8 text-center text-[12px]" style={{ color: 'var(--text-3)' }}>正在加载记录…</div>
              ) : shownLogs.length === 0 ? (
                <div className="py-8 text-center">
                  <div className="text-[12px]" style={{ color: 'var(--text-3)' }}>还没有养护记录</div>
                  <button onClick={() => openCreate('water')} className="mt-2 text-[12.5px] font-semibold" style={{ color: '#238E3F' }}>
                    记录第一次浇水 →
                  </button>
                  <div className="mt-1 text-[10.5px]" style={{ color: 'var(--text-3)' }}>
                    按周期大概每 {form.water_cycle_days || 7} 天一次
                  </div>
                </div>
              ) : (
                <div>
                  {shownLogs.map((l) => {
                    const a = ACTIONS[l.kind] || { label: l.kind, color: 'var(--text-3)', soft: 'rgba(120,120,128,0.10)' };
                    const nPhotos = (l.photos || []).length;
                    return (
                      <div key={l.id} className="flex gap-2.5">
                        <div className="w-[52px] flex-shrink-0 pt-1 text-right">
                          <div className="text-[11.5px] font-semibold leading-tight" style={{ color: 'var(--text-2)' }}>{relativeDay(l.happened_at)}</div>
                          <div className="text-[10px] tabular-nums" style={{ color: 'var(--text-3)' }}>{stampDate(l.happened_at).slice(5)}</div>
                        </div>
                        <div className="relative w-3 flex-shrink-0">
                          <span className="absolute left-1/2 -translate-x-1/2 top-2.5 bottom-0 w-px" style={{ background: 'rgba(120,120,128,0.16)' }} />
                          <span className="absolute left-1/2 -translate-x-1/2 top-[7px] w-2 h-2 rounded-full"
                            style={{ background: a.color, boxShadow: '0 0 0 3px var(--surface-card)' }} />
                        </div>
                        <div className="flex-1 min-w-0 pb-3">
                          <div className="rounded-xl px-2.5 py-2" style={{ background: 'rgba(120,120,128,0.035)' }}>
                            <div className="flex items-center gap-1.5">
                              <ActionChip kind={l.kind} size={20} iconSize={13} />
                              <span className="text-[12.5px] font-semibold" style={{ color: 'var(--text-1)' }}>{a.label}</span>
                              <span className="text-[11px] tabular-nums" style={{ color: 'var(--text-3)' }}>
                                {stampTime(l.happened_at)}{nPhotos ? ` · ${nPhotos} 张` : ''}
                              </span>
                              <button onClick={() => openEdit(l)} title="编辑记录"
                                className="ml-auto w-5 h-5 grid place-items-center rounded-md transition hover:bg-black/5"
                                style={{ color: 'var(--text-3)' }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
                                  <path d="m15 5 4 4" />
                                </svg>
                              </button>
                            </div>
                            {l.note ? <p className="mt-1 text-[11.5px] leading-relaxed" style={{ color: 'var(--text-2)' }}>{l.note}</p> : null}
                            {nPhotos ? (
                              <div className="mt-1.5 flex gap-1.5 flex-wrap">
                                {l.photos.map(pid => <CareThumb key={pid} id={pid} size={48} onOpen={setLightbox} />)}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ))}

          {/* ---- 提醒（由记录派生）---- */}
          {tab === 'remind' && (
            <div className="flex flex-col gap-2.5">
              <div className="text-[10.5px] leading-relaxed" style={{ color: 'var(--text-3)' }}>
                提醒由养护记录自动派生：打卡会写一条记录；改周期只影响「下次时间」，不改历史。
              </div>
              <CareCard
                icon={<ActionIcon kind="water" size={15} color={ws.color} />}
                status={ws}
                doneToday={form.last_watered === today}
                markLabel="浇水"
                onMark={() => record('water')}
                onUndo={() => undo('water')}
                last={form.last_watered}
                cycle={form.water_cycle_days}
                maxCycle={90}
                onLastChange={(v) => update('last_watered', v)}
                onCycleChange={(v) => update('water_cycle_days', v)}
                markColor="#238E3F"
              />
              <CareCard
                icon={<ActionIcon kind="fertilize" size={15} color={fs.color} />}
                status={fs}
                doneToday={form.last_fertilized === today}
                markLabel="施肥"
                onMark={() => record('fertilize')}
                onUndo={() => undo('fertilize')}
                last={form.last_fertilized}
                cycle={form.fert_cycle_days}
                maxCycle={365}
                onLastChange={(v) => update('last_fertilized', v)}
                onCycleChange={(v) => update('fert_cycle_days', v)}
                markColor="#8B6B4F"
              />
            </div>
          )}

          {/* ---- 植物简介 ---- */}
          {tab === 'info' && (
            <div className="flex flex-col gap-2.5">
              <div>
                <div className="text-[11px] text-[var(--text-3)] mb-1.5 font-semibold tracking-wide">特性</div>
                <textarea value={form.traits} onChange={(e) => update('traits', e.target.value)} placeholder="喜温暖湿润，耐阴…" rows={3}
                  className="w-full text-[13.5px] text-[var(--text-1)] font-medium bg-[rgba(120,120,128,0.03)] rounded-xl px-3 py-2.5 outline-none border border-transparent focus:border-[#238E3F] resize-none leading-relaxed transition placeholder:text-[var(--ink-300)]" />
              </div>
              <div>
                <div className="text-[11px] text-[var(--text-3)] mb-1.5 font-semibold tracking-wide">养护方法</div>
                <textarea value={form.care_method} onChange={(e) => update('care_method', e.target.value)} placeholder="每周浇水 1 次…" rows={3}
                  className="w-full text-[13.5px] text-[var(--text-1)] font-medium bg-[rgba(120,120,128,0.03)] rounded-xl px-3 py-2.5 outline-none border border-transparent focus:border-[#238E3F] resize-none leading-relaxed transition placeholder:text-[var(--ink-300)]" />
              </div>
            </div>
          )}
        </div>

        {/* 快捷记录条（养护记录页常驻）：主按钮 = 最临近要做的动作，一步完成 */}
        {tab === 'logs' && !editor && (
          <div className="px-4 pt-2 pb-1 flex-shrink-0" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
            {lastDone && (
              <div className="flex items-center gap-2 mb-1.5 px-2 py-1 rounded-lg" style={{ background: 'rgba(35,142,63,0.10)' }}>
                <span className="text-[11.5px] font-semibold" style={{ color: '#238E3F' }}>
                  {(ACTIONS[lastDone.kind] || {}).label}已记录
                </span>
                <button onClick={() => undo()} disabled={busy} className="ml-auto text-[11.5px] font-semibold underline" style={{ color: 'var(--text-2)' }}>撤销</button>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <button onClick={() => record(primaryKind)} disabled={busy}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12.5px] font-semibold transition active:scale-95 disabled:opacity-60"
                style={{ background: nextA.color, color: '#fff', boxShadow: `0 2px 10px ${nextA.color}33` }}>
                <ActionIcon kind={primaryKind} size={15} color="#fff" />{nextA.label}
              </button>
              <button onClick={() => setSwapOpen(v => !v)}
                className="px-2.5 py-2 rounded-xl text-[11.5px] font-semibold transition"
                style={{ color: 'var(--text-2)', background: 'rgba(120,120,128,0.10)' }}>
                {swapOpen ? '收起' : '切换动作'}
              </button>
              <button onClick={() => openCreate(null)}
                className="ml-auto px-2.5 py-2 rounded-xl text-[11.5px] font-semibold transition"
                style={{ color: '#238E3F', background: 'rgba(35,142,63,0.10)' }}>
                ＋ 补录
              </button>
            </div>
            {swapOpen && (
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {ACTION_KINDS.map(k => (
                  <button key={k} onClick={() => { setSwapOpen(false); record(k); }} disabled={busy}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11.5px] font-semibold transition active:scale-95 disabled:opacity-60"
                    style={{ color: ACTIONS[k].color, background: ACTIONS[k].soft }}>
                    <ActionIcon kind={k} size={12} />{ACTIONS[k].label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 底部操作：归档 = 中性色（非破坏性，可恢复），与主色「保存」区分 */}
        <div className="flex gap-2 px-4 pt-2.5 pb-3.5 flex-shrink-0">
          <button onClick={() => onArchive(plant.id)}
            className="flex-1 py-2.5 rounded-lg text-[12px] font-semibold transition hover:brightness-[0.97] active:scale-[0.98]"
            style={{ background: 'rgba(120,120,128,0.10)', color: 'var(--text-2)', border: '1px solid rgba(0,0,0,0.06)' }}>
            归档
          </button>
          <button onClick={handleSave} disabled={!dirty}
            className="flex-1 py-2.5 rounded-lg text-[12px] font-semibold transition hover:brightness-95 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: '#238E3F', color: 'var(--surface-card)', boxShadow: '0 2px 8px rgba(35,142,63,0.2)' }}>
            保存
          </button>
        </div>

        {/* 大图查看（成长日记） */}
        {lightbox && (
          <div className="absolute inset-0 grid place-items-center p-5" onClick={() => setLightbox(null)}
            style={{ zIndex: 20, background: 'rgba(0,0,0,0.72)' }}>
            <img src={lightbox} alt="" className="max-w-full max-h-full object-contain rounded-lg" />
          </div>
        )}
      </div>
    </>
  );
}

// ============================================================
// ArchiveDrawer — 归档箱（顶部栏「⋮」→「归档植物」）
//   已归档植物一览：归档日期 + 单株恢复（回到花架原位置）
//   与信息面板同尺寸（360px）与同进出动画，视觉上是它的「兄弟面板」
//   rootRef：供外层做「点面板外任意地方即关闭」的外部判定
// ============================================================
function ArchiveDrawer({ rootRef, items, loading, onRestore, onClose }) {
  return (
    <>
      {/* 遮罩（不遮画布，仅阻止穿透） */}
      <div className="absolute inset-0" style={{ zIndex: 8, pointerEvents: 'none' }} />

      <div ref={rootRef} onClick={(e) => e.stopPropagation()}
        className="absolute top-12 right-4 w-[360px] max-w-[calc(100%-32px)] flex flex-col overflow-hidden"
        style={{
          zIndex: 10,
          maxHeight: 'calc(100% - 64px)',
          background: 'var(--surface-card)',
          borderRadius: '16px',
          border: '1px solid rgba(0,0,0,0.06)',
          boxShadow: '0 20px 56px rgba(0,0,0,0.14), 0 4px 16px rgba(0,0,0,0.06)',
          animation: 'drawer-slide-in 0.2s ease-out',
          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", system-ui, sans-serif',
        }}>
        <style>{`
          @keyframes drawer-slide-in { 0% { transform: translateX(20px); opacity: 0; } 100% { transform: translateX(0); opacity: 1; } }
        `}</style>

        {/* 头部：标题 + 容量说明 + 关闭 */}
        <div className="flex items-center gap-2.5 pl-4 pr-3 pt-3.5 pb-3 flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
          <span className="w-7 h-7 rounded-lg grid place-items-center flex-shrink-0"
            style={{ background: 'rgba(120,120,128,0.10)', color: 'var(--text-2)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect width="20" height="5" x="2" y="3" rx="1" />
              <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
              <path d="M10 12h4" />
            </svg>
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-semibold leading-tight" style={{ color: 'var(--text-1)' }}>归档</div>
            <div className="text-[10.5px] mt-0.5" style={{ color: 'var(--text-3)' }}>
              {loading ? '正在加载…' : (items.length ? `已归档 ${items.length} 株` : '暂无归档植物')}
            </div>
          </div>
          <button onClick={onClose} title="关闭"
            className="w-7 h-7 grid place-items-center rounded-lg transition hover:bg-black/5"
            style={{ color: 'var(--text-3)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 列表 */}
        <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2.5">
          {loading ? (
            <div className="py-8 text-center text-[12px]" style={{ color: 'var(--text-3)' }}>正在加载…</div>
          ) : items.length === 0 ? (
            <div className="py-8 text-center">
              <div className="text-[12px]" style={{ color: 'var(--text-3)' }}>还没有归档的植物</div>
              <div className="mt-1 text-[10.5px]" style={{ color: 'var(--text-3)' }}>
                在植物详情里点「归档」，就会收纳到这里
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {items.map((p) => (
                <div key={p.id} className="flex items-center gap-2.5 px-2 py-2 rounded-xl"
                  style={{ background: 'rgba(120,120,128,0.035)' }}>
                  <span className="w-10 h-10 rounded-lg grid place-items-center flex-shrink-0"
                    style={{ background: 'rgba(35,142,63,0.06)' }}>
                    {p.image
                      ? <img src={p.image} alt="" className="w-7 h-7 object-contain" draggable={false} />
                      : <span className="w-5 h-5 rounded-full" style={{ background: 'rgba(120,120,128,0.14)' }} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold truncate" style={{ color: 'var(--text-1)' }}>{p.name || '未命名'}</span>
                    <span className="block text-[10.5px] mt-0.5 tabular-nums" style={{ color: 'var(--text-3)' }}>
                      归档于 {relativeDay(p.archived_at) || stampDate(p.archived_at)}
                    </span>
                  </span>
                  <button onClick={() => onRestore(p.id)}
                    className="flex-shrink-0 px-2.5 py-1.5 rounded-lg text-[11.5px] font-semibold transition active:scale-95"
                    style={{ color: '#238E3F', background: 'rgba(35,142,63,0.10)' }}>
                    恢复
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 底部说明：归档语义（非删除） */}
        <div className="px-4 py-2.5 flex-shrink-0 text-[10.5px] leading-relaxed"
          style={{ borderTop: '1px solid rgba(0,0,0,0.06)', color: 'var(--text-3)' }}>
          归档保留全部养护记录，恢复后回到花架原位置。
        </div>
      </div>
    </>
  );
}

// ============================================================
// SettingsDrawer — 花架设置面板（右上角齿轮）
//   背景：纯色 / 上传图片
//   悬浮托板：增删托板 / 改色 / 调宽 / 恢复颜色
//   布局：一键整理植物（原顶部栏低频按钮，收进设置）
//   设置自动存 localStorage（实时预览）
//   排版对齐工作台既有面板：15px 标题 / 11px 段标 / var(--text-*) 文本层级
//   rootRef：供外层做「点面板外任意地方即关闭」的外部判定
// ============================================================
const PRESET_BG_COLORS = ['#FFFFFF', '#FBFBF9', '#F6F5F1', '#FDFBF3', '#F5F0E8', '#EFECE4', '#F0F4E8', '#E8F0E0'];
const PLANT_GREEN = '#238E3F';

function SettingsDrawer({ rootRef, settings, onChange, bgInputRef, boards, boardPalette, onBoardsChange, onAddBoard, onRemoveBoard, onTidy, isShelf, onClose }) {
  const merge = (patch) => onChange({ ...settings, ...patch });
  const patchBoard = (id, patch) => onBoardsChange(list => list.map(b => (b.id === id ? { ...b, ...patch } : b)));
  const palette = Array.isArray(boardPalette) && boardPalette.length ? boardPalette : DEFAULT_BOARD_COLORS;
  const full = boards.length >= MAX_BOARDS;
  // 恢复颜色：只把每块托板颜色还原成默认色板，位置 / 宽度 / 背景保持不变
  const restoreColors = () => onBoardsChange(list => list.map((b, i) => ({ ...b, color: palette[i % palette.length] || b.color })));
  // 分段控件（对齐全站 .tab-group 视觉：外槽圆角方 + 选中胶囊）
  const segStyle = (on) => ({
    padding: '3px 11px', fontSize: 12, fontWeight: on ? 600 : 500, borderRadius: 7,
    color: on ? '#fff' : 'var(--text-2)', background: on ? PLANT_GREEN : 'transparent',
    border: 'none', cursor: 'pointer', transition: 'all .2s',
    boxShadow: on ? '0 3px 8px rgba(35,142,63,0.25)' : 'none',
  });
  const swatchStyle = (active) => ({
    width: 22, height: 22, borderRadius: '50%', cursor: 'pointer',
    border: '1px solid rgba(0,0,0,0.12)',
    outline: active ? `2px solid ${PLANT_GREEN}` : 'none', outlineOffset: '1px',
  });

  return (
    <div ref={rootRef} onClick={(e) => e.stopPropagation()}
      className="absolute top-12 right-4 w-[320px] overflow-hidden"
      style={{
        zIndex: 11,
        background: 'var(--surface-card)',
        borderRadius: '16px',
        border: '1px solid rgba(0,0,0,0.06)',
        boxShadow: '0 20px 56px rgba(0,0,0,0.14), 0 4px 16px rgba(0,0,0,0.06)',
        animation: 'drawer-slide-in 0.2s ease-out',
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", system-ui, sans-serif',
      }}>
      <style>{`@keyframes drawer-slide-in { 0% { transform: translateX(20px); opacity: 0; } 100% { transform: translateX(0); opacity: 1; } }
        /* 托板宽度滑杆：细轨 + 小圆点（原生 thumb 过大） */
        .bd-range { -webkit-appearance: none; appearance: none; height: 4px; border-radius: 2px; background: var(--ink-100); outline: none; cursor: pointer; }
        .bd-range::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 12px; height: 12px; border-radius: 50%; background: #fff; border: 2px solid #238E3F; box-shadow: 0 1px 3px rgba(0,0,0,0.2); cursor: pointer; }
        .bd-range::-moz-range-track { height: 4px; border-radius: 2px; background: var(--ink-100); }
        .bd-range::-moz-range-thumb { width: 12px; height: 12px; border-radius: 50%; background: #fff; border: 2px solid #238E3F; box-shadow: 0 1px 3px rgba(0,0,0,0.2); cursor: pointer; }
      `}</style>

      {/* 头部 */}
      <div className="flex items-center justify-between px-4 pt-3.5 pb-3" style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
        <span className="text-[15px] font-semibold text-[var(--text-1)] tracking-tight">花架设置</span>
        <button onClick={onClose} title="关闭"
          className="w-7 h-7 rounded-lg grid place-items-center text-[var(--text-muted)] hover:bg-black/5 transition">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>

      <div className="px-4 py-3.5 flex flex-col gap-3.5 max-h-[62vh] overflow-y-auto">

        {/* 背景 */}
        <div>
          <div className="text-[11px] font-semibold tracking-wide text-[var(--text-3)] mb-2">背景</div>

          <div className="inline-flex mb-2.5" style={{ background: 'rgba(120,120,128,0.12)', borderRadius: 9, padding: 2 }}>
            <button style={segStyle(settings.bg_type === 'solid')} onClick={() => merge({ bg_type: 'solid' })}>纯色</button>
            <button style={segStyle(settings.bg_type === 'image')} onClick={() => merge({ bg_type: 'image' })}>图片</button>
          </div>

          {settings.bg_type === 'solid' ? (
            <div className="flex items-center gap-2 flex-wrap">
              {PRESET_BG_COLORS.map(c => (
                <button key={c} onClick={() => merge({ bg_color: c })} title={c}
                  className="transition hover:scale-110"
                  style={{ ...swatchStyle(settings.bg_color === c), background: c }} />
              ))}
              {/* 自定义取色：小圆点内嵌原生取色器（取代原来的长条方框） */}
              <label className="relative transition hover:scale-110" title="自定义颜色"
                style={{ ...swatchStyle(!PRESET_BG_COLORS.includes(settings.bg_color)), background: settings.bg_color || '#FFFFFF' }}>
                <input type="color" value={settings.bg_color || '#FFFFFF'}
                  onChange={(e) => merge({ bg_color: e.target.value })}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                <svg className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                  width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.4)" strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
              </label>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button onClick={() => bgInputRef.current?.click()}
                className="flex-1 py-2 rounded-lg text-[12px] font-semibold transition"
                style={{ color: '#238E3F', border: `1px dashed ${PLANT_GREEN}`, background: 'rgba(35,142,63,0.06)' }}>
                {settings.bg_image ? '更换图片' : '上传图片'}
              </button>
              {settings.bg_image && (
                <div className="relative flex-shrink-0">
                  <img src={settings.bg_image} alt="背景预览" className="w-9 h-9 rounded-lg object-cover border border-[rgba(0,0,0,0.08)]" />
                  <button onClick={() => merge({ bg_type: 'solid', bg_image: '' })} title="清除背景图"
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full grid place-items-center text-white"
                    style={{ background: 'rgba(0,0,0,0.5)' }}>
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 悬浮托板 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold tracking-wide text-[var(--text-3)]">悬浮托板</span>
            <span className="text-[11px] tabular-nums text-[var(--text-muted)]">{boards.length}/{MAX_BOARDS}</span>
          </div>

          {/* 操作行：添加托板 + 恢复颜色 */}
          <div className="flex items-center gap-2 mb-2.5">
            <button onClick={onAddBoard} disabled={full}
              className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-[12px] font-semibold transition disabled:opacity-40"
              style={{ color: '#238E3F', border: '1px solid rgba(35,142,63,0.35)', background: 'rgba(35,142,63,0.06)' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
              添加托板
            </button>
            <button onClick={restoreColors}
              className="flex-1 py-2 rounded-lg text-[12px] font-semibold transition"
              style={{ color: 'var(--text-2)', border: '1px solid var(--ink-100)', background: 'transparent' }}>
              恢复颜色
            </button>
          </div>

          {/* 托板列表 */}
          <div className="flex flex-col gap-2">
            {boards.map((b, i) => (
              <div key={b.id} className="flex items-center gap-2.5">
                <span className="w-[46px] flex-shrink-0 text-[12px] tabular-nums text-[var(--text-2)]">第 {i + 1} 块</span>
                <label className="relative w-[18px] h-[18px] rounded-[5px] flex-shrink-0 cursor-pointer"
                  title="托板颜色" style={{ background: b.color, border: '1px solid rgba(0,0,0,0.12)' }}>
                  <input type="color" value={b.color}
                    onChange={(e) => patchBoard(b.id, { color: e.target.value })}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                </label>
                <input type="range" min={16} max={72} value={Math.round(b.w)}
                  onChange={(e) => {
                    const w = Number(e.target.value);
                    patchBoard(b.id, { w, x: Math.min(b.x, 100 - w - 1) });
                  }}
                  className="bd-range flex-1" />
                <span className="w-9 text-right text-[11px] tabular-nums text-[var(--text-3)]">{Math.round(b.w)}%</span>
                <button onClick={() => onRemoveBoard(b.id)} disabled={boards.length <= 1} title="删除这块托板"
                  className="w-6 h-6 rounded-md grid place-items-center flex-shrink-0 transition disabled:opacity-30 text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[rgba(var(--danger-rgb),0.08)]">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" /></svg>
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* 布局：一键整理植物（低频操作，从顶部栏收进来；位置只在花架视图生效，故非花架时禁用） */}
        <div>
          <div className="text-[11px] font-semibold tracking-wide text-[var(--text-3)] mb-2">布局</div>
          <button onClick={onTidy} disabled={!isShelf}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-[12px] font-semibold transition disabled:opacity-40"
            style={{ color: PLANT_GREEN, border: '1px solid rgba(35,142,63,0.35)', background: 'rgba(35,142,63,0.06)' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4.5 19.5L13.5 10.5" />
              <path d="M17 1.5L18.47 5.4L23 7.5L18.47 9.6L17 13.5L15.53 9.6L11 7.5L15.53 5.4Z" />
            </svg>
            一键整理植物
          </button>
          <div className="mt-1.5 text-[10.5px] leading-relaxed" style={{ color: 'var(--text-3)' }}>
            {isShelf ? '把植物搬回各自的默认位置' : '仅在花架视图可用：位置只在花架里生效'}
          </div>
        </div>
      </div>
    </div>
  );
}
