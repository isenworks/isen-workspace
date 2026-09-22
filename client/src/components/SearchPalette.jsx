import React, { useState, useEffect, useMemo, useRef } from 'react';
import Modal from './Modal.jsx';
import { API } from '../api/client.js';
import { catToModule } from '../utils/categoryMapping.js';

/* ============ 全局搜索命令面板（Spotlight 式） ============
 * - 空查询：打开时并行拉取最近条目（事项/待办各200、习惯、收集箱），本地展示
 * - 有关键词：300ms 防抖后调 /api/search/all 服务端全量 LIKE 查询（覆盖全部历史，不受 200 条窗口限制）
 * - 分组：事项与目标 / 待办 / 习惯 / 收集箱；每组限量，避免长列表
 * - 键盘：↑↓ 选择 · Enter 打开 · Esc 关闭（Modal 自带）
 * - 匹配文字高亮；习惯→计划总结页，收集箱→收集箱页，事项/待办/目标→打开编辑弹窗
 */

// 类型图标（与侧栏 Feather 线条风格同款：strokeWidth 2 · 圆角线帽）
const TYPE_ICONS = {
  schedule: (<svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>),
  goal: (<svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/></svg>),
  task: (<svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>),
  habit: (<svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>),
  inbox: (<svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>),
};

const GROUP_META = {
  schedule: { label: '事项与目标', color: 'var(--s-main)' },
  task:     { label: '待办',       color: '#34C759' },
  habit:    { label: '习惯',       color: '#FF9500' },
  inbox:    { label: '小记',     color: '#AF52DE' },
};

// 「9月18日」式短日期；非法日期返回空串
function fmtMD(iso) {
  if (!iso || typeof iso !== 'string') return '';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  return `${Number(m[2])}月${Number(m[3])}日`;
}

// 标题匹配高亮：大小写不敏感，返回 [文本, 是否命中] 片段数组
function hilite(text, q) {
  const s = String(text || '');
  if (!q) return [{ t: s, hit: false }];
  const idx = s.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return [{ t: s, hit: false }];
  return [
    { t: s.slice(0, idx), hit: false },
    { t: s.slice(idx, idx + q.length), hit: true },
    { t: s.slice(idx + q.length), hit: false },
  ];
}

export default function SearchPalette({ open, onClose, onPick }) {
  const [q, setQ] = useState('');
  const [data, setData] = useState(null);   // { schedules, tasks, habits, inbox }
  const [sel, setSel] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // 打开时并行拉取四个数据源（allSettled：单源失败不拖垮整体）
  useEffect(() => {
    if (!open) return;
    setQ('');
    setSel(0);
    setData(null);
    let alive = true;
    (async () => {
      const [rS, rT, rH, rI] = await Promise.allSettled([
        API.schedules.list({}),
        API.tasks.list({}),
        API.habits.list({}),
        API.inbox.list(),
      ]);
      if (!alive) return;
      setData({
        schedules: rS.status === 'fulfilled' ? (rS.value?.schedules || []) : [],
        tasks:     rT.status === 'fulfilled' ? (rT.value?.tasks || []) : [],
        habits:    rH.status === 'fulfilled' ? (rH.value?.habits || []) : [],
        inbox:     rI.status === 'fulfilled' ? (rI.value?.items || []) : [],
      });
    })();
    return () => { alive = false; };
  }, [open]);

  // 打开后聚焦输入框
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 30); }, [open]);

  // 服务端搜索（关键词非空时）：300ms 防抖后调 /api/search/all 全量 LIKE 查询
  // 空查询不发请求，回退到打开时拉取的本地最近条目——省 D1 行读取
  const [remote, setRemote] = useState(null);
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    const kw = q.trim();
    if (!kw) { setRemote(null); setSearching(false); return; }
    setSearching(true);
    let alive = true;
    const timer = setTimeout(async () => {
      try {
        const r = await API.search.all(kw);
        if (alive) setRemote(r || { schedules: [], tasks: [], habits: [], inbox: [] });
      } catch {
        if (alive) setRemote({ schedules: [], tasks: [], habits: [], inbox: [] });
      } finally {
        if (alive) setSearching(false);
      }
    }, 300);
    return () => { alive = false; clearTimeout(timer); };
  }, [q]);

  // 分组 + 扁平化（键盘导航用扁平索引）
  // 关键词非空 → 服务端 remote（已 LIKE 过滤，本地不再二次匹配）；空查询 → 本地最近条目
  const { groups, flat } = useMemo(() => {
    const useServer = !!q.trim();
    const src = useServer ? remote : data;
    if (!src) return { groups: [], flat: [] };
    // 空查询时展示最近条目；搜索时每组最多 6 条，避免长列表
    const LIMIT = useServer ? 6 : 4;
    const mk = (type, items) => items.slice(0, LIMIT).map(it => ({ type, it }));

    const scheds = src.schedules
      .map(s => ({ type: s.is_goal ? 'goal' : 'schedule', it: s }));
    // 服务端搜索可搜到已完成待办（找历史）；本地最近视图只看未完成
    const tasks = mk('task', src.tasks.filter(t => useServer || !t.is_done));
    const habits = mk('habit', src.habits);
    const inboxItems = mk('inbox', src.inbox);

    const byGroup = {
      schedule: scheds.slice(0, LIMIT),
      task: tasks,
      habit: habits,
      inbox: inboxItems,
    };
    const gs = Object.entries(byGroup).filter(([, arr]) => arr.length > 0)
      .map(([type, arr]) => ({ type, items: arr }));
    return { groups: gs, flat: gs.flatMap(g => g.items) };
  }, [data, remote, q]);

  // 查询变化后选中索引归零
  useEffect(() => { setSel(0); }, [q]);

  // 键盘导航：↑↓ 移动 · Enter 打开
  const onKeydown = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (flat.length === 0) return;
      setSel(i => {
        const next = e.key === 'ArrowDown'
          ? (i + 1) % flat.length
          : (i - 1 + flat.length) % flat.length;
        // 选中项滚入可视区
        requestAnimationFrame(() => {
          listRef.current?.querySelector(`[data-idx="${next}"]`)?.scrollIntoView({ block: 'nearest' });
        });
        return next;
      });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = flat[sel];
      if (item) { onClose?.(); onPick?.(item.type, item.it); }
    }
  };

  const pick = (type, it) => { onClose?.(); onPick?.(type, it); };

  // 行渲染：类型图标 + 高亮标题 + 右侧元信息
  const Row = ({ type, it, idx }) => {
    const on = idx === sel;
    const mod = (type === 'schedule' || type === 'goal') ? catToModule(it.category) : null;
    const title = type === 'habit' ? it.name : type === 'inbox' ? it.content : it.title;
    const meta = type === 'inbox'
      ? '待分派'
      : type === 'habit'
        ? (it.emoji ? `${it.emoji} 习惯` : '习惯')
        : `${fmtMD(it.date) || '无日期'}${mod ? ` · ${mod.label}` : ''}`;
    return (
      <div
        data-idx={idx}
        className={`sp-row ${on ? 'sel' : ''}`}
        onMouseEnter={() => setSel(idx)}
        onClick={() => pick(type, it)}
      >
        <span className="sp-row-ic" style={{ color: on ? 'var(--s-main)' : '#8e8e93' }}>
          {TYPE_ICONS[type]}
        </span>
        <span className="sp-row-title">
          {hilite(title, q.trim()).map((seg, i) =>
            seg.hit
              ? <mark key={i} className="sp-hit">{seg.t}</mark>
              : <React.Fragment key={i}>{seg.t}</React.Fragment>
          )}
        </span>
        <span className="sp-row-meta">{meta}</span>
      </div>
    );
  };

  return (
    <Modal open={open} onClose={onClose} title="搜索工作台" maxWidth={540}>
      <div className="flex flex-col">
        {/* 搜索输入：面板内继续输入（Notion/Linear 同款） */}
        <div className="sp-inputwrap">
          <svg fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="sp-input-ic"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={onKeydown}
            placeholder="搜索事项、待办、习惯、小记…"
            spellCheck={false}
          />
          {q && (
            <button type="button" className="sp-clear" aria-label="清空" onClick={() => { setQ(''); inputRef.current?.focus(); }}>×</button>
          )}
        </div>

        {/* 结果区 */}
        <div ref={listRef} className="sp-list">
          {(!data || (q.trim() && searching)) ? (
            // 加载骨架（初次拉取 / 服务端搜索进行中）
            [0, 1, 2].map(i => <div key={i} className="sp-skeleton" style={{ width: `${70 - i * 12}%` }} />)
          ) : flat.length === 0 ? (
            <div className="sp-empty">
              <div className="sp-empty-t">{q.trim() ? `未找到「${q.trim()}」相关内容` : '暂无可搜索的数据'}</div>
              <div className="sp-empty-s">换个关键词试试，或按 N 快速记一条</div>
            </div>
          ) : (
            <>
              {!q.trim() && <div className="sp-hint">最近条目 · 输入关键词搜索全部</div>}
              {groups.map(g => (
                <div key={g.type} className="sp-group">
                  <div className="sp-group-label" style={{ color: GROUP_META[g.type].color }}>
                    {GROUP_META[g.type].label}
                  </div>
                  {g.items.map(item => (
                    <Row key={`${item.type}-${item.it.id}`} type={item.type} it={item.it} idx={flat.indexOf(item)} />
                  ))}
                </div>
              ))}
            </>
          )}
        </div>

        {/* 底部键位提示 */}
        <div className="sp-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> 选择</span>
          <span><kbd>↵</kbd> 打开</span>
          <span><kbd>Esc</kbd> 关闭</span>
        </div>
      </div>
    </Modal>
  );
}
