import { useEffect, useRef, useState } from 'react';

/**
 * 头像裁剪 Modal（纯 Canvas 实现，无第三方依赖）
 * 功能：
 *  - 圆形预览框 + 圆形裁剪结果
 *  - 拖动图片调整裁剪位置
 *  - 滚轮/滑块缩放图片
 *  - 1:1 正方形裁剪区域，结果输出圆形 PNG
 *
 * Props:
 *   open: boolean
 *   file: File
 *   onClose: () => void
 *   onConfirm: (croppedBlob: Blob) => void
 */
export default function AvatarCropModal({ open, file, onClose, onConfirm }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const [img, setImg] = useState(null);
  const [scale, setScale] = useState(1);       // 图片相对「最小适配尺寸」的缩放比例
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragState = useRef({ active: false, startX: 0, startY: 0, ox: 0, oy: 0 });

  const CANVAS_SIZE = 320; // 画布尺寸（正方形）
  const CROP_SIZE = 220;   // 圆形裁剪框尺寸（直径）

  // 加载图片
  useEffect(() => {
    if (!open || !file) return;
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => { setImg(im); };
    im.src = url;
    return () => { setImg(null); URL.revokeObjectURL(url); };
  }, [open, file]);

  // 图片加载完成 → 初始化缩放和位置，让图片以 cover 方式刚好填满圆形裁剪框
  useEffect(() => {
    if (!img) return;
    const minScale = CROP_SIZE / Math.min(img.width, img.height);
    setScale(minScale);
    setOffset({
      x: (CANVAS_SIZE - img.width * minScale) / 2,
      y: (CANVAS_SIZE - img.height * minScale) / 2
    });
  }, [img]);

  // 渲染画布
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // 1. 画暗色背景
    ctx.fillStyle = '#1c1c1e';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    if (!img) return;

    const w = img.width * scale;
    const h = img.height * scale;

    // 2. 先在中间画圆形裁剪可视区（通过 clip）
    ctx.save();
    ctx.beginPath();
    ctx.arc(CANVAS_SIZE / 2, CANVAS_SIZE / 2, CROP_SIZE / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, offset.x, offset.y, w, h);
    ctx.restore();

    // 3. 在图片上再画一层半透明黑色遮罩（圆形内部保持清晰，外部变暗）
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.rect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.arc(CANVAS_SIZE / 2, CANVAS_SIZE / 2, CROP_SIZE / 2, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.fill('evenodd');
    ctx.restore();

    // 4. 画圆形边框 + 四等分十字线（裁剪辅助线）
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(CANVAS_SIZE / 2, CANVAS_SIZE / 2, CROP_SIZE / 2, 0, Math.PI * 2);
    ctx.stroke();

    // 水平/垂直中线
    const cx = CANVAS_SIZE / 2;
    const cy = CANVAS_SIZE / 2;
    const r = CROP_SIZE / 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy);
    ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r);
    ctx.stroke();
    ctx.restore();
  }, [img, scale, offset]);

  // 拖动图片
  function onMouseDown(e) {
    if (!img) return;
    dragState.current = {
      active: true,
      startX: e.clientX, startY: e.clientY,
      ox: offset.x, oy: offset.y
    };
  }
  useEffect(() => {
    function onMove(e) {
      if (!dragState.current.active) return;
      const dx = e.clientX - dragState.current.startX;
      const dy = e.clientY - dragState.current.startY;
      setOffset({ x: dragState.current.ox + dx, y: dragState.current.oy + dy });
    }
    function onUp() { dragState.current.active = false; }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  // 滚轮缩放
  function onWheel(e) {
    e.preventDefault();
    if (!img) return;
    const delta = -e.deltaY * 0.0015;
    setScale(s => clampScale(s + s * delta));
  }

  function clampScale(s) {
    if (!img) return s;
    const minScale = CROP_SIZE / Math.min(img.width, img.height) * 0.8;
    const maxScale = CROP_SIZE / Math.min(img.width, img.height) * 4;
    return Math.max(minScale, Math.min(maxScale, s));
  }

  // 确认裁剪 → 生成 Blob
  function handleConfirm() {
    if (!img) return;
    // 用一个新的离屏 canvas 输出 512x512 圆形头像
    const OUT = 512;
    const oc = document.createElement('canvas');
    oc.width = OUT; oc.height = OUT;
    const octx = oc.getContext('2d');

    const w = img.width * scale;
    const h = img.height * scale;

    // 以画布中心的 CROP_SIZE 圆形区域为裁剪来源，映射到 OUT
    // 来源矩形 = 画布中心的 CROP_SIZE 正方形对应的图片区域
    const srcCx = CANVAS_SIZE / 2 - offset.x;
    const srcCy = CANVAS_SIZE / 2 - offset.y;
    // 映射到图片原图坐标
    const srcX = srcCx - (CROP_SIZE / 2);
    const srcY = srcCy - (CROP_SIZE / 2);
    const srcS = CROP_SIZE;

    octx.save();
    octx.beginPath();
    octx.arc(OUT / 2, OUT / 2, OUT / 2, 0, Math.PI * 2);
    octx.closePath();
    octx.clip();
    octx.drawImage(
      img,
      srcX / scale, srcY / scale,
      srcS / scale, srcS / scale,
      0, 0, OUT, OUT
    );
    octx.restore();

    oc.toBlob(blob => {
      if (blob) onConfirm(blob);
    }, 'image/png');
  }

  if (!open) return null;

  return (
    <div style={styles.overlay} onMouseDown={e => e.stopPropagation()}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <div style={styles.title}>调整头像</div>
          <div style={{ fontSize: '12px', color: '#8e8e93' }}>拖动调整位置 · 滚轮或滑块缩放</div>
        </div>

        <div
          ref={wrapRef}
          style={{
            ...styles.canvasWrap,
            cursor: img ? 'grab' : 'default'
          }}
          onMouseDown={onMouseDown}
          onWheel={onWheel}
        >
          <canvas
            ref={canvasRef}
            width={CANVAS_SIZE}
            height={CANVAS_SIZE}
            style={{ display: 'block', borderRadius: '16px' }}
          />
        </div>

        <div style={styles.sliderRow}>
          <span style={{ fontSize: '12px', color: '#8e8e93', width: '28px' }}>缩小</span>
          <input
            type="range"
            min={0}
            max={100}
            value={img ? Math.round(((scale / (CROP_SIZE / Math.min(img.width, img.height))) - 1) / 3 * 100) : 0}
            onChange={e => {
              if (!img) return;
              const ratio = 1 + (Number(e.target.value) / 100) * 3;
              setScale(clampScale((CROP_SIZE / Math.min(img.width, img.height)) * ratio));
            }}
            style={{ flex: 1, accentColor: '#007aff' }}
          />
          <span style={{ fontSize: '12px', color: '#8e8e93', width: '28px', textAlign: 'right' }}>放大</span>
        </div>

        <div style={styles.footer}>
          <button onClick={onClose} className="btn-secondary" style={{ padding: '8px 18px' }}>取消</button>
          <button onClick={handleConfirm} className="btn-primary" style={{ padding: '8px 18px' }}>确认上传</button>
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
    width: '380px',
    background: '#fff',
    borderRadius: '18px',
    padding: '18px 18px 16px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.25)'
  },
  header: {
    marginBottom: '14px'
  },
  title: {
    fontSize: '16px', fontWeight: '700', color: '#1c1c1e',
    marginBottom: '4px'
  },
  canvasWrap: {
    width: '320px', height: '320px', margin: '0 auto',
    borderRadius: '16px',
    overflow: 'hidden',
    touchAction: 'none',
    userSelect: 'none'
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
