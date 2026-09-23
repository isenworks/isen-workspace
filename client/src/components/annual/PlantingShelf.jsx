// ============================================================
// PlantingShelf — 种植花架画布组件
//   生活页「种植」类目选中时渲染，替代时间流主视图
//   功能：上传透明背景植物图 → 左键拖拽自由摆放 → 右键查看/编辑植物档案
//   设计：胡桃木三层花架 + 纯白微暖墙面 + 蜜蜂蝴蝶氛围 + 绿色光晕 + 浇水提醒
// ============================================================
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { API } from '../../api/client.js';
import { uid } from './utils.js';

// ---- 浇水状态计算 ----
// 绿=正常 / 橙=临期(距周期≤2天) / 红=超期(已过周期)
function waterStatus(plant) {
  if (!plant.last_watered || !plant.water_cycle_days) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const last = new Date(plant.last_watered); last.setHours(0, 0, 0, 0);
  const days = Math.round((today - last) / 86400000);
  const cycle = plant.water_cycle_days;
  if (days >= cycle) return { level: 'alert', color: '#FF3B30', text: `已超期 ${days - cycle} 天，请尽快浇水`, days };
  if (days >= cycle - 2) return { level: 'warn', color: '#FF9500', text: '建议今天浇水', days };
  return { level: 'ok', color: '#5FA85F', text: `${cycle - days} 天后浇水`, days };
}

// ---- 已种植天数 ----
function plantedDays(plant) {
  if (!plant.planted_at) return 0;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const p = new Date(plant.planted_at); p.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((today - p) / 86400000));
}

// ---- 蜜蜂 SVG ----
function Bee({ size = 28 }) {
  return (
    <svg width={size} height={size * 0.79} viewBox="0 0 28 22">
      <ellipse className="bee-wing" cx="10" cy="6" rx="7" ry="5" fill="rgba(255,255,255,0.7)" stroke="#ddd" strokeWidth="0.5" />
      <ellipse className="bee-wing" cx="18" cy="6" rx="7" ry="5" fill="rgba(255,255,255,0.7)" stroke="#ddd" strokeWidth="0.5" />
      <ellipse cx="14" cy="14" rx="8" ry="6" fill="#F5C724" />
      <rect x="10" y="10" width="2" height="8" fill="#3a3a3c" />
      <rect x="14" y="10" width="2" height="8" fill="#3a3a3c" />
      <rect x="18" y="11" width="1.5" height="6" fill="#3a3a3c" />
      <line x1="11" y1="8" x2="10" y2="4" stroke="#3a3a3c" strokeWidth="1" />
      <line x1="17" y1="8" x2="18" y2="4" stroke="#3a3a3c" strokeWidth="1" />
    </svg>
  );
}

// ---- 蝴蝶 SVG ----
function Butterfly({ size = 34, color = '#FFB347' }) {
  const dark = color === '#FFB347' ? '#FF9500' : '#9D5CDB';
  return (
    <svg width={size} height={size * 0.88} viewBox="0 0 34 30">
      <ellipse className="bf-wing" cx="10" cy="14" rx="9" ry="7" fill={color} opacity="0.82" />
      <ellipse className="bf-wing" cx="10" cy="22" rx="7" ry="5" fill={dark} opacity="0.75" />
      <ellipse className="bf-wing" cx="24" cy="14" rx="9" ry="7" fill={color} opacity="0.82" />
      <ellipse className="bf-wing" cx="24" cy="22" rx="7" ry="5" fill={dark} opacity="0.75" />
      <circle cx="10" cy="12" r="2" fill="#fff" opacity="0.6" />
      <circle cx="24" cy="12" r="2" fill="#fff" opacity="0.6" />
      <ellipse cx="17" cy="18" rx="1.8" ry="8" fill="#3a3a3c" />
      <path d="M16 10 q-2 -4 -4 -3" fill="none" stroke="#3a3a3c" strokeWidth="1" />
      <path d="M18 10 q2 -4 4 -3" fill="none" stroke="#3a3a3c" strokeWidth="1" />
    </svg>
  );
}

export default function PlantingShelf() {
  const [plants, setPlants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);   // 右键选中的 plant
  const [dragging, setDragging] = useState(null);    // 正在拖拽的 plant id
  const [showInfo, setShowInfo] = useState(false);    // 是否显示信息面板
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const dragOffset = useRef({ dx: 0, dy: 0 });
  const zCounter = useRef(1);

  // 加载植物列表
  const loadPlants = useCallback(async () => {
    try {
      const res = await API.plants.list();
      setPlants(res?.plants || []);
      // 更新 zCounter 为最大 z_index + 1
      const maxZ = (res?.plants || []).reduce((mx, p) => Math.max(mx, p.z_index || 0), 0);
      zCounter.current = maxZ + 1;
    } catch (e) { /* 静默 */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadPlants(); }, [loadPlants]);

  // ---- 文件上传 ----
  const handleFileSelect = useCallback(async (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    if (file.size > 2 * 1024 * 1024) { alert('图片不能超过 2MB'); return; }
    // 转 base64
    const reader = new FileReader();
    const dataUrl = await new Promise((resolve, reject) => {
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    // 校验
    const { image } = await API.plants.upload(dataUrl);
    // 创建植物，默认中心位置
    const z = zCounter.current++;
    const { plant } = await API.plants.create({
      name: '新植物',
      image,
      pos_x: 50,
      pos_y: 30,
      z_index: z,
      planted_at: new Date().toISOString().slice(0, 10),
      water_cycle_days: 7,
      last_watered: new Date().toISOString().slice(0, 10),
    });
    setPlants(prev => [...prev, plant]);
    // 自动选中新植物
    setSelected(plant);
    setShowInfo(true);
  }, []);

  const onFileInputChange = (e) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
    e.target.value = '';
  };

  // ---- 拖拽逻辑 ----
  const onPlantMouseDown = (e, plant) => {
    if (e.button !== 0) return; // 只响应左键
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = (plant.pos_x / 100) * rect.width;
    const py = (plant.pos_y / 100) * rect.height;
    dragOffset.current = { dx: e.clientX - rect.left - px, dy: e.clientY - rect.top - py };
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
      setPlants(prev => prev.map(p => p.id === dragging ? { ...p, pos_x: x, pos_y: y } : p));
    };
    const onUp = async () => {
      const plant = plants.find(p => p.id === dragging);
      if (plant) {
        try { await API.plants.update(plant.id, { pos_x: plant.pos_x, pos_y: plant.pos_y }); } catch {}
      }
      setDragging(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [dragging, plants]);

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
    } catch (e) { alert('保存失败: ' + e.message); }
  };

  // ---- 删除植物 ----
  const removePlant = async (id) => {
    if (!confirm('确认移除这株植物？')) return;
    try {
      await API.plants.remove(id);
      setPlants(prev => prev.filter(p => p.id !== id));
      setShowInfo(false);
      setSelected(null);
    } catch (e) { alert('删除失败: ' + e.message); }
  };

  // ---- 画布拖拽上传 ----
  const onCanvasDragOver = (e) => { e.preventDefault(); };
  const onCanvasDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('image/')) handleFileSelect(file);
  };

  // 画布点击关闭信息面板
  const onCanvasClick = () => {
    if (showInfo) { setShowInfo(false); setSelected(null); }
  };

  // 按层级排序
  const sortedPlants = useMemo(() => [...plants].sort((a, b) => (a.z_index || 0) - (b.z_index || 0)), [plants]);

  return (
    <div className="planting-shelf-wrap relative h-full min-h-[500px] overflow-hidden rounded-2xl"
      style={{ background: 'linear-gradient(172deg, #FFFFFF 0%, #FBFBF9 60%, #F6F5F1 100%)' }}>
      <style>{`
        /* 蜜蜂翅膀扇动 */
        .bee-wing { transform-origin: center; animation: wing-flap 0.15s ease-in-out infinite alternate; }
        @keyframes wing-flap { 0% { transform: scaleY(1); } 100% { transform: scaleY(0.3); } }
        /* 蝴蝶翅膀开合 */
        .bf-wing { transform-origin: center; animation: b-wing 0.4s ease-in-out infinite alternate; }
        @keyframes b-wing { 0% { transform: scaleX(1); } 100% { transform: scaleX(0.6); } }
        /* 植物微摇 */
        .plant-sway { transform-origin: bottom center; animation: plant-sway 4s ease-in-out infinite alternate; }
        @keyframes plant-sway { 0% { transform: rotate(-1.5deg); } 100% { transform: rotate(1.5deg); } }
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
        /* 光尘 */
        .dust { animation: dust 14s ease-in-out infinite alternate; }
        @keyframes dust { 0% { opacity: 0.15; transform: translateY(0); } 100% { opacity: 0.3; transform: translateY(-8px); } }
        @media (prefers-reduced-motion: reduce) {
          .bee-wing, .bf-wing, .plant-sway, .bee-fly-1, .bee-fly-2, .bf-fly-1, .bf-fly-2, .dust { animation: none !important; }
        }
      `}</style>

      {/* 花架画布 */}
      <div ref={canvasRef}
        className="relative w-full h-full"
        onClick={onCanvasClick}
        onDragOver={onCanvasDragOver}
        onDrop={onCanvasDrop}>

        {/* 光尘粒子 */}
        <div className="absolute inset-0 pointer-events-none dust" style={{
          backgroundImage: [
            'radial-gradient(circle at 25% 30%, rgba(255,250,235,0.3) 1px, transparent 2px)',
            'radial-gradient(circle at 60% 50%, rgba(255,250,235,0.2) 1px, transparent 2px)',
            'radial-gradient(circle at 80% 20%, rgba(255,250,235,0.25) 1px, transparent 2px)',
            'radial-gradient(circle at 15% 85%, rgba(255,250,235,0.2) 1px, transparent 2px)',
            'radial-gradient(circle at 90% 60%, rgba(255,250,235,0.15) 1px, transparent 2px)',
          ].join(','),
        }} />

        {/* 胡桃木层板（z-index 高于植物，盖住花盆底部） */}
        {[28, 56, 82].map((top, i) => (
          <div key={i} className="absolute left-0 right-0" style={{
            top: `${top}%`, height: '8px', zIndex: 4,
            background: 'linear-gradient(180deg, #C4A480 0%, #A68B6B 45%, #8A7050 100%)',
            boxShadow: '0 3px 6px rgba(106,84,53,0.3), inset 0 1px 0 rgba(255,240,220,0.4), inset 0 -1px 0 #6A5435',
            borderRadius: '2px',
          }}>
            <div className="absolute left-0 right-0 top-full" style={{
              height: '6px',
              background: 'linear-gradient(180deg, rgba(106,84,53,0.2), transparent)',
              filter: 'blur(3px)',
            }} />
          </div>
        ))}

        {/* 蜜蜂 */}
        <div className="absolute pointer-events-none" style={{ left: '5%', top: '6%', zIndex: 6 }}>
          <div className="bee-fly-1"><Bee size={28} /></div>
        </div>
        <div className="absolute pointer-events-none" style={{ right: '12%', top: '68%', zIndex: 6 }}>
          <div className="bee-fly-2"><Bee size={24} /></div>
        </div>

        {/* 蝴蝶 */}
        <div className="absolute pointer-events-none" style={{ right: '8%', top: '28%', zIndex: 6 }}>
          <div className="bf-fly-1"><Butterfly size={34} color="#FFB347" /></div>
        </div>
        <div className="absolute pointer-events-none" style={{ left: '3%', top: '66%', zIndex: 6 }}>
          <div className="bf-fly-2"><Butterfly size={26} color="#C77DFF" /></div>
        </div>

        {/* 顶部栏 */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-5 py-3.5" style={{ zIndex: 5 }}>
          <div className="flex items-baseline gap-2">
            <span className="text-[15px] font-bold text-ink-900 tracking-tight">我的花架</span>
            <span className="text-[11px] text-ink-500">{plants.length} 株 · 3 层</span>
          </div>
        </div>

        {/* 植物们 */}
        {sortedPlants.map(plant => {
          const isSel = selected?.id === plant.id;
          const ws = waterStatus(plant);
          return (
            <div key={plant.id}
              className="absolute cursor-grab active:cursor-grabbing select-none"
              style={{
                left: `${plant.pos_x}%`, top: `${plant.pos_y}%`,
                zIndex: isSel ? 6 : (plant.z_index || 0),
                transform: 'translate(-50%, -50%)',
                transition: dragging === plant.id ? 'none' : 'transform 0.18s cubic-bezier(.34,1.56,.64,1)',
              }}
              onMouseDown={(e) => onPlantMouseDown(e, plant)}
              onContextMenu={(e) => onPlantContextMenu(e, plant)}>
              {/* 绿色光晕 */}
              <div className="absolute pointer-events-none" style={{
                inset: '-8px -8px -4px', borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(95,168,95,0.18), transparent 70%)',
                opacity: isSel || dragging === plant.id ? 1 : 0,
                transition: 'opacity 0.2s',
              }} />
              {/* 植物图片 */}
              <img src={plant.image} alt={plant.name || '植物'}
                className="plant-sway block max-w-[140px] max-h-[160px] object-contain"
                draggable={false}
                style={{
                  filter: 'drop-shadow(0 5px 6px rgba(80,60,30,0.15))',
                  pointerEvents: 'none',
                }} />
              {/* 名称气泡 */}
              <div className="absolute left-1/2 -bottom-5 -translate-x-1/2 px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap"
                style={{
                  background: isSel ? '#3E7D3E' : 'rgba(255,255,255,0.88)',
                  color: isSel ? '#fff' : '#3a3a3c',
                  opacity: isSel || dragging === plant.id ? 1 : 0,
                  transition: 'opacity 0.15s',
                  pointerEvents: 'none',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                }}>
                {plant.name || '未命名'}
              </div>
              {/* 浇水超期角标 */}
              {ws?.level === 'alert' && (
                <div className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center"
                  style={{ background: '#FF3B30', boxShadow: '0 1px 4px rgba(255,59,48,0.4)' }}>
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><path d="M12 5v8M12 17h.01"/></svg>
                </div>
              )}
            </div>
          );
        })}

        {/* 空状态 */}
        {plants.length === 0 && !loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-ink-500" style={{ zIndex: 3 }}>
            <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
              <ellipse cx="36" cy="52" rx="22" ry="12" fill="#E8D5C4" />
              <path d="M36 48 C36 30 44 18 52 14 C50 28 44 40 36 48 Z" fill="#5FA85F" opacity="0.7" />
              <path d="M36 48 C36 34 28 22 20 18 C22 32 28 44 36 48 Z" fill="#7BB36B" opacity="0.7" />
              <path d="M36 48 C36 36 36 22 36 8 C36 22 36 36 36 48 Z" fill="#3E7D3E" opacity="0.6" />
            </svg>
            <div className="text-center">
              <div className="text-sm font-semibold text-ink-700">还没有植物</div>
              <div className="text-[11px] mt-1">点右下角 + 添加你的第一株植物</div>
              <div className="text-[10px] mt-0.5 text-ink-400">推荐上传透明背景 PNG</div>
            </div>
          </div>
        )}

        {/* 加载状态 */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center text-[12px] text-ink-500" style={{ zIndex: 3 }}>
            正在加载花架…
          </div>
        )}

        {/* 右下角 + 按钮 */}
        <button onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
          className="absolute right-4 bottom-4 w-11 h-11 rounded-[14px] grid place-items-center transition hover:scale-110 hover:rotate-90"
          style={{ zIndex: 7, background: '#3E7D3E', color: '#fff', boxShadow: '0 6px 20px rgba(62,125,62,0.25)' }}
          title="添加植物 · 支持 PNG 透明图">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        </button>
        <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
          onChange={onFileInputChange} />

        {/* 信息面板（右键抽屉） */}
        {showInfo && selected && (
          <InfoDrawer key={selected.id}
            plant={selected}
            onSave={savePlant}
            onRemove={removePlant}
            onClose={() => { setShowInfo(false); setSelected(null); }}
            onCanvasClick={onCanvasClick}
          />
        )}
      </div>
    </div>
  );
}

// ============================================================
// InfoDrawer — 植物信息面板（从右侧滑入）
// ============================================================
function InfoDrawer({ plant, onSave, onRemove, onClose }) {
  const [form, setForm] = useState({
    name: plant.name || '',
    planted_at: plant.planted_at || '',
    traits: plant.traits || '',
    care_method: plant.care_method || '',
    water_cycle_days: plant.water_cycle_days || 7,
    last_watered: plant.last_watered || '',
  });
  const [dirty, setDirty] = useState(false);

  const update = (field, val) => { setForm(f => ({ ...f, [field]: val })); setDirty(true); };

  const days = plantedDays(plant);
  const ws = waterStatus(plant);

  // 浇水快捷按钮：更新上次浇水为今天
  const markWatered = async () => {
    const today = new Date().toISOString().slice(0, 10);
    update('last_watered', today);
    onSave({ last_watered: today, name: form.name, planted_at: form.planted_at, traits: form.traits, care_method: form.care_method, water_cycle_days: form.water_cycle_days });
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
        className="absolute top-12 right-4 w-[264px] overflow-hidden"
        style={{
          zIndex: 10,
          background: 'rgba(255,255,255,0.95)',
          backdropFilter: 'blur(20px)',
          borderRadius: '14px',
          border: '1px solid rgba(0,0,0,0.06)',
          boxShadow: '0 16px 48px rgba(0,0,0,0.1), 0 4px 12px rgba(0,0,0,0.04)',
          animation: 'drawer-slide-in 0.2s ease-out',
        }}>
        <style>{`
          @keyframes drawer-slide-in { 0% { transform: translateX(20px); opacity: 0; } 100% { transform: translateX(0); opacity: 1; } }
        `}</style>

        {/* 头部 */}
        <div className="relative flex items-end gap-2.5 px-3.5 pb-2.5 pt-3"
          style={{
            background: 'linear-gradient(135deg, rgba(95,168,95,0.06), rgba(62,125,62,0.04))',
            borderBottom: '1px solid rgba(0,0,0,0.06)',
          }}>
          <div className="w-12 h-12 rounded-xl grid place-items-center flex-shrink-0"
            style={{ background: 'rgba(95,168,95,0.1)', border: '1px solid rgba(0,0,0,0.06)' }}>
            <img src={plant.image} alt="" className="w-7 h-7 object-contain" />
          </div>
          <div className="flex-1 min-w-0">
            <input value={form.name} onChange={(e) => update('name', e.target.value)}
              placeholder="植物名称"
              className="text-[14px] font-bold text-ink-900 bg-transparent outline-none border-b border-transparent focus:border-[#3E7D3E] transition w-full" />
            <div className="text-[10px] text-ink-500 mt-0.5">种植于 {form.planted_at || '未设置'}</div>
          </div>
          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full"
            style={{ color: '#3E7D3E', background: 'rgba(95,168,95,0.1)' }}>
            第 {Math.ceil((plant.pos_y || 0) / 33) || 1} 层
          </span>
        </div>

        {/* 内容 */}
        <div className="px-3.5 py-3 flex flex-col gap-2.5">
          {/* 已种植天数 */}
          <div>
            <div className="text-[9px] font-bold text-ink-500 tracking-wide uppercase mb-1">已种植</div>
            <div className="flex items-baseline gap-1">
              <span className="text-[22px] font-extrabold" style={{ color: '#3E7D3E', lineHeight: 1 }}>{days}</span>
              <span className="text-[11px] text-ink-500">天</span>
            </div>
          </div>

          {/* 种植时间 */}
          <div>
            <div className="text-[9px] font-bold text-ink-500 tracking-wide uppercase mb-1">种植时间</div>
            <input type="date" value={form.planted_at} onChange={(e) => update('planted_at', e.target.value)}
              className="w-full text-[11px] text-ink-700 bg-[rgba(120,120,128,0.05)] rounded-md px-2 py-1.5 outline-none border border-transparent focus:border-[#3E7D3E]" />
          </div>

          {/* 特性 */}
          <div>
            <div className="text-[9px] font-bold text-ink-500 tracking-wide uppercase mb-1">特性</div>
            <textarea value={form.traits} onChange={(e) => update('traits', e.target.value)} placeholder="喜温暖湿润，耐阴…" rows={2}
              className="w-full text-[11px] text-ink-700 bg-[rgba(120,120,128,0.05)] rounded-md px-2 py-1.5 outline-none border border-transparent focus:border-[#3E7D3E] resize-none leading-relaxed" />
          </div>

          {/* 养护方法 */}
          <div>
            <div className="text-[9px] font-bold text-ink-500 tracking-wide uppercase mb-1">养护方法</div>
            <textarea value={form.care_method} onChange={(e) => update('care_method', e.target.value)} placeholder="每周浇水 1 次…" rows={2}
              className="w-full text-[11px] text-ink-700 bg-[rgba(120,120,128,0.05)] rounded-md px-2 py-1.5 outline-none border border-transparent focus:border-[#3E7D3E] resize-none leading-relaxed" />
          </div>

          {/* 浇水提醒 */}
          <div>
            <div className="text-[9px] font-bold text-ink-500 tracking-wide uppercase mb-1 flex items-center justify-between">
              <span>浇水提醒</span>
              <button onClick={markWatered}
                className="text-[9px] font-bold px-1.5 py-0.5 rounded transition"
                style={{ color: '#3E7D3E', background: 'rgba(95,168,95,0.1)' }}>
                ✓ 今日已浇
              </button>
            </div>
            <div className="flex items-center gap-1.5 mb-1">
              <span>周期</span>
              <input type="number" min={1} max={90} value={form.water_cycle_days}
                onChange={(e) => update('water_cycle_days', parseInt(e.target.value) || 7)}
                className="w-12 text-[11px] text-center bg-[rgba(120,120,128,0.05)] rounded px-1.5 py-0.5 outline-none border border-transparent focus:border-[#3E7D3E]" />
              <span className="text-[11px] text-ink-500">天</span>
            </div>
            {ws && (
              <div className="flex items-center gap-1.5 text-[10px]">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: ws.color }} />
                <span className="text-ink-500">{ws.text}</span>
              </div>
            )}
          </div>
        </div>

        {/* 底部操作 */}
        <div className="flex gap-1.5 px-3.5 pb-3">
          <button onClick={() => onRemove(plant.id)}
            className="flex-1 py-1.5 rounded-lg text-[11px] font-bold transition hover:brightness-95"
            style={{ background: 'rgba(255,59,48,0.08)', color: '#FF3B30', border: '1px solid rgba(255,59,48,0.12)' }}>
            移除
          </button>
          <button onClick={handleSave} disabled={!dirty}
            className="flex-1 py-1.5 rounded-lg text-[11px] font-bold transition hover:brightness-95 disabled:opacity-40"
            style={{ background: '#3E7D3E', color: '#fff', boxShadow: '0 2px 8px rgba(62,125,62,0.2)' }}>
            保存
          </button>
        </div>
      </div>
    </>
  );
}
