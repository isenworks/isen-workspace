import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import AIChat from '../components/AIChat.jsx';
import AIConfigModal from '../components/AIConfigModal.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import SearchPopover from '../components/SearchPopover.jsx';
import {
  IconPlus, IconPen, IconTrash, IconSparkle,
} from '../components/aiIcons.jsx';
import { useSplitRatio, SplitDivider } from '../components/useSplitRatio.jsx';
import {
  getSessions, createSession, renameSession, removeSession, touchSession,
  ensureSessions, sessionKey, deriveTitle, fmtSessionTime, isToday,
} from '../utils/aiChatSessions.js';

/* AI 助手主页面 · 两张卡片（左会话卡 + 右对话卡）
   · 左栏管理多个历史对话（新建 / 切换 / 重命名 / 删除）
   · 右栏为当前会话的对话窗口，输入框底部工具条内含模式切换与模型设置 */

// 内联输入（重命名会话）：Enter 提交、Esc / 失焦取消
function InlineInput({ defaultValue = '', placeholder, onCommit, onCancel }) {
  const [v, setV] = useState(defaultValue);
  const ref = useRef(null);
  const done = useRef(false);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  const commit = () => {
    if (done.current) return;
    done.current = true;
    const t = v.trim();
    if (t) onCommit(t); else onCancel();
  };
  const cancel = () => { if (done.current) return; done.current = true; onCancel(); };
  return (
    <input
      ref={ref}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel(); }}
      onBlur={commit}
      placeholder={placeholder}
      className="w-full px-2 py-1 rounded-md text-[12.5px] bg-white border border-ink-200 focus:border-[var(--s-main)] focus:outline-none transition-colors"
    />
  );
}

export default function AIAssistantPage() {
  const [mode, setMode] = useState('general');
  const [configOpen, setConfigOpen] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(null);

  // 左右分栏（会话列表 | 对话窗口）：可拖拽调宽，双击分隔条恢复默认
  const split = useSplitRatio('ai_split_ratio', { min: 0.2, max: 0.45, def: 0.28, maxWidth: 460 });
  const { leftStyle, rightStyle, bindRoot, bindDivider } = split;

  // 重新读取会话列表（可指定保留的会话）
  const reloadSessions = useCallback((keepId) => {
    const list = getSessions();
    setSessions(list);
    setActiveId(prev => {
      const want = keepId || prev;
      if (want && list.some(s => s.id === want)) return want;
      return list[0]?.id ?? null;
    });
  }, []);

  // 加载 + 旧数据迁移
  useEffect(() => { ensureSessions(); reloadSessions(); }, [reloadSessions]);

  const activeSession = sessions.find(s => s.id === activeId) || null;

  // 左侧列表：按 今天 / 更早 分组
  const groups = useMemo(() => {
    const map = new Map();
    for (const s of sessions) {
      const g = isToday(s.updatedAt) ? '今天' : '更早';
      if (!map.has(g)) map.set(g, []);
      map.get(g).push(s);
    }
    return ['今天', '更早']
      .filter(g => map.has(g))
      .map(g => ({ label: g, list: map.get(g) }));
  }, [sessions]);

  // 搜索弹窗数据源：会话标题 + 更新时间
  const searchItems = useMemo(
    () => sessions.map(s => ({ id: s.id, title: s.title || '新对话', meta: fmtSessionTime(s.updatedAt) })),
    [sessions],
  );

  /* ---------------- 会话操作 ---------------- */
  const handleNewChat = () => {
    const s = createSession();
    reloadSessions(s.id);
  };

  const handleRename = (id, name) => {
    renameSession(id, name);
    setRenamingId(null);
    reloadSessions(id);
  };

  const handleRemove = () => {
    const target = confirmRemove;
    setConfirmRemove(null);
    if (!target) return;
    removeSession(target.id);
    if (getSessions().length === 0) createSession();
    reloadSessions();
  };

  // 用户发送消息：首条派生标题，并触碰会话置顶
  const handleUserMessage = useCallback((text, isFirst) => {
    if (!activeId) return;
    if (isFirst) renameSession(activeId, deriveTitle(text));
    touchSession(activeId);
    reloadSessions(activeId);
  }, [activeId, reloadSessions]);

  return (
    <div className="flex-1 min-w-0 w-full flex flex-col gap-3 md:h-[calc(100vh-48px)] md:min-h-0">
      {/* ===== 左会话卡 + 右对话卡，中间可拖拽调宽 ===== */}
      <div {...bindRoot} className="split-root flex-1 min-h-0 flex items-stretch">
        {/* ---- 左：页头 + 会话列表 ---- */}
        <div className="glass-card rounded-2xl min-w-0 flex flex-col min-h-0 p-3" style={leftStyle}>
          {/* 页头：色条 + 标题 + 搜索（弹窗） / 新建对话。色条 22px 与右卡图标胶囊同高，两卡标题行同轴 */}
          <div className="flex items-center gap-2.5 px-1 pt-0.5 pb-2.5 flex-shrink-0">
            <span className="w-[5px] h-[22px] rounded-full flex-shrink-0 self-center" style={{ background: 'var(--s-grad-bg)' }} />
            <span className="text-[15.5px] font-bold text-ink-900 leading-none flex-1 min-w-0 truncate">小亦Ai</span>
            <SearchPopover
              results={searchItems}
              onPick={(id) => reloadSessions(id)}
              placeholder="搜索历史对话"
              emptyText="没有匹配的对话"
            />
            <button
              onClick={handleNewChat}
              className="w-[24px] h-[24px] rounded-lg flex items-center justify-center flex-shrink-0 text-white transition-all hover:scale-105 active:scale-95"
              style={{ background: 'var(--s-grad-bg)', boxShadow: '0 2px 6px rgba(var(--s-rgb),0.25)' }}
              title="新建对话"
            >
              <IconPlus size={13} />
            </button>
          </div>

          {/* 列表容器 px-1：会话项背景块（active/hover 底色）与页头色条左缘对齐（同知识库页修法） */}
          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-0.5 px-1">
            {groups.length === 0 && (
              <div className="px-2 py-3 text-[12px] text-ink-300">还没有对话</div>
            )}

            {groups.map(g => (
              <div key={g.label} className="flex flex-col">
                <div className="px-2 pt-1.5 pb-1 text-[11px] font-semibold text-ink-400 tracking-wide">{g.label}</div>
                {g.list.map(s => {
                  const active = s.id === activeId;
                  if (renamingId === s.id) {
                    return (
                      <div key={s.id} className="px-1 py-0.5">
                        <InlineInput
                          defaultValue={s.title}
                          placeholder="会话名称"
                          onCommit={(name) => handleRename(s.id, name)}
                          onCancel={() => setRenamingId(null)}
                        />
                      </div>
                    );
                  }
                  return (
                    <div
                      key={s.id}
                      onClick={() => setActiveId(s.id)}
                      className={`group relative flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${active ? '' : 'hover:bg-ink-50'}`}
                      style={active ? { background: 'rgba(var(--s-rgb),0.08)' } : undefined}
                    >
                      {/* 图标胶囊：选中 → 实底主题色 + 白色图标（品牌印记，与「新建对话」按钮一致）；未选中 → 浅色底 + 灰色图标，后退以保持列表层次 */}
                      <span
                        className={`w-[22px] h-[22px] rounded-md flex items-center justify-center flex-shrink-0 ${active ? 'text-white' : 'text-ink-400'}`}
                        style={active
                          ? { background: 'var(--s-grad-bg)', boxShadow: '0 2px 6px rgba(var(--s-rgb),0.25)' }
                          : { background: 'rgba(var(--s-rgb),0.05)' }}
                      >
                        <IconSparkle size={12} strokeWidth={1.8} />
                      </span>
                      <span className="flex-1 min-w-0 flex items-center gap-1.5 pr-0.5">
                        <span
                          className={`flex-1 min-w-0 text-[14px] leading-tight truncate ${active ? 'font-semibold' : ''}`}
                          style={active ? { color: 'var(--s-main)' } : { color: '#0f1f1c' }}
                        >{s.title}</span>
                        <span className="text-[12px] text-ink-300 flex-shrink-0 tabular-nums transition-opacity duration-150 group-hover:opacity-0">{fmtSessionTime(s.updatedAt)}</span>
                      </span>
                      {/* hover 悬浮操作：时间淡出 + 实底深色遮盖，双重保证不与时间重影 */}
                      <span
                        className={`absolute right-1 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-0.5 pl-2 pr-0.5 py-0.5 rounded-md ${active ? '' : 'bg-ink-100'}`}
                        style={active ? { background: 'rgba(var(--s-rgb),0.16)' } : undefined}
                      >
                        <button
                          onClick={(e) => { e.stopPropagation(); setRenamingId(s.id); }}
                          className="w-[20px] h-[20px] rounded-md flex items-center justify-center text-ink-400 hover:text-ink-700 hover:bg-black/[0.05] transition-colors"
                          title="重命名"
                        ><IconPen size={11} /></button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setConfirmRemove(s); }}
                          className="w-[20px] h-[20px] rounded-md flex items-center justify-center text-ink-300 hover:text-[var(--danger)] hover:bg-[#FF3B300F] transition-colors"
                          title="删除对话"
                        ><IconTrash size={11} /></button>
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          </div>

        <SplitDivider bindDivider={bindDivider} />

        {/* ---- 右：对话窗口 ---- */}
        <div className="glass-card rounded-2xl min-w-0 min-h-0 flex flex-col p-3" style={rightStyle}>
          {activeSession && (
            <div className="flex items-center gap-2 px-1 pt-0.5 pb-6 flex-shrink-0">
              {/* 头部与左卡页头同轴：同 pt-0.5 起点、同 22px 行高（图标胶囊决定）、leading-none 基线一致；pb-6 拉开与正文距离 */}
              <span
                className="w-[22px] h-[22px] rounded-md flex items-center justify-center flex-shrink-0 text-white"
                style={{ background: 'var(--s-grad-bg)', boxShadow: '0 2px 6px rgba(var(--s-rgb),0.25)' }}
              >
                <IconSparkle size={12} strokeWidth={1.8} />
              </span>
              <span className="text-[14px] font-semibold text-ink-900 truncate flex-1 min-w-0 leading-none">{activeSession.title}</span>
              <span className="text-[12px] text-ink-300 flex-shrink-0 leading-none">更新于 {fmtSessionTime(activeSession.updatedAt)}</span>
            </div>
          )}

          <div className="flex-1 min-h-0 flex flex-col">
            {activeId ? (
              <AIChat
                key={activeId}
                mode={mode}
                onModeChange={setMode}
                onConfigClick={() => setConfigOpen(true)}
                storageKey={sessionKey(activeId)}
                headerless
                onUserMessage={handleUserMessage}
              />
            ) : null}
          </div>
        </div>
      </div>

      <AIConfigModal open={configOpen} onClose={() => setConfigOpen(false)} />

      {/* 删除会话确认 */}
      <ConfirmDialog
        open={!!confirmRemove}
        title="删除对话"
        message={`确定删除「${confirmRemove?.title || ''}」？删除后不可恢复。`}
        confirmText="删除"
        danger
        onConfirm={handleRemove}
        onCancel={() => setConfirmRemove(null)}
      />
    </div>
  );
}