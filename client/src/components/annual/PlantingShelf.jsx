// ============================================================
// PlantingShelf — 种植花架画布组件
//   生活页「种植」类目选中时渲染，替代时间流主视图
//   功能：上传透明背景植物图 → 左键拖拽自由摆放 → 右键查看/编辑植物档案
//   设计：胡桃木三层花架 + 纯白微暖墙面 + 蜜蜂蝴蝶氛围 + 绿色光晕 + 浇水提醒
// ============================================================
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { API } from '../../api/client.js';
import { useToast } from '../../context/ToastContext.jsx';
import ConfirmDialog from '../ConfirmDialog.jsx';
import { useLongPress } from '../useLongPress.js';
import { uid } from './utils.js';

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

// N 天前的日期串（撤销打卡时回退一个周期用）
function dateDaysAgo(n) {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
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
function Bee({ size = 28 }) {
  return (
    <svg width={size} height={size * 0.79} viewBox="0 0 28 22">
      <ellipse className="bee-wing" cx="10" cy="6" rx="7" ry="5" fill="rgba(255,255,255,0.7)" stroke="#ddd" strokeWidth="0.5" />
      <ellipse className="bee-wing" cx="18" cy="6" rx="7" ry="5" fill="rgba(255,255,255,0.7)" stroke="#ddd" strokeWidth="0.5" />
      <ellipse cx="14" cy="14" rx="8" ry="6" fill="#F5C724" />
      <rect x="10" y="10" width="2" height="8" fill="var(--ink-600)" />
      <rect x="14" y="10" width="2" height="8" fill="var(--ink-600)" />
      <rect x="18" y="11" width="1.5" height="6" fill="var(--ink-600)" />
      <line x1="11" y1="8" x2="10" y2="4" stroke="var(--ink-600)" strokeWidth="1" />
      <line x1="17" y1="8" x2="18" y2="4" stroke="var(--ink-600)" strokeWidth="1" />
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

// ---- 可拖拽的蜜蜂 ----
function BeeDrop({ pos, size, anim, onPosChange }) {
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
      <div className={anim}><Bee size={size} /></div>
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
  const [dragging, setDragging] = useState(null);
  const [resizing, setResizing] = useState(null);
  // 自动保存反馈：成功短暂轻提示，失败醒目提示
  const [saveToast, setSaveToast] = useState(null);
  // 花架加载错误：API 挂/超时/网络异常
  const [loadErr, setLoadErr] = useState(null);
  const [showInfo, setShowInfo] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(null); // 待移除的植物 id
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
  const [addDraft, setAddDraft] = useState({ name: '新植物', image: '' });
  const [addBusy, setAddBusy] = useState(false);
  const openAdd = useCallback((image = '') => {
    setAddDraft({ name: '新植物', image });
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

  // ---- 删除植物 ----
  const doRemovePlant = async (id) => {
    try {
      await API.plants.remove(id);
      setPlants(prev => prev.filter(p => p.id !== id));
      setShowInfo(false);
      setSelected(null);
    } catch (e) { toast.error('删除失败: ' + e.message); }
  };

  const removePlant = (id) => {
    setConfirmRemove(id);
  };

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

  // 画布点击（空白处）：取消选中植物（隐藏缩放/托板手柄）+ 关闭信息面板
  const onCanvasClick = () => {
    setSelected(null);
    setSelectedBoard(null);
    setShowInfo(false);
  };

  // 默认 settings + 合并
  const s = useMemo(() => ({
    bg_type: 'solid',           // 'solid' | 'image'
    bg_color: '#FFFFFF',
    bg_image: '',                // base64
    ...settings,
  }), [settings]);

  // 按层级排序
  const sortedPlants = useMemo(() => [...plants].sort((a, b) => (a.z_index || 0) - (b.z_index || 0)), [plants]);

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
        /* 蜜蜂翅膀扇动 */
        .bee-wing { transform-origin: center; animation: wing-flap 0.15s ease-in-out infinite alternate; }
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
        @media (prefers-reduced-motion: reduce) {
          .bee-wing, .bf-wing, .bee-fly-1, .bee-fly-2, .bf-fly-1, .bf-fly-2 { animation: none !important; }
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
        onClick={onCanvasClick}
        onDragOver={onCanvasDragOver}
        onDrop={onCanvasDrop}>

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

        {/* 蜜蜂（可拖拽） */}
        {[{ id: 'bee1', size: 28, anim: 'bee-fly-1', pos: s.bee1 || { left: '5%', top: '6%' } },
          { id: 'bee2', size: 24, anim: 'bee-fly-2', pos: s.bee2 || { left: '88%', top: '68%' } }].map(b => (
          <BeeDrop key={b.id} id={b.id} pos={b.pos} size={b.size} anim={b.anim}
            onPosChange={(np) => setSettings(st => ({ ...st, [b.id]: np }))} />
        ))}

        {/* 蝴蝶（可拖拽） */}
        {[{ id: 'bf1', size: 34, color: '#FFB347', anim: 'bf-fly-1', pos: s.bf1 || { left: '88%', top: '28%' } },
          { id: 'bf2', size: 26, color: '#C77DFF', anim: 'bf-fly-2', pos: s.bf2 || { left: '3%', top: '66%' } }].map(b => (
          <BFDrop key={b.id} id={b.id} pos={b.pos} size={b.size} color={b.color} anim={b.anim}
            onPosChange={(np) => setSettings(st => ({ ...st, [b.id]: np }))} />
        ))}

        {/* 顶部栏（zIndex 7：常驻 chrome，须高于选中植物的置顶层 5 与托板工具条 6） */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3" style={{ zIndex: 7 }}>
          <div className="flex items-baseline gap-2">
            <span className="text-[15px] font-semibold text-[var(--text-1)] tracking-tight">我的花架</span>
            <span className="text-[12px] text-[var(--text-3)]">{plants.length} 株</span>
          </div>
          <div className="flex items-center gap-1">
            {/* 添加植物（打开「添加植物」面板） */}
            <button onClick={(e) => { e.stopPropagation(); openAdd(); }}
              className="w-7 h-7 rounded-lg grid place-items-center transition hover:bg-black/5"
              title="添加植物">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#238E3F" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            </button>
            {/* 一键整理植物（把植物搬回设为默认时的位置） */}
            <button onClick={(e) => { e.stopPropagation(); restoreDefault(); }}
              className="w-7 h-7 rounded-lg grid place-items-center transition hover:bg-black/5"
              title="一键整理植物">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4.5 19.5L13.5 10.5" />
                <path d="M17 1.5L18.47 5.4L23 7.5L18.47 9.6L17 13.5L15.53 9.6L11 7.5L15.53 5.4Z" />
              </svg>
            </button>
            <button onClick={(e) => { e.stopPropagation(); setShowSettings(true); }}
              className="w-7 h-7 rounded-lg grid place-items-center transition hover:bg-black/5"
              title="花架设置">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
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
            {saveToast.type === 'ok' ? `✓ ${saveToast.msg}` : saveToast.msg}
          </div>
        )}

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

        <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
          onChange={onFileInputChange} />

        {/* 添加植物面板（+ / 拖图 / 左侧「种植」行 + 触发） */}
        {addOpen && (
          <AddPlantDrawer
            draft={addDraft}
            busy={addBusy}
            onNameChange={(v) => setAddDraft(d => ({ ...d, name: v }))}
            onPickImage={() => fileInputRef.current?.click()}
            onConfirm={confirmAdd}
            onClose={() => setAddOpen(false)}
          />
        )}

        {/* 信息面板（右键抽屉） */}
        {showInfo && selected && (
          <InfoDrawer key={selected.id}
            plant={selected}
            boardLabel={selBoardLabel}
            onSave={savePlant}
            onRemove={removePlant}
            onClose={() => { setShowInfo(false); setSelected(null); }}
          />
        )}

        {/* 设置面板 */}
        {showSettings && (
          <SettingsDrawer
            settings={settings}
            onChange={setSettings}
            bgInputRef={bgInputRef}
            boards={boards}
            boardPalette={boardPalette}
            onBoardsChange={setBoards}
            onAddBoard={addBoard}
            onRemoveBoard={removeBoard}
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

      <ConfirmDialog
        open={confirmRemove != null}
        danger
        title="移除确认"
        message="确认移除这株植物？"
        confirmText="移除"
        onCancel={() => setConfirmRemove(null)}
        onConfirm={() => { const id = confirmRemove; setConfirmRemove(null); doRemovePlant(id); }}
      />
    </div>
  );
}

// ============================================================
// AddPlantDrawer — 「添加植物」面板（从右侧滑入）
//   名称可改 + 选一张图片（PNG 透明背景最佳）→ 添加
// ============================================================
function AddPlantDrawer({ draft, busy, onNameChange, onPickImage, onConfirm, onClose }) {
  const canAdd = !!draft.image && !busy;
  return (
    <>
      {/* 遮罩（不遮画布，仅阻止穿透） */}
      <div className="absolute inset-0" style={{ zIndex: 10, pointerEvents: 'none' }} />

      <div onClick={(e) => e.stopPropagation()}
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
              placeholder="新植物" maxLength={20}
              className="w-full px-2.5 py-1.5 rounded-lg text-[12px] text-ink-900 outline-none transition"
              style={{ background: 'rgba(120,120,128,0.06)', border: '1px solid rgba(0,0,0,0.08)' }} />
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
 * 容器：一层无描边的 5% 中性底（原为 6% 底 + 内层白底描边字段，两层框边叠加显脏）。
 * 字段不再是输入框，而是内联的「11px 灰标签 + 12px 深色值」；
 * 可编辑性用虚线下划线 + 24px 圆角方形日历按钮表达，整组包在 label 里点标签也能改 */
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
    <div className="rounded-xl px-3 py-2.5" style={{ background: 'rgba(120,120,128,0.05)' }}>
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
          「灰标签 + 深色值」；日期靠 24px 圆角方形日历按钮 + 8px 间隙表达可点与可改，
          周期靠虚线下划线表达可编辑。整组包在 label 里，点标签文字同样能聚焦到字段 */}
      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-1.5 min-w-0 cursor-pointer">
          <span className="text-[11px] text-[var(--text-3)] font-medium flex-shrink-0">上次</span>
          <input type="date" value={last} onChange={(e) => onLastChange(e.target.value)}
            className="dp dp-u" title="修改上次日期" />
        </label>
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

function InfoDrawer({ plant, boardLabel, onSave, onRemove, onClose }) {
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

  const update = (field, val) => { setForm(f => ({ ...f, [field]: val })); setDirty(true); };

  const days = plantedDays(form.planted_at);
  const today = new Date().toISOString().slice(0, 10);
  // 状态从 form 实时计算，编辑周期/日期时状态文案即时跟随
  const ws = careStatus(form.last_watered, form.water_cycle_days, '浇水');
  const fs = careStatus(form.last_fertilized, form.fert_cycle_days, '施肥', '#8B6B4F');

  // 打卡类动作：合并补丁并立即保存（无需点保存按钮）
  const commit = (patch) => {
    const next = { ...form, ...patch };
    setForm(next);
    onSave(next);
    setDirty(false);
  };

  const handleSave = () => {
    onSave(form);
    setDirty(false);
  };

  return (
    <>
      {/* 遮罩（不遮画布，仅阻止穿透） */}
      <div className="absolute inset-0" style={{ zIndex: 8, pointerEvents: 'none' }} />

      {/* 抽屉卡片 */}
      <div onClick={(e) => e.stopPropagation()}
        className="absolute top-12 right-4 w-[320px] overflow-hidden"
        style={{
          zIndex: 10,
          background: 'var(--surface-card)',
          borderRadius: '16px',
          border: '1px solid rgba(0,0,0,0.06)',
          boxShadow: '0 20px 56px rgba(0,0,0,0.14), 0 4px 16px rgba(0,0,0,0.06)',
          animation: 'drawer-slide-in 0.2s ease-out',
          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", system-ui, sans-serif',
        }}>
        <style>{`
          @keyframes drawer-slide-in { 0% { transform: translateX(20px); opacity: 0; } 100% { transform: translateX(0); opacity: 1; } }
          /* 原生日期输入内嵌化：去边框去底色，仅保留日历指示器暗示可点。
             font:inherit 会继承抽屉 16px 且压不住 WebKit date 内部默认尺寸 → 显式锁 12px；
             且不许被 flex 压扁：允许压缩时末位数字会被裁掉（曾出现 2026/09/ 缺日）
             日期输入：宽度 = 10 位日期（10ch）+ 8px 间隙 + 24px 圆角方形图标 + 2px 余量。
              宽度与指示器各自独立计算且强制留 8px 间隙——上一版把宽度算成「10ch + 图标宽」，
              数字与图标零缝隙，iOS 的月/日/年子字段最小宽度略大于 ch 估算值时就压住图标 */
          .dp { appearance: none; -webkit-appearance: none; background: transparent; border: none; outline: none;
            font-family: inherit; font-size: 12px; font-weight: 400; padding: 0; margin: 0;
            color: var(--text-1); cursor: pointer; font-variant-numeric: tabular-nums; line-height: 1.2; letter-spacing: -0.01em;
            width: calc(10ch + 34px); flex-shrink: 0; }
          /* 养护卡内的日期：去框后字段只剩文本，可编辑性靠虚线下划线暗示 */
          .dp.dp-u { padding-bottom: 2px; border-bottom: 1px dashed rgba(120,120,128,0.28); }
          /* WebKit 日期编辑区：与外层同字号（缺这条 Chrome 会用内部默认字号渲染数字） */
          .dp::-webkit-datetime-edit { padding: 0; font-size: 12px; font-weight: 400; }
          .dp::-webkit-datetime-edit-fields-wrapper { display: flex; font-size: 12px; font-weight: 400; }
          .dp::-webkit-datetime-edit-text { font-size: 12px; padding: 0; }
          /* 日历指示器 = 24×24 圆角方形点击区（原来 14px 图标紧贴数字）：自带 8px 左外边距
              与数字隔开，10% 中性底 + 7px 圆角，图标本体 14px 居中，热区即视觉尺寸 */
          .dp::-webkit-calendar-picker-indicator { cursor: pointer; opacity: .55; padding: 0; margin: 0 0 0 8px;
            width: 24px; height: 24px; flex-shrink: 0; box-sizing: border-box; border-radius: 7px;
            background-color: rgba(120,120,128,0.10);
            background-size: 14px 14px; background-position: center; background-repeat: no-repeat; }
          /* 头部「种植日期」：同样去框（原为白底 + 描边胶囊），只留内联文本 + 紧凑图标；
              宽度 = 10ch + 6px 间隙 + 20px 图标 + 4px 余量（头部字号更小，图标收一档） */
          .dp-capsule { padding: 0; border: none; background: transparent; border-radius: 0; width: calc(10ch + 30px); }
          .dp-capsule::-webkit-calendar-picker-indicator { width: 20px; height: 20px; border-radius: 6px;
            margin-left: 6px; background-size: 12px 12px; }
          /* Firefox：无指示器，纯文本即可 */
          .dp::-moz-dateedit, .dp::-moz-calendar-picker-indicator { font-size: 12px; }
        `}</style>

        {/* 头部 */}
        <div className="flex items-start gap-3 pl-4 pr-5 pt-3.5 pb-3"
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
            {/* 已种植天数 + 种植日期：去框后与前后文字同排（原生 date 输入，点击即弹系统日历） */}
            <div className="flex items-center gap-1 mt-1.5 text-[11px]" style={{ color: 'var(--text-3)' }}>
              <span>已种植</span>
              <span className="font-bold tabular-nums" style={{ color: '#238E3F' }}>{days}</span>
              <span>天 ·</span>
              <input type="date" value={form.planted_at} onChange={(e) => update('planted_at', e.target.value)}
                className="dp dp-capsule" title="修改种植日期" />
            </div>
          </div>
        </div>

        {/* 内容 */}
        <div className="px-4 py-3 flex flex-col gap-2.5">

          {/* 浇水卡：状态行（行动指引）+ 控制行（上次日期/周期，均可改）+ 打卡/撤销 */}
          <CareCard
            icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>}
            status={ws}
            doneToday={form.last_watered === today}
            markLabel="浇水"
            onMark={() => commit({ last_watered: today })}
            onUndo={() => commit({ last_watered: dateDaysAgo(form.water_cycle_days || 7) })}
            last={form.last_watered}
            cycle={form.water_cycle_days}
            maxCycle={90}
            onLastChange={(v) => update('last_watered', v)}
            onCycleChange={(v) => update('water_cycle_days', v)}
            markColor={ws.level === 'alert' ? '#FF3B30' : ws.level === 'warn' ? '#FF9500' : '#238E3F'}
          />

          {/* 施肥卡：同构（底色同样统一为中性浅灰，仅图标与主色区分） */}
          <CareCard
            icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M7 20h10"/><path d="M10 20c5.5-2.5.8-6.4 3-10"/><path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z"/><path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.5-4 1.5-4.9 2z"/></svg>}
            status={fs}
            doneToday={form.last_fertilized === today}
            markLabel="施肥"
            onMark={() => commit({ last_fertilized: today })}
            onUndo={() => commit({ last_fertilized: dateDaysAgo(form.fert_cycle_days || 30) })}
            last={form.last_fertilized}
            cycle={form.fert_cycle_days}
            maxCycle={365}
            onLastChange={(v) => update('last_fertilized', v)}
            onCycleChange={(v) => update('fert_cycle_days', v)}
            markColor="#8B6B4F"
          />

          {/* 特性 */}
          <div>
            <div className="text-[11px] text-[var(--text-3)] mb-1.5 font-semibold tracking-wide">特性</div>
            <textarea value={form.traits} onChange={(e) => update('traits', e.target.value)} placeholder="喜温暖湿润，耐阴…" rows={2}
              className="w-full text-[13.5px] text-[var(--text-1)] font-medium bg-[rgba(120,120,128,0.06)] rounded-lg px-3 py-2.5 outline-none border border-transparent focus:border-[#238E3F] resize-none leading-relaxed transition placeholder:text-[var(--ink-300)]" />
          </div>

          {/* 养护方法 */}
          <div>
            <div className="text-[11px] text-[var(--text-3)] mb-1.5 font-semibold tracking-wide">养护方法</div>
            <textarea value={form.care_method} onChange={(e) => update('care_method', e.target.value)} placeholder="每周浇水 1 次…" rows={2}
              className="w-full text-[13.5px] text-[var(--text-1)] font-medium bg-[rgba(120,120,128,0.06)] rounded-lg px-3 py-2.5 outline-none border border-transparent focus:border-[#238E3F] resize-none leading-relaxed transition placeholder:text-[var(--ink-300)]" />
          </div>
        </div>

        {/* 底部操作 */}
        <div className="flex gap-2 px-4 pb-3.5">
          <button onClick={() => onRemove(plant.id)}
            className="flex-1 py-2.5 rounded-lg text-[12px] font-semibold transition hover:brightness-95 active:scale-[0.98]"
            style={{ background: 'rgba(var(--danger-rgb),0.06)', color: 'var(--danger)', border: '1px solid rgba(var(--danger-rgb),0.1)' }}>
            移除
          </button>
          <button onClick={handleSave} disabled={!dirty}
            className="flex-1 py-2.5 rounded-lg text-[12px] font-semibold transition hover:brightness-95 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: '#238E3F', color: 'var(--surface-card)', boxShadow: '0 2px 8px rgba(35,142,63,0.2)' }}>
            保存
          </button>
        </div>
      </div>
    </>
  );
}

// ============================================================
// SettingsDrawer — 花架设置面板（右上角齿轮）
//   背景：纯色 / 上传图片
//   悬浮托板：增删托板 / 改色 / 调宽 / 恢复颜色
//   设置自动存 localStorage（实时预览）
//   排版对齐工作台既有面板：15px 标题 / 11px 段标 / var(--text-*) 文本层级
// ============================================================
const PRESET_BG_COLORS = ['#FFFFFF', '#FBFBF9', '#F6F5F1', '#FDFBF3', '#F5F0E8', '#EFECE4', '#F0F4E8', '#E8F0E0'];
const PLANT_GREEN = '#238E3F';

function SettingsDrawer({ settings, onChange, bgInputRef, boards, boardPalette, onBoardsChange, onAddBoard, onRemoveBoard, onClose }) {
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
    <div onClick={(e) => e.stopPropagation()}
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
      </div>
    </div>
  );
}
