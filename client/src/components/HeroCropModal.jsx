import { useEffect, useRef, useState } from 'react';

/**
 * Hero 背景横幅裁剪 Modal（纯 Canvas 实现，无第三方依赖）
 * 与 AvatarCropModal 同款交互：拖动调位置 · 滚轮/滑块缩放
 * 区别：矩形裁剪框（3:1 宽幅，贴合 Hero 通栏比例），整框即裁剪结果（所见即所得）
 * 拖拽/缩放均做边缘钳制，图片始终铺满裁剪框、不会出现空白
 *
 * Props:
 *   open: boolean
 *   file: File
 *   onClose: () => void
 *   onConfirm: (croppedBlob: Blob) => void
 */
export default function HeroCropModal({ open, file, onClose, onConfirm }) {
  const canvasRef = useRef(null);
  const [img, setImg] = useState(null);
  const [scale, setScale] = useState(1);       // 图片相对原图的缩放比例
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragState = useRef({ active: false, startX: 0, startY: 0, ox: 0, oy: 0 });

  // 画布（= 裁剪框）尺寸：3:1 宽幅，贴合 Hero 通栏
  const CW = 480, CH = 160;

  // 加载图片
  useEffect(() => {
    if (!open || !file) return;
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => { setImg(im); };
    im.src = url;
    return () => { setImg(null); URL.revokeObjectURL(url); };
  }, [open, file]);

  // 铺满裁剪框所需的最小缩放（cover）
  function coverScale(im) { return Math.max(CW / im.width, CH / im.height); }
  // 钳制缩放：cover ~ cover×6
  function clampScale(s) {
    if (!img) return s;
    const c = coverScale(img);
    return Math.max(c, Math.min(c * 6, s));
  }
  // 钳制偏移：图片始终铺满裁剪框（不露空白）
  function clampOffset(o, s) {
    if (!img) return o;
    const w = img.width * s, h = img.height * s;
    return {
      x: Math.min(0, Math.max(CW - w, o.x)),
      y: Math.min(0, Math.max(CH - h, o.y)),
    };
  }

  // 图片加载完成 → cover 铺满 + 居中
  useEffect(() => {
    if (!img) return;
    const s = coverScale(img);
    setScale(s);
    setOffset({ x: (CW - img.width * s) / 2, y: (CH - img.height * s) / 2 });
  }, [img]);

  // 缩放变化 → 重新钳制偏移
  useEffect(() => { setOffset(o => clampOffset(o, scale)); }, [scale]);

  // 渲染画布
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, CW, CH);
    ctx.fillStyle = '#1c1c1e';
    ctx.fillRect(0, 0, CW, CH);
    if (!img) return;

    ctx.drawImage(img, offset.x, offset.y, img.width * scale, img.height * scale);

    // 三分线辅助构图
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i <= 2; i++) {
      ctx.moveTo((CW / 3) * i, 0); ctx.lineTo((CW / 3) * i, CH);
      ctx.moveTo(0, (CH / 3) * i); ctx.lineTo(CW, (CH / 3) * i);
    }
    ctx.stroke();

    // 裁剪框边缘
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(0.75, 0.75, CW - 1.5, CH - 1.5);
  }, [img, scale, offset]);

  // 拖动图片
  function onMouseDown(e) {
    if (!img) return;
    dragState.current = {
      active: true, startX: e.clientX, startY: e.clientY, ox: offset.x, oy: offset.y
    };
  }
  useEffect(() => {
    function onMove(e) {
      if (!dragState.current.active) return;
      const dx = e.clientX - dragState.current.startX;
      const dy = e.clientY - dragState.current.startY;
      setOffset(clampOffset({ x: dragState.current.ox + dx, y: dragState.current.oy + dy }, scale));
    }
    function onUp() { dragState.current.active = false; }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [scale, img]);

  // 滚轮缩放
  function onWheel(e) {
    e.preventDefault();
    if (!img) return;
    const delta = -e.deltaY * 0.0015;
    setScale(s => clampScale(s + s * delta));
  }

  // 确认裁剪 → 输出 1600×533 JPEG
  function handleConfirm() {
    if (!img) return;
    const OUT_W = 1600, OUT_H = 533;
    const oc = document.createElement('canvas');
    oc.width = OUT_W; oc.height = OUT_H;
    const octx = oc.getContext('2d');
    // 裁剪框整体映射到原图坐标
    octx.drawImage(
      img,
      -offset.x / scale, -offset.y / scale,
      CW / scale, CH / scale,
      0, 0, OUT_W, OUT_H
    );
    oc.toBlob(blob => {
      if (blob) onConfirm(blob);
    }, 'image/jpeg', 0.85);
  }

  if (!open) return null;

  return (
    <div style={styles.overlay} onMouseDown={e => e.stopPropagation()}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <div style={styles.title}>裁剪 Hero 背景</div>
          <div style={{ fontSize: '12px', color: '#8e8e93' }}>拖动调整位置 · 滚轮或滑块缩放</div>
        </div>

        <div
          style={{ ...styles.canvasWrap, cursor: img ? 'grab' : 'default' }}
          onMouseDown={onMouseDown}
          onWheel={onWheel}
        >
          <canvas ref={canvasRef} width={CW} height={CH} style={{ display: 'block', borderRadius: '12px', width: '100%' }} />
        </div>

        <div style={styles.sliderRow}>
          <span style={{ fontSize: '12px', color: '#8e8e93', width: '28px' }}>缩小</span>
          <input
            type="range" min={0} max={100}
            value={img ? Math.round(((scale / coverScale(img)) - 1) / 5 * 100) : 0}
            onChange={e => {
              if (!img) return;
              const ratio = 1 + (Number(e.target.value) / 100) * 5;
              setScale(clampScale(coverScale(img) * ratio));
            }}
            style={{ flex: 1, accentColor: 'var(--s-main)' }}
          />
          <span style={{ fontSize: '12px', color: '#8e8e93', width: '28px', textAlign: 'right' }}>放大</span>
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
