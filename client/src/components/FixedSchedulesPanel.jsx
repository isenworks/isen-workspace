import { useState, useEffect } from 'react';
import { API } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import { formatDuration, calcDurationMin } from '../utils/date.js';

// 固定日程管理面板（在 Modal 内打开，提供列表 + 新增按钮，点击每行可编辑/删除）
export default function FixedSchedulesPanel({ onEdit }) {
  const toast = useToast();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const r = await API.fixedSchedules.list();
      setList(r.fixedSchedules || []);
    } catch (e) {
      toast.error(e.message);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleRemove(id, name) {
    if (!confirm(`确认删除固定日程「${name}」？`)) return;
    try {
      await API.fixedSchedules.remove(id);
      toast.success('已删除');
      load();
    } catch (e) { toast.error(e.message); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* 头部说明 + 新增按钮 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
        padding: '10px 12px',
        background: 'linear-gradient(90deg, rgba(142,142,147,0.08) 0%, transparent 65%)',
        borderRadius: '10px',
      }}>
        <div style={{ fontSize: '12px', color: '#6c6c70', lineHeight: '1.5', flex: 1 }}>
          <span style={{ fontWeight: '600', color: '#007aff' }}>📌 固定日程</span>
          <span> · 每天重复显示在时间线，仅作提醒，不可打卡</span>
        </div>
        <button
          onClick={() => onEdit?.(null)}
          style={{
            padding: '6px 14px',
            borderRadius: '9px',
            fontSize: '13px',
            fontWeight: '600',
            background: '#007aff',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 3px 8px rgba(0,122,255,0.25)',
            display: 'flex', alignItems: 'center', gap: '4px',
            whiteSpace: 'nowrap',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          新增
        </button>
      </div>

      {/* 列表 */}
      {loading ? (
        <div style={{ padding: '24px', textAlign: 'center', color: '#8e8e93', fontSize: '13px' }}>
          加载中...
        </div>
      ) : list.length === 0 ? (
        <div style={{
          padding: '32px 16px', textAlign: 'center',
          color: '#8e8e93', fontSize: '13px',
          background: 'linear-gradient(90deg, rgba(142,142,147,0.08) 0%, transparent 65%)',
          borderRadius: '10px',
        }}>
          <div style={{ fontSize: '28px', marginBottom: '6px' }}>📌</div>
          还没有固定日程
          <div style={{ fontSize: '12px', marginTop: '4px' }}>点击右上角「新增」开始创建</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {[...list].sort((a, b) => (a.start_time || '').localeCompare(b.start_time || '')).map(s => {
            const dur = calcDurationMin(s.start_time, s.end_time);
            return (
              <div
                key={s.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  background: 'linear-gradient(90deg, rgba(142,142,147,0.08) 0%, transparent 65%)',
                  cursor: 'pointer',
                  transition: 'all .15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'linear-gradient(90deg, rgba(0,122,255,0.08) 0%, transparent 65%)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'linear-gradient(90deg, rgba(142,142,147,0.08) 0%, transparent 65%)'; }}
                onClick={() => onEdit?.(s)}
              >
                <span style={{ fontSize: '18px', flexShrink: 0 }}>{s.emoji || '📌'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: '500', color: '#1c1c1e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.name}
                  </div>
                  <div style={{ fontSize: '12px', color: '#8e8e93', marginTop: '2px' }}>
                    {s.start_time} – {s.end_time}
                    {dur != null && dur > 0 && ` · ${formatDuration(dur)}`}
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleRemove(s.id, s.name); }}
                  title="删除"
                  style={{
                    width: '26px', height: '26px', flexShrink: 0,
                    borderRadius: '6px',
                    border: 'none', background: 'transparent',
                    color: '#8e8e93', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all .15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,59,48,0.1)'; e.currentTarget.style.color = '#ff3b30'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#8e8e93'; }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6l-2 14a2 2 0 01-2 2H9a2 2 0 01-2-2L5 6"></path>
                    <path d="M10 11v6M14 11v6"></path>
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
