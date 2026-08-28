import { useState, useEffect, useRef } from 'react';

// ============================================================
// 友好的时间输入控件 v2
//  - 小时输入：输入 1 保持 1，不立刻补零，让用户有机会继续输入第二个数字
//  - 当输入 2 位时（如 12），自动跳到分钟输入框
//  - 离开输入框（blur）时才补零：1 → 01，9 → 09
//  - 分钟默认 00，用户可不填
//  - 点击时钟图标可弹出原生完整 time picker
// ============================================================
export default function FriendlyTimeInput({ value, onChange, placeholder }) {
  const nativeRef = useRef(null);
  const mmRef = useRef(null);
  const [hh, setHh] = useState((value || '').split(':')[0] || '');
  const [mm, setMm] = useState((value || '').split(':')[1] || '00');

  useEffect(() => {
    if (!value) { setHh(''); setMm('00'); return; }
    const [h, m = '00'] = value.split(':');
    setHh(h || '');
    setMm(m || '00');
  }, [value]);

  // 仅在 blur 时才提交（补零）
  function emit(newHh, newMm) {
    let h = String(newHh || '').trim();
    let m = String(newMm || '').trim() || '00';
    if (!h) { onChange(''); return; }
    const hNum = Math.max(0, Math.min(23, Number(h) || 0));
    const mNum = Math.max(0, Math.min(59, Number(m) || 0));
    onChange(`${String(hNum).padStart(2, '0')}:${String(mNum).padStart(2, '0')}`);
  }

  function handleHhChange(e) {
    const raw = e.target.value.replace(/[^0-9]/g, '').slice(0, 2);
    setHh(raw);
    // 输入够 2 位 → 自动跳到分钟框
    if (raw.length === 2) {
      // 延迟一帧，让 state 更新后再 focus
      requestAnimationFrame(() => {
        mmRef.current?.focus();
        mmRef.current?.select();
      });
    }
  }

  function handleHhBlur() {
    // 离开小时框时才补零提交
    if (hh) emit(hh, mm || '00');
  }

  function handleMmChange(e) {
    const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 2);
    setMm(v);
  }

  function handleMmBlur() {
    if (hh) emit(hh, mm || '00');
  }

  function openNative() { nativeRef.current?.showPicker?.(); }
  function handleNative(e) {
    const v = e.target.value;
    if (v) {
      const [h, m] = v.split(':');
      setHh(h); setMm(m);
      emit(h, m);
    }
  }

  const CELL = {
    width: '100%',
    padding: '8px 10px',
    border: 'none',
    outline: 'none',
    fontSize: '14px',
    fontWeight: '600',
    color: '#1c1c1e',
    background: 'transparent',
    textAlign: 'center',
    fontFamily: 'inherit',
    letterSpacing: '0.03em'
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'stretch',
      border: '1px solid #d1d1d6',
      borderRadius: '9px',
      background: '#ffffff',
      overflow: 'hidden',
      transition: 'all .15s',
      minWidth: '128px'
    }}
      onMouseEnter={(e) => e.currentTarget.style.borderColor = '#b5b5bd'}
      onMouseLeave={(e) => e.currentTarget.style.borderColor = '#d1d1d6'}
      onFocus={(e) => { e.currentTarget.style.borderColor = '#007AFF'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(0,122,255,0.15)'; }}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) { e.currentTarget.style.borderColor = '#d1d1d6'; e.currentTarget.style.boxShadow = 'none'; } }}
    >
      <input
        style={CELL}
        type="text"
        inputMode="numeric"
        placeholder={hh ? '' : 'HH'}
        value={hh}
        onChange={handleHhChange}
        onBlur={handleHhBlur}
        title={placeholder || '时间'}
      />
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '6px',
        fontSize: '14px',
        fontWeight: '700',
        color: hh ? '#1c1c1e' : '#c7c7cc',
        userSelect: 'none'
      }}>:</div>
      <input
        ref={mmRef}
        style={CELL}
        type="text"
        inputMode="numeric"
        placeholder="MM"
        value={mm || ''}
        onChange={handleMmChange}
        onBlur={handleMmBlur}
      />
      <button
        type="button"
        onClick={openNative}
        title="打开时间选择器"
        style={{
          width: '36px',
          border: 'none',
          background: '#f5f5f7',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#8e8e93',
          padding: 0,
          flexShrink: 0
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = '#007AFF'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = '#8e8e93'; }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
      </button>
      <input
        ref={nativeRef}
        type="time"
        value={hh && mm ? `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}` : ''}
        onChange={handleNative}
        style={{ display: 'none' }}
      />
    </div>
  );
}
