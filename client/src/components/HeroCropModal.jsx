import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Hero 背景横幅裁剪 Modal（纯 Canvas 实现，无第三方依赖 · 选区模式）
 *
 * 交互（对齐专业图片裁剪器：完整图片可见 + 3:1 选区框）：
 *   · 图片 contain 完整显示在画布中，选区外半透明遮罩 —— 所见即所得
 *   · 拖动选区移动取景；四角手柄 / 滚轮 / 滑块缩放选区（锁定 3:1）
 *   · 选区始终约束在图片范围内 → 任意宽高比（含超宽 banner）都能裁到顶部/底部区域
 *   · 双击画布重置为最大选区
 *   · 输出 1440×480 JPEG，自适应质量压缩（≤80KB/张 × 15 张 ≈ 1.6MB base64，守住 D1 单行 2MB / localStorage 配额）
 *
 * Props:
 *   open: boolean
 *   source: File（新上传）| string（data URL，重新编辑已存图）
 *   onClose: () => void
 *   onConfirm: (croppedBlob: Blob) => void
 */
export default function HeroCropModal({ open, source, onClose, onConfirm }) {
  const canvasRef = useRef(null);
  const [img, setImg] = useState(null);
  const [box, setBox] = useState(null);   // 选区 { x, y, w }（画布逻辑坐标，高 = w/3）
  const [cursor, setCursor] = useState('default');
  const boxRef = useRef(null);
  const dragRef = useRef(null);           // { mode: 'move'|'resize', id, startX, startY, box0 }

  const CW = 480;                          // 画布逻辑宽（= modal 内容区宽）
  const CH_CAP = 280;                      // 画布高上限（图片 contain 适配）
  const OUT_W = 1440, OUT_H = 480;         // 输出尺寸（3:1，贴合 Hero 通栏）
  const DPR = Math.min(window.devicePixelRatio || 1, 2);

  /* ---- 图片几何：contain 适配 CW × CH_CAP；画布高随图片（下限 96 防超宽图过扁） ---- */
  const geo = useMemo(() => {
    if (!img) return null;
    const sf = Math.min(CW / img.width, CH_CAP / img.height);
    const dw = img.width * sf, dh = img.height * sf;
    const ch = Math.max(Math.round(dh), 96);
    const imgX = (CW - dw) / 2, imgY = (ch - dh) / 2;
    const wMax = Math.min(dw, dh * 3);     // 3:1 选区在图片内的最大宽
    // 最小选区宽：输出上采样不超过 2 倍（≥720·sf），且不小于最大选区的 15%
    const wMin = Math.min(wMax, Math.max(720 * sf, wMax * 0.15, 40));
    return { sf, dw, dh, ch, imgX, imgY, wMin, wMax };
  }, [img]);

  /* ---- 选区钳制：锁定 3:1 且完全落在图片内（不露空白） ---- */
  function clampBox(b) {
    if (!geo) return b;
    const w = Math.min(geo.wMax, Math.max(geo.wMin, b.w));
    const h = w / 3;
    return {
      w,
      x: Math.min(geo.imgX + geo.dw - w, Math.max(geo.imgX, b.x)),
      y: Math.min(geo.imgY + geo.dh - h, Math.max(geo.imgY, b.y)),
    };
  }

  // 加载图片：File（新上传）或 data URL（重新编辑已存图，无需 revoke）
  useEffect(() => {
    if (!open || !source) return;
    const url = typeof source === 'string' ? source : URL.createObjectURL(source);
    const im = new Image();
    im.onload = () => { setImg(im); };
    im.src = url;
    return () => { setImg(null); setBox(null); if (typeof source !== 'string') URL.revokeObjectURL(url); };
  }, [open, source]);

  // 图片加载 → 初始选区 = 最大选区居中（与 cover 裁剪等价）
  useEffect(() => {
    if (!geo) return;
    const w = geo.wMax, h = w / 3;
    setBox({ w, x: geo.imgX + (geo.dw - w) / 2, y: geo.imgY + (geo.dh - h) / 2 });
  }, [geo]);

  // box 渲染期同步到 ref（拖动闭包读最新值）
  boxRef.current = box;

  /* ---- 渲染画布 ---- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !geo || !box) return;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const CH = geo.ch;
    // 画布底（图片外区域）
    ctx.fillStyle = '#1c1c1e';
    ctx.fillRect(0, 0, CW, CH);
    // 完整图片（所见即所得）
    ctx.drawImage(img, geo.imgX, geo.imgY, geo.dw, geo.dh);
    // 选区外半透明遮罩
    const bx = box.x, by = box.y, bw = box.w, bh = bw / 3;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, CW, by);
    ctx.fillRect(0, by + bh, CW, CH - by - bh);
    ctx.fillRect(0, by, bx, bh);
    ctx.fillRect(bx + bw, by, CW - bx - bw, bh);
    // 三分线辅助构图
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i <= 2; i++) {
      ctx.moveTo(bx + (bw / 3) * i, by); ctx.lineTo(bx + (bw / 3) * i, by + bh);
      ctx.moveTo(bx, by + (bh / 3) * i); ctx.lineTo(bx + bw, by + (bh / 3) * i);
    }
    ctx.stroke();
    // 选区边框
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(bx + 0.75, by + 0.75, bw - 1.5, bh - 1.5);
    // 四角手柄
    ctx.fillStyle = '#fff';
    [[bx, by], [bx + bw, by], [bx, by + bh], [bx + bw, by + bh]].forEach(([hx, hy]) => {
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(hx - 4, hy - 4, 8, 8, 2);
      else ctx.rect(hx - 4, hy - 4, 8, 8);
      ctx.fill();
    });
  }, [img, geo, box]);

  /* ---- 命中检测：四角手柄 > 选区内 > 图片区域 ---- */
  function hitTest(mx, my) {
    const b = boxRef.current;
    if (!b || !geo) return null;
    const h = b.w / 3;
    const handles = [
      { id: 'lt', x: b.x, y: b.y }, { id: 'rt', x: b.x + b.w, y: b.y },
      { id: 'lb', x: b.x, y: b.y + h }, { id: 'rb', x: b.x + b.w, y: b.y + h },
    ];
    for (const hd of handles) {
      if (Math.abs(mx - hd.x) <= 11 && Math.abs(my - hd.y) <= 11) return { mode: 'resize', id: hd.id };
    }
    if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + h) return { mode: 'move' };
    if (mx >= geo.imgX && mx <= geo.imgX + geo.dw && my >= geo.imgY && my <= geo.imgY + geo.dh) return { mode: 'move' };
    return null;
  }

  // 鼠标 → 画布逻辑坐标
  function toLogical(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (CW / rect.width),
      y: (e.clientY - rect.top) * (geo ? geo.ch / rect.height : 1),
    };
  }

  function onMouseDown(e) {
    if (!img || !geo || !box) return;
    const p = toLogical(e);
    const hit = hitTest(p.x, p.y);
    if (!hit) return;
    dragRef.current = { ...hit, startX: p.x, startY: p.y, box0: { ...boxRef.current } };
  }

  // 拖动：move 平移 / resize 以对角为锚沿 3:1 对角方向缩放
  useEffect(() => {
    if (!open) return;
    function onMove(e) {
      const d = dragRef.current;
      if (!d || !geo) return;
      const p = toLogical(e);
      const dx = p.x - d.startX, dy = p.y - d.startY;
      const b0 = d.box0;
      if (d.mode === 'move') {
        setBox(clampBox({ x: b0.x + dx, y: b0.y + dy, w: b0.w }));
        return;
      }
      const anchors = {
        rb: { x: b0.x, y: b0.y, dir: [1, 1 / 3] },
        lt: { x: b0.x + b0.w, y: b0.y + b0.w / 3, dir: [-1, -1 / 3] },
        rt: { x: b0.x, y: b0.y + b0.w / 3, dir: [1, -1 / 3] },
        lb: { x: b0.x + b0.w, y: b0.y, dir: [-1, 1 / 3] },
      };
      const a = anchors[d.id];
      const dw = 0.9 * (dx * a.dir[0] + dy * a.dir[1]);   // 位移沿对角方向的投影
      const w = Math.min(geo.wMax, Math.max(geo.wMin, b0.w + dw));
      setBox(clampBox({
        w,
        x: a.dir[0] > 0 ? a.x : a.x - w,
        y: a.dir[1] > 0 ? a.y : a.y - w / 3,
      }));
    }
    function onUp() { dragRef.current = null; }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [open, geo, img]);

  // hover 光标反馈（非拖动态）
  function updateCursor(e) {
    if (dragRef.current || !geo || !box) return;
    const p = toLogical(e);
    const hit = hitTest(p.x, p.y);
    setCursor(
      hit?.mode === 'resize' ? ((hit.id === 'lt' || hit.id === 'rb') ? 'nwse-resize' : 'nesw-resize')
        : hit?.mode === 'move' ? 'move'
        : 'default'
    );
  }

  // 滚轮：以选区中心为锚缩放
  function onWheel(e) {
    e.preventDefault();
    if (!geo || !box) return;
    const b = boxRef.current;
    const cx = b.x + b.w / 2, cy = b.y + b.w / 6;
    const w = Math.min(geo.wMax, Math.max(geo.wMin, b.w * (1 - e.deltaY * 0.0012)));
    setBox(clampBox({ x: cx - w / 2, y: cy - w / 6, w }));
  }

  // 双击重置为最大选区
  function onDblClick() {
    if (!geo) return;
    const w = geo.wMax, h = w / 3;
    setBox({ w, x: geo.imgX + (geo.dw - w) / 2, y: geo.imgY + (geo.dh - h) / 2 });
  }

  /* ---- 确认：选区映射回原图坐标，输出 1440×480，自适应质量压缩 ---- */
  function handleConfirm() {
    if (!img || !geo || !box) return;
    const sx = (box.x - geo.imgX) / geo.sf;
    const sy = (box.y - geo.imgY) / geo.sf;
    const sw = box.w / geo.sf, sh = (box.w / 3) / geo.sf;
    const oc = document.createElement('canvas');
    oc.width = OUT_W; oc.height = OUT_H;
    const octx = oc.getContext('2d');
    octx.drawImage(img, sx, sy, sw, sh, 0, 0, OUT_W, OUT_H);
    const qualities = [0.82, 0.72, 0.62, 0.52, 0.45];
    (function attempt(i) {
      oc.toBlob(blob => {
        if (blob && (blob.size <= 80 * 1024 || i === qualities.length - 1)) {
          onConfirm(blob);
        } else {
          attempt(i + 1);
        }
      }, 'image/jpeg', qualities[i]);
    })(0);
  }

  if (!open) return null;

  const reedit = typeof source === 'string';   // 重新编辑已存图（笔图标入口）
  const zoom = (geo && box) ? OUT_W / (box.w / geo.sf) : 1;
  const smallImg = geo && (geo.wMax - geo.wMin) < 8;   // 原图太小：选区无法再缩小（输出会模糊）

  return (
    <div style={styles.overlay} onMouseDown={e => e.stopPropagation()}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <div style={styles.title}>{reedit ? '调整背景图' : '裁剪 Hero 背景'}</div>
          <div style={{ fontSize: '12px', color: '#8e8e93' }}>
            {reedit ? '在当前图片基础上重新取景 · 双击复位' : '拖动选区取景 · 角柄 / 滚轮调整大小 · 双击复位'}
          </div>
        </div>

        <div
          style={{ ...styles.canvasWrap, cursor }}
          onMouseDown={onMouseDown}
          onMouseMove={updateCursor}
          onWheel={onWheel}
          onDoubleClick={onDblClick}
        >
          {img && geo ? (
            <canvas ref={canvasRef} width={CW * DPR} height={geo.ch * DPR} style={{ display: 'block', borderRadius: '12px', width: '100%' }} />
          ) : (
            <div style={{ height: 160, display: 'grid', placeItems: 'center', color: '#8e8e93', fontSize: 13 }}>加载图片中…</div>
          )}
          {/* 输出倍率指示（超过 ×2 提示放大可能模糊） */}
          {img && geo && box && (
            <div style={{
              position: 'absolute', top: 8, right: 8,
              padding: '2px 7px', borderRadius: 7,
              background: 'rgba(0,0,0,0.55)', color: zoom > 2 ? '#FF9F0A' : 'rgba(255,255,255,0.92)',
              fontSize: 10.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
            }}>×{zoom.toFixed(1)}</div>
          )}
        </div>

        <div style={styles.sliderRow}>
          {smallImg ? (
            <div style={{ flex: 1, textAlign: 'center', fontSize: 12, color: '#8e8e93' }}>原图较小，仅可拖动选区位置</div>
          ) : (
            <>
              <span style={{ fontSize: '12px', color: '#8e8e93', width: '38px' }}>视野广</span>
              <input
                type="range" min={0} max={100}
                value={geo && box ? Math.round(((geo.wMax - box.w) / (geo.wMax - geo.wMin)) * 100) : 0}
                onChange={e => {
                  if (!geo || !box) return;
                  const t = Number(e.target.value) / 100;
                  const w = geo.wMax - (geo.wMax - geo.wMin) * t;
                  const cx = box.x + box.w / 2, cy = box.y + box.w / 6;
                  setBox(clampBox({ x: cx - w / 2, y: cy - w / 6, w }));
                }}
                style={{ flex: 1, accentColor: 'var(--s-main)' }}
              />
              <span style={{ fontSize: '12px', color: '#8e8e93', width: '38px', textAlign: 'right' }}>特写</span>
            </>
          )}
        </div>

        <div style={styles.footer}>
          <button onClick={onClose} className="btn-secondary" style={{ padding: '8px 18px' }}>取消</button>
          <button onClick={handleConfirm} className="btn-primary" style={{ padding: '8px 18px' }}>确认使用</button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.5)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 10000
  },
  modal: {
    width: '516px',
    background: '#fff',
    borderRadius: '18px',
    padding: '18px 18px 16px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.25)'
  },
  header: { marginBottom: '14px' },
  title: { fontSize: '16px', fontWeight: '700', color: '#1c1c1e', marginBottom: '4px' },
  canvasWrap: {
    width: '480px', maxWidth: '100%', margin: '0 auto',
    borderRadius: '12px', overflow: 'hidden',
    position: 'relative',
    touchAction: 'none', userSelect: 'none'
  },
  sliderRow: {
    display: 'flex', alignItems: 'center', gap: '10px',
    marginTop: '16px', padding: '0 6px'
  },
  footer: {
    display: 'flex', justifyContent: 'flex-end', gap: '10px',
    marginTop: '16px'
  }
};
