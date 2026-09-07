import { useState, useEffect, useCallback, useRef } from 'react';
import { API } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import { store } from '../utils/store.js';
import { today as getToday, addDaysISO } from '../utils/date.js';
import QuickCapture from '../components/QuickCapture.jsx';
import Modal from '../components/Modal.jsx';
import ScheduleForm, { readCats } from '../components/forms/ScheduleForm.jsx';
import FriendlyTimeInput from '../components/FriendlyTimeInput.jsx';

// D1 datetime('now') 是 UTC（'YYYY-MM-DD HH:MM:SS'），转本地 Date
function parseDbTime(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
  const d = new Date(s);
  return isNaN(d) ? null : d;
}
// 「今天 21:36 · 2 小时前」
function fmtCreated(s) {
  const d = parseDbTime(s);
  if (!d) return '';
  const now = new Date();
  const p = n => String(n).padStart(2, '0');
  const hm = `${p(d.getHours())}:${p(d.getMinutes())}`;
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  let day;
  if (sameDay(d, now)) day = '今天';
  else {
    const y = new Date(now); y.setDate(y.getDate() - 1);
    if (sameDay(d, y)) day = '昨天';
    else day = `${d.getMonth() + 1}月${d.getDate()}日`;
  }
  const diff = Math.floor((now - d) / 1000);
  let rel;
  if (diff < 60) rel = '刚刚';
  else if (diff < 3600) rel = `${Math.floor(diff / 60)} 分钟前`;
  else if (diff < 86400) rel = `${Math.floor(diff / 3600)} 小时前`;
  else rel = `${Math.floor(diff / 86400)} 天前`;
  return `${day} ${hm} · ${rel}`;
}

// hex → rgba（分类 chip 底色/描边，与 ScheduleForm catToStyle 同规则）
function hexToRgba(hex, a = 0.08) {
  const h = (hex || '').replace('#', '');
  if (h.length !== 6) return `rgba(142,142,147,${a})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六'];

/* ============================================================
 * InboxPage · 收集箱
 *   捕获：想法/备忘 + 自动记录时间（无日期），N 键或页内输入快速收进
 *   分派：空了再分配到具体类型（日程/待办）+ 日期时间，形成每日清空循环
 * ============================================================ */
export default function InboxPage({ onCountChange }) {
  const toast = useToast();
  const [items, setItems] = useState(null);          // null=加载中
  const [busyIds, setBusyIds] = useState(new Set());
  const [editingId, setEditingId] = useState(null);  // 行内编辑内容的条目
  const [editDraft, setEditDraft] = useState('');
  const [triage, setTriage] = useState(null);        // { id, cat, date, time }
  const [detail, setDetail] = useState(null);        // 详细模式：ScheduleForm 预填
  const editInputRef = useRef(null);

  const cats = readCats();
  const catOf = (v) => cats.find(c => c.v === Number(v)) || null;

  const load = useCallback(async () => {
    try {
      const r = await API.inbox.list();
      setItems(r.items || []);
      onCountChange?.((r.items || []).length);
    } catch (e) {
      setItems([]);
      toast.error(e.message || '加载失败');
    }
  }, [toast, onCountChange]);

  useEffect(() => { load(); }, [load]);

  function markBusy(id, on) {
    setBusyIds(prev => {
      const n = new Set(prev);
      if (on) n.add(id); else n.delete(id);
      return n;
    });
  }

  // ===== 就地完成（想法已处理，无需转为日程/待办） =====
  async function complete(id) {
    markBusy(id, true);
    try {
      await API.inbox.update(id, { is_done: 1 });
      setItems(prev => prev.filter(it => it.id !== id));
      onCountChange?.((items || []).filter(it => it.id !== id).length);
      toast.success('已完成');
    } catch (e) {
      toast.error(e.message || '操作失败');
    } finally { markBusy(id, false); }
  }

  // ===== 行内编辑内容 =====
  function startEdit(item) {
    setTriage(null);
    setEditingId(item.id);
    setEditDraft(item.content);
    requestAnimationFrame(() => editInputRef.current?.focus());
  }
  async function commitEdit(item) {
    const v = editDraft.trim();
    setEditingId(null);
    if (!v || v === item.content) return;
    try {
      await API.inbox.update(item.id, { content: v });
      setItems(prev => prev.map(it => it.id === item.id ? { ...it, content: v } : it));
    } catch (e) { toast.error(e.message || '保存失败'); }
  }

  // ===== 删除（进回收站） =====
  async function removeItem(item) {
    if (!window.confirm(`删除「${item.content.slice(0, 20)}${item.content.length > 20 ? '…' : ''}」？删除后可在回收站恢复。`)) return;
    markBusy(item.id, true);
    try {
      await API.inbox.remove(item.id);
      setItems(prev => prev.filter(it => it.id !== item.id));
      onCountChange?.(Math.max(0, (items || []).length - 1));
    } catch (e) {
      toast.error(e.message || '删除失败');
    } finally { markBusy(item.id, false); }
  }

  // ===== 行内分派 =====
  function startTriage(item) {
    setEditingId(null);
    setTriage({
      id: item.id,
      cat: item.category != null ? Number(item.category) : 3, // 默认「其他」，最不预设
      date: getToday(),                                       // 默认今天
      time: '',
    });
  }

  async function process(item, type) {
    if (!triage || triage.id !== item.id) return;
    markBusy(item.id, true);
    try {
      const fields = { title: item.content, date: triage.date };
      if (type === 'schedule') {
        fields.category = triage.cat;
        if (triage.time) fields.start_time = triage.time;
      }
      await API.inbox.process({ id: item.id, type, fields });
      setTriage(null);
      setItems(prev => prev.filter(it => it.id !== item.id));
      onCountChange?.(Math.max(0, (items || []).length - 1));
      store.broadcast({ type: 'reload' }); // 让今日计划的时间轴/重点事项同步刷新
      const d = new Date(triage.date + 'T00:00:00');
      const dayLabel = triage.date === getToday() ? '今天' : `${d.getMonth() + 1}月${d.getDate()}日`;
      const catInfo = type === 'schedule' ? catOf(triage.cat) : null;
      toast.success(`已分派到 ${catInfo ? catInfo.label + ' · ' : ''}${dayLabel}${triage.time && type === 'schedule' ? ' ' + triage.time : ''}的${type === 'schedule' ? '日程' : '待办'}`);
    } catch (e) {
      toast.error(e.message || '分派失败');
    } finally { markBusy(item.id, false); }
  }

  // 详细模式：ScheduleForm 预填（支持时长/重要性/重复等完整字段）
  function openDetail(item) {
    setDetail({
      item,
      initial: {
        title: item.content,
        category: triage?.cat ?? (item.category != null ? Number(item.category) : 3),
        date: triage?.date || getToday(),
        start_time: triage?.time || '',
      },
    });
  }

  // ScheduleForm 保存成功 → 回写收集箱条目分派去向
  async function onDetailSaved() {
    const item = detail?.item;
    setDetail(null);
    if (!item) return;
    try {
      await API.inbox.update(item.id, { processed_type: 'schedule' });
      setItems(prev => prev.filter(it => it.id !== item.id));
      onCountChange?.(Math.max(0, (items || []).length - 1));
      store.broadcast({ type: 'reload' });
      toast.success('已转为日程');
    } catch (e) {
      // 日程已建好，仅回写失败：条目留在收集箱，用户可手动完成，避免产生重复日程
      toast.error('日程已创建，但收集箱状态回写失败');
    }
  }

  // ===== 日期快捷 chips：今天/明天/后天 + 自定义 =====
  const dateChips = [
    { label: '今天', value: getToday() },
    { label: '明天', value: addDaysISO(getToday(), 1) },
    { label: '后天', value: addDaysISO(getToday(), 2) },
  ];

  return (
    <div className="flex-1 min-w-0 max-w-[860px] w-full mx-auto flex flex-col gap-4">
      {/* ===== Header ===== */}
      <div className="glass-card rounded-2xl p-4">
        <div className="flex items-center gap-3">
          <span className="w-[5px] h-[20px] rounded-full flex-shrink-0 self-center" style={{ background: 'var(--s-grad-bg)' }}></span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[15.5px] font-bold text-ink-900 leading-none">收集箱</span>
              {items && items.length > 0 && (
                <span className="text-[11px] font-semibold px-2 py-[3px] rounded-full"
                  style={{ background: 'rgba(var(--s-rgb),0.1)', color: 'var(--s-main)' }}>
                  {items.length} 条待分派
                </span>
              )}
            </div>
            <div className="text-[11px] text-ink-400 leading-none mt-1.5">
              想法和备忘先快速收进来，空了再分派到具体类型和日期
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="text-[11px] text-ink-400">随时快速记录</span>
            <kbd className="px-1.5 py-0.5 rounded-md text-[11px] font-medium tabular-nums border border-ink-100 bg-white/70 text-ink-500">N</kbd>
          </div>
        </div>

        {/* 页内快速捕获 */}
        <div className="mt-3.5 pt-3.5 border-t border-ink-100/80">
          <QuickCapture onSaved={load} />
        </div>
      </div>

      {/* ===== 列表 ===== */}
      {items === null ? (
        <div className="glass-card rounded-2xl p-10 flex items-center justify-center text-[13px] text-ink-400">加载中…</div>
      ) : items.length === 0 ? (
        <div className="glass-card rounded-2xl p-14 flex flex-col items-center justify-center text-center gap-2">
          {/* 收件箱托盘 · iOS 风 */}
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#C7C7CC" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
            <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
          </svg>
          <div className="text-[14px] font-semibold text-ink-900">收集箱是空的</div>
          <div className="text-[12px] text-ink-400">按 <kbd className="px-1 py-px rounded text-[11px] border border-ink-100 bg-white/70">N</kbd> 随时收进第一个想法</div>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {items.map(item => {
            const busy = busyIds.has(item.id);
            const isEditing = editingId === item.id;
            const isTriaging = triage?.id === item.id;
            const catInfo = catOf(item.category);
            const d = triage ? new Date(triage.date + 'T00:00:00') : null;
            const customDate = triage && !dateChips.some(c => c.value === triage.date);
            return (
              <div key={item.id} className={`glass-card rounded-2xl p-4 transition-opacity ${busy ? 'opacity-50 pointer-events-none' : ''}`}>
                {/* 卡片主体 */}
                <div className="flex items-start gap-3">
                  {/* 就地完成 */}
                  <button
                    onClick={() => complete(item.id)}
                    title="标记完成（想法已处理，无需转为日程）"
                    className="flex-shrink-0 mt-[2px] w-[18px] h-[18px] rounded-full border-[1.5px] border-ink-300 hover:border-[color:var(--s-main)] flex items-center justify-center transition-colors group"
                  >
                    <svg className="opacity-0 group-hover:opacity-60 transition-opacity" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--s-main)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </button>

                  {/* 内容 */}
                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <input
                        ref={editInputRef}
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitEdit(item);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        onBlur={() => commitEdit(item)}
                        className="w-full bg-transparent outline-none text-[14px] font-medium text-ink-900 border-b border-[rgba(var(--s-rgb),0.4)] pb-0.5"
                      />
                    ) : (
                      <div className="text-[14px] font-medium text-ink-900 leading-snug break-words">{item.content}</div>
                    )}
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className="text-[11px] text-ink-400 tabular-nums">{fmtCreated(item.created_at)}</span>
                      {catInfo && (
                        <span className="flex items-center gap-1 text-[11px]" style={{ color: catInfo.dot }}>
                          <span className="w-[6px] h-[6px] rounded-full" style={{ background: catInfo.dot }} />
                          {catInfo.label}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 操作 */}
                  {!isEditing && (
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <button
                        onClick={() => startTriage(item)}
                        className="text-[12.5px] font-medium px-2.5 py-1.5 rounded-lg transition-colors"
                        style={{ color: 'var(--s-main)', background: 'rgba(var(--s-rgb),0.08)' }}
                      >{isTriaging ? '分派中…' : '分派'}</button>
                      <button
                        onClick={() => startEdit(item)}
                        title="编辑内容"
                        className="text-ink-400 hover:text-ink-600 w-8 h-8 rounded-lg hover:bg-ink-50 transition-colors flex items-center justify-center"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                      </button>
                      <button
                        onClick={() => removeItem(item)}
                        title="删除（进回收站）"
                        className="text-ink-400 hover:text-[#FF3B30] w-8 h-8 rounded-lg hover:bg-[#FF3B3014] transition-colors flex items-center justify-center"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                      </button>
                    </div>
                  )}
                </div>

                {/* ===== 行内分派面板 ===== */}
                {isTriaging && triage && (
                  <div className="mt-3 pt-3 border-t border-ink-100/80">
                    {/* 分类 */}
                    <div className="text-[11px] font-semibold text-ink-400 mb-1.5 tracking-wide">分类</div>
                    <div className="flex items-center gap-1.5 flex-wrap mb-3">
                      {cats.map(c => {
                        const on = Number(triage.cat) === c.v;
                        return (
                          <button
                            key={c.v}
                            onClick={() => setTriage(t => ({ ...t, cat: c.v }))}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] transition-all"
                            style={{
                              background: on ? hexToRgba(c.dot, 0.14) : 'rgba(120,120,128,0.06)',
                              color: on ? c.dot : '#8e8e93',
                              border: `1px solid ${on ? hexToRgba(c.dot, 0.55) : 'transparent'}`,
                              fontWeight: on ? 600 : 400,
                            }}
                          >
                            <span className="w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ background: c.dot }} />
                            {c.label}
                          </button>
                        );
                      })}
                    </div>

                    {/* 日期 + 时间 */}
                    <div className="text-[11px] font-semibold text-ink-400 mb-1.5 tracking-wide">分派到</div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {dateChips.map(c => {
                        const on = triage.date === c.value;
                        return (
                          <button
                            key={c.label}
                            onClick={() => setTriage(t => ({ ...t, date: c.value }))}
                            className={`px-2.5 py-1 rounded-full text-[12px] transition-all ${on ? 'font-semibold' : ''}`}
                            style={on
                              ? { background: 'rgba(var(--s-rgb),0.1)', color: 'var(--s-main)', border: '1px solid rgba(var(--s-rgb),0.45)' }
                              : { background: 'rgba(120,120,128,0.06)', color: '#8e8e93', border: '1px solid transparent' }}
                          >{c.label}</button>
                        );
                      })}
                      {/* 自定义日期 */}
                      {customDate && (
                        <span className="px-2.5 py-1 rounded-full text-[12px] font-semibold"
                          style={{ background: 'rgba(var(--s-rgb),0.1)', color: 'var(--s-main)', border: '1px solid rgba(var(--s-rgb),0.45)' }}>
                          {d.getMonth() + 1}月{d.getDate()}日 周{WEEK_CN[d.getDay()]}
                        </span>
                      )}
                      <input
                        type="date"
                        value={triage.date}
                        onChange={(e) => e.target.value && setTriage(t => ({ ...t, date: e.target.value }))}
                        className="text-[12px] text-ink-500 px-2 py-1 rounded-lg border border-ink-100 bg-white/70 outline-none"
                        title="选择其他日期"
                      />
                      <span className="w-px h-4 bg-ink-100 mx-0.5" />
                      <div className="flex items-center gap-1">
                        <span className="text-[11px] text-ink-400">时间</span>
                        <div className="w-[120px]">
                          <FriendlyTimeInput
                            value={triage.time}
                            onChange={(v) => setTriage(t => ({ ...t, time: v }))}
                            placeholder="可选"
                          />
                        </div>
                      </div>
                    </div>

                    {/* 底部：预览 + 按钮 */}
                    <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
                      <span className="text-[12px] text-[color:var(--s-main)] font-medium">
                        将转为「{catOf(triage.cat)?.label || '其他'}」· {triage.date === getToday() ? '今天' : `${d.getMonth() + 1}月${d.getDate()}日`}{triage.time ? ` ${triage.time}` : ''}的日程
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openDetail(item)}
                          className="text-[12.5px] font-medium text-ink-500 hover:text-ink-900 px-2 py-1.5 rounded-lg hover:bg-ink-50 transition-colors"
                        >详细模式…</button>
                        <button
                          onClick={() => process(item, 'task')}
                          className="text-[12.5px] font-semibold px-3 py-1.5 rounded-lg transition-colors"
                          style={{ background: 'rgba(120,120,128,0.12)', color: '#1c1c1e' }}
                        >转为待办</button>
                        <button
                          onClick={() => process(item, 'schedule')}
                          className="text-[12.5px] font-semibold px-3 py-1.5 rounded-lg transition-all"
                          style={{ background: 'var(--s-main)', color: '#fff', boxShadow: '0 2px 6px rgba(var(--s-rgb),0.25)' }}
                        >转为日程</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <div className="text-[11.5px] text-ink-400 text-center pt-1">
            分派后自动进入对应日期的日程/待办；完成 / 删除的记录可在回收站恢复
          </div>
        </div>
      )}

      {/* ===== 详细模式：复用 ScheduleForm（支持时长/重要性/重复） ===== */}
      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title="详细分派 · 新建日程"
      >
        {detail && (
          <ScheduleForm
            initial={detail.initial}
            defaultDate={detail.initial.date}
            onSaved={onDetailSaved}
            onCancel={() => setDetail(null)}
          />
        )}
      </Modal>
    </div>
  );
}
