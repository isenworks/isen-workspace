import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import {
  callLLMStream, getAIConfig, saveAIConfig, modelConfigs, buildSystemPrompt, renderMarkdown,
} from '../utils/aiLLM.js';
import {
  aiToolDefinitions, executeTool, isWriteTool, formatToolResult, toolDisplayNames,
} from '../utils/aiTools.js';
import { getKBTextForPrompt } from '../utils/aiKnowledgeBase.js';
import { store } from '../utils/store.js';
import {
  IconGlobe, IconBook, IconGear, IconArrowUp, IconStop, IconRotate,
  IconCheck, IconClock, IconBan, IconAlert, IconPen, IconMic, IconChevronDown, IconSparkle,
} from './aiIcons.jsx';

/* AIChat · 可复用对话组件（风格对齐工作台）
   功能：流式渲染 / 工具调用可视化 / 写操作内联确认 / Markdown 渲染 / 消息持久化
   Props:
     - mode: 'general' | 'kb'  当前模式
     - onModeChange(mode)  模式切换回调
     - onConfigClick  点击模型配置的回调
     - storageKey  消息持久化 key（默认 'ai_messages_main'）
     - compact  是否紧凑模式（隐藏标题行）
*/

function genId() {
  return 'msg_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

// 浏览器是否支持原生语音识别（Chrome/Edge 的 Web Speech API）
const speechSupported = typeof window !== 'undefined'
  && !!(window.SpeechRecognition || window.webkitSpeechRecognition);

// 工具状态 → 图标
function ToolStatusIcon({ status }) {
  if (status === 'running') return <span className="ai-spin"><IconClock size={12} /></span>;
  if (status === 'done' || status === 'confirmed') return <IconCheck size={12} strokeWidth={2.4} />;
  if (status === 'error') return <IconAlert size={12} />;
  if (status === 'cancelled') return <IconBan size={12} />;
  return <IconClock size={12} />;
}

const AIChat = forwardRef(function AIChat({
  mode = 'general',
  onModeChange,
  onConfigClick,
  storageKey = 'ai_messages_main',
  compact = false,
  headerless = false,
  onUserMessage,
}, ref) {
  const [messages, setMessages] = useState(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  });
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [kbCount, setKbCount] = useState(0);
  const [modelMenuOpen, setModelMenuOpen] = useState(false); // Trae Work 式模型选择浮层
  const [listening, setListening] = useState(false);         // 语音输入进行中
  const [voiceHint, setVoiceHint] = useState('');            // 语音错误提示（短暂显示）

  const msgsRef = useRef(messages);
  const abortRef = useRef(null);
  const pendingConfirms = useRef(new Map()); // id → resolve(confirm)
  const scrollRef = useRef(null);
  const taRef = useRef(null);
  const recRef = useRef(null);        // SpeechRecognition 实例（录音中的唯一标识）
  const voiceBaseRef = useRef('');    // 开始录音时的输入内容（识别结果追加在其后）
  const voiceHintTimer = useRef(null);
  const voiceTimerRef = useRef(null);     // 60s 防挂起
  const noResultTimerRef = useRef(null);  // 8s 无结果提示

  // 保持 messages ref 最新（供异步循环读最新值）
  useEffect(() => { msgsRef.current = messages; }, [messages]);

  // 消息持久化
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(messages)); } catch { /* ignore */ }
  }, [messages, storageKey]);

  // 知识库条目数（知识库问答模式提示用）
  useEffect(() => {
    if (mode === 'kb') {
      const text = getKBTextForPrompt();
      setKbCount(text ? text.split('\n\n---\n\n').length : 0);
    }
  }, [mode, messages.length]);

  // 自动滚动到底部
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // 输入框随内容自动增高（上限 148px，超出后内部滚动）
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 148) + 'px';
  }, [input]);

  // 暴露 clear 方法给父组件（headerless 时由父组件触发）
  useImperativeHandle(ref, () => ({
    clear: () => {
      msgsRef.current = [];
      setMessages([]);
      try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
    },
  }), [storageKey]);

  // ===== 构建 OpenAI 格式 messages =====
  const buildApiMessages = useCallback(() => {
    let kbText = '';
    if (mode === 'kb') {
      kbText = getKBTextForPrompt();
      if (!kbText) {
        kbText = '（知识库暂无内容，请告知用户先去知识库添加条目，或切换到通用模式。）';
      }
    }
    const systemPrompt = buildSystemPrompt(mode, kbText);
    const msgs = [{ role: 'system', content: systemPrompt }];
    for (const m of msgsRef.current) {
      if (m.role === 'user') {
        msgs.push({ role: 'user', content: m.content });
      } else if (m.role === 'assistant') {
        const a = { role: 'assistant', content: m.content || '' };
        if (m.tool_calls && m.tool_calls.length > 0) {
          a.tool_calls = m.tool_calls.map(tc => ({
            id: tc.id || ('call_' + Math.random().toString(36).slice(2)),
            type: 'function',
            function: { name: tc.name, arguments: JSON.stringify(tc.args || {}) },
          }));
        }
        msgs.push(a);
      } else if (m.role === 'tool' && m.tool_call_id) {
        msgs.push({ role: 'tool', tool_call_id: m.tool_call_id, content: m.content || '' });
      }
    }
    return msgs;
  }, [mode]);

  // ===== 写操作确认（Promise + 内联卡片）=====
  const confirmTool = useCallback((id) => {
    return new Promise((resolve) => {
      pendingConfirms.current.set(id, resolve);
    });
  }, []);

  const handleConfirm = useCallback((id, confirmed) => {
    const resolve = pendingConfirms.current.get(id);
    if (resolve) { resolve(confirmed); pendingConfirms.current.delete(id); }
    setMessages(prev => prev.map(m =>
      m.id === id ? { ...m, toolStatus: confirmed ? 'confirmed' : 'cancelled' } : m
    ));
  }, []);

  // ===== 对话循环（可能多轮工具调用）=====
  const runConversation = useCallback(async () => {
    const config = getAIConfig();
    const useTools = config?.enableTools !== false;

    while (true) {
      const apiMessages = buildApiMessages();
      const assistantId = genId();
      setMessages(prev => [...prev, {
        id: assistantId, role: 'assistant', content: '', streaming: true,
      }]);

      let result;
      try {
        result = await callLLMStream({
          messages: apiMessages,
          tools: useTools ? aiToolDefinitions : [],
          onToken: (chunk) => {
            setMessages(prev => prev.map(m =>
              m.id === assistantId ? { ...m, content: m.content + chunk } : m
            ));
          },
          signal: abortRef.current?.signal,
        });
      } catch (err) {
        if (err.name === 'AbortError') {
          setMessages(prev => prev.map(m =>
            m.id === assistantId ? { ...m, content: m.content ? m.content + '\n\n（已停止）' : '（已停止）', streaming: false } : m
          ));
        } else {
          setMessages(prev => prev.map(m =>
            m.id === assistantId ? { ...m, content: m.content || `请求失败：${err.message}`, streaming: false, isError: true } : m
          ));
        }
        break;
      }

      setMessages(prev => prev.map(m =>
        m.id === assistantId ? {
          ...m, content: result.content, streaming: false,
          tool_calls: result.toolCalls,
        } : m
      ));

      // 没有工具调用 → 对话结束
      if (!result.toolCalls || result.toolCalls.length === 0) break;

      // 处理每个工具调用
      for (const tc of result.toolCalls) {
        if (isWriteTool(tc.name)) {
          // 写操作 → 内联确认卡片，等待用户
          const confirmId = genId();
          setMessages(prev => [...prev, {
            id: confirmId, role: 'tool', tool_call_id: tc.id || '',
            toolName: tc.name, toolArgs: tc.args, toolStatus: 'pending',
          }]);
          const confirmed = await confirmTool(confirmId);
          if (!confirmed) {
            setMessages(prev => [...prev, {
              id: genId(), role: 'tool', tool_call_id: tc.id || '',
              content: '用户取消了此操作。',
              toolName: tc.name, toolStatus: 'cancelled',
            }]);
            continue;
          }
        }

        // 执行工具
        const toolMsgId = genId();
        setMessages(prev => [...prev, {
          id: toolMsgId, role: 'tool', tool_call_id: tc.id || '',
          content: '', toolName: tc.name, toolStatus: 'running',
        }]);
        try {
          const toolResult = await executeTool(tc.name, tc.args);
          const resultText = formatToolResult(tc.name, toolResult);
          setMessages(prev => prev.map(m =>
            m.id === toolMsgId ? { ...m, content: resultText, toolResult: toolResult, toolStatus: 'done' } : m
          ));
          // 写操作后广播刷新（让其他页面刷新数据）
          if (isWriteTool(tc.name)) {
            store.broadcast({ type: 'reload' });
          }
        } catch (err) {
          setMessages(prev => prev.map(m =>
            m.id === toolMsgId ? { ...m, content: `错误: ${err.message}`, toolStatus: 'error' } : m
          ));
        }
      }
      // 继续循环，让 AI 根据工具结果继续回复
    }
  }, [buildApiMessages, confirmTool]);

  // ===== 发送消息 =====
  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;

    const config = getAIConfig();
    if (!config?.apiKey) {
      onConfigClick?.();
      return;
    }

    // 首条用户消息判定（必须在写入 ref 之前做）
    const isFirstUser = !msgsRef.current.some(m => m.role === 'user');

    // 同步写入 ref 与 state：runConversation 会立即读取 ref 构建请求体，
    // 若只 setMessages 不更新 ref，本次请求会漏掉刚发出的用户消息，
    // messages 只剩 system → 接口报「messages 参数非法」
    msgsRef.current = [...msgsRef.current, { id: genId(), role: 'user', content: text }];
    setMessages(msgsRef.current);

    setInput('');
    setStreaming(true);
    abortRef.current = new AbortController();

    // 通知父组件：首条用户消息用于派生会话标题
    onUserMessage?.(text, isFirstUser);

    try {
      await runConversation();
    } catch (err) {
      console.error('AI conversation error:', err);
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [input, streaming, onConfigClick, runConversation, onUserMessage]);

  // ===== 取消流式 =====
  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // ===== 语音输入（Web Speech API，参考豆包/Trae 的「点击开始 · 点击停止」模式）
  // 稳健性设计：实例引用单一来源（recRef）/ 停止时 stop+abort 双保险 /
  // 状态立即回落不等 onend 回调 / 迟到结果丢弃 / 60s 防挂起 / 8s 无结果提示
  const showVoiceHint = useCallback((msg) => {
    setVoiceHint(msg);
    clearTimeout(voiceHintTimer.current);
    voiceHintTimer.current = setTimeout(() => setVoiceHint(''), 3200);
  }, []);

  // 停止并复位（幂等）：无论正常结束、手动停止还是异常路径都走这里
  const stopVoiceCore = useCallback(() => {
    const rec = recRef.current;
    recRef.current = null;
    setListening(false);
    clearTimeout(voiceTimerRef.current);
    clearTimeout(noResultTimerRef.current);
    if (rec) {
      try { rec.stop(); } catch { /* ignore */ }
      try { rec.abort(); } catch { /* ignore */ }
    }
  }, []);

  const startVoice = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { showVoiceHint('当前浏览器不支持语音输入，建议使用 Chrome / Edge'); return; }
    if (recRef.current) return; // 已在录音
    let rec;
    try { rec = new SR(); } catch { showVoiceHint('语音功能初始化失败，请重试'); return; }
    rec.lang = 'zh-CN';
    rec.continuous = true;     // 持续听写，直到手动停止或浏览器判定结束
    rec.interimResults = true; // 中间结果实时上屏
    voiceBaseRef.current = input;
    rec.onresult = (e) => {
      if (!recRef.current) return; // 已停止：丢弃迟到结果
      let finalText = '', interim = '';
      for (let i = 0; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t; else interim += t;
      }
      if (!finalText && !interim) return;
      setInput(((voiceBaseRef.current || '') + finalText + interim).replace(/\s+/g, ' '));
      clearTimeout(noResultTimerRef.current);
    };
    rec.onerror = (e) => {
      if (!recRef.current) return;
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        showVoiceHint('麦克风权限被拒绝，请在浏览器地址栏允许使用麦克风');
        stopVoiceCore();
      } else if (e.error === 'network') {
        showVoiceHint('语音服务连接失败，请检查网络后重试');
      }
      // no-speech / aborted 等静默，由 onend 收尾
    };
    rec.onend = () => stopVoiceCore();
    recRef.current = rec;
    try { rec.start(); } catch { recRef.current = null; showVoiceHint('启动失败，请稍后重试'); return; }
    setListening(true);
    // 防挂起：8s 无结果提示；60s 上限自动停止
    noResultTimerRef.current = setTimeout(() => {
      if (recRef.current) showVoiceHint('未识别到语音，请检查麦克风是否可用');
    }, 8000);
    voiceTimerRef.current = setTimeout(() => stopVoiceCore(), 60000);
  }, [input, showVoiceHint, stopVoiceCore]);

  const toggleVoice = useCallback(() => {
    if (recRef.current) stopVoiceCore(); else startVoice();
  }, [startVoice, stopVoiceCore]);

  // 卸载时停止录音、清理计时器
  useEffect(() => () => {
    const rec = recRef.current;
    recRef.current = null;
    if (rec) { try { rec.stop(); } catch { /* ignore */ } try { rec.abort(); } catch { /* ignore */ } }
    clearTimeout(voiceHintTimer.current);
    clearTimeout(voiceTimerRef.current);
    clearTimeout(noResultTimerRef.current);
  }, []);

  // ===== 模型选择（Trae Work 式：胶囊按钮 → 上拉菜单，选中即存即生效）=====
  const handlePickModel = useCallback((key) => {
    const cfg = modelConfigs[key] || {};
    const cur = getAIConfig() || {};
    saveAIConfig({
      provider: key,
      apiKey: cur.apiKey || '',
      baseUrl: cfg.baseUrl || cur.baseUrl || '',
      model: cfg.model || cur.model || '',
      enableTools: cur.enableTools !== false,
    });
    setModelMenuOpen(false);
    // 尚未配置 Key：选完模型直接打开设置弹窗补 Key，一步到位
    if (!cur.apiKey) onConfigClick?.();
  }, [onConfigClick]);

  // ===== 清空消息（二次确认）=====
  const [confirmClear, setConfirmClear] = useState(false);
  const handleClear = useCallback(() => {
    msgsRef.current = [];
    setMessages([]);
    setConfirmClear(false);
    try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
  }, [storageKey]);

  // ===== 回车发送 =====
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // 当前模型名（配置按钮显示用）
  const config = getAIConfig();
  const currentModelLabel = config?.apiKey
    ? (config.provider === 'custom' ? (config.model || '自定义') : (modelLabel(config.provider)))
    : '未配置';

  // ===== 渲染单条消息 =====
  const renderMessage = (m) => {
    // 用户消息（右对齐，豆包式统一大圆角，无小角尾巴）
    if (m.role === 'user') {
      return (
        <div key={m.id} className="flex justify-end">
          <div className="max-w-[78%] px-4 py-2.5 rounded-[18px] text-white text-[14px] leading-[1.65] break-words"
            style={{ background: 'var(--s-grad-bg)' }}>
            {m.content}
          </div>
        </div>
      );
    }

    // 工具消息（确认卡片 / 执行步骤）
    if (m.role === 'tool') {
      const displayName = toolDisplayNames[m.toolName] || m.toolName || '工具';

      // 写操作确认卡片
      if (m.toolStatus === 'pending') {
        return (
          <div key={m.id} className="flex justify-start w-full">
            <div className="w-[86%] max-w-[420px] bg-white rounded-2xl border border-ink-100 p-3.5"
              style={{ boxShadow: '0 0 0 1px rgba(0,0,0,0.03)' }}>
              <div className="flex items-center gap-2 mb-2.5">
                <span className="w-[22px] h-[22px] rounded-lg flex items-center justify-center text-white flex-shrink-0"
                  style={{ background: '#FF9500' }}>
                  <IconPen size={12} />
                </span>
                <span className="text-[12.5px] font-semibold text-ink-900">{displayName}</span>
                <span className="text-[11px] text-ink-400">需要你确认</span>
              </div>
              <div className="rounded-xl bg-ink-50 px-3 py-2 mb-3">
                {renderToolArgs(m.toolName, m.toolArgs)}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleConfirm(m.id, true)}
                  className="px-3.5 py-1.5 rounded-lg text-[12px] font-semibold text-white transition-all active:scale-[0.97]"
                  style={{ background: 'var(--s-grad-bg)' }}
                >确认执行</button>
                <button
                  onClick={() => handleConfirm(m.id, false)}
                  className="px-3.5 py-1.5 rounded-lg text-[12px] font-medium text-ink-600 bg-ink-100 hover:bg-ink-200/70 transition-colors"
                >取消</button>
              </div>
            </div>
          </div>
        );
      }

      // 工具执行步骤条
      const statusColor =
        m.toolStatus === 'done' || m.toolStatus === 'confirmed' ? '#34C759' :
        m.toolStatus === 'error' ? '#FF3B30' : '#8a9491';
      return (
        <div key={m.id} className="flex justify-start">
          <div className="inline-flex items-center gap-1.5 max-w-[82%] px-2.5 py-1.5 rounded-full bg-ink-50">
            <span style={{ color: statusColor }}><ToolStatusIcon status={m.toolStatus} /></span>
            <span className="text-[12px] font-medium" style={{ color: statusColor }}>{displayName}</span>
            {m.toolStatus === 'done' && m.toolResult?.date && (
              <span className="text-[11.5px] text-ink-300">· {m.toolResult.date}</span>
            )}
            {m.toolStatus === 'running' && <span className="text-[11.5px] text-ink-300">执行中…</span>}
            {m.toolStatus === 'cancelled' && <span className="text-[11.5px] text-ink-300">已取消</span>}
          </div>
        </div>
      );
    }

    // AI 消息（豆包式：无气泡无边框，正文直接铺在卡片上，阅读动线更顺）
    if (m.role === 'assistant') {
      // 正在思考（流式且无内容）
      if (m.streaming && !m.content) {
        return (
          <div key={m.id} className="flex justify-start">
            <div className="inline-flex items-center gap-2 rounded-full bg-ink-50 px-3.5 py-2">
              <span className="text-[var(--s-main)]"><IconSparkle size={13} /></span>
              <span className="text-[13px] text-ink-400">小亦思考中</span>
              <span className="ai-dots">
                <i /><i /><i />
              </span>
            </div>
          </div>
        );
      }
      return (
        <div key={m.id} className="flex justify-start">
          <div className={`max-w-[88%] w-fit text-[14px] leading-[1.7] text-ink-900 break-words ${m.isError ? 'text-[#d93025]' : ''}`}>
            <div
              className="ai-md-body"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }}
            />
          </div>
        </div>
      );
    }
    return null;
  };

  // 渲染工具参数详情（确认卡片用）
  function renderToolArgs(name, args) {
    if (!args) return null;
    return (
      <div className="space-y-0.5">
        {Object.entries(args).map(([k, v]) => (
          <div key={k} className="flex gap-2 text-[12px] leading-relaxed">
            <span className="text-ink-400 flex-shrink-0">{argLabel(k)}:</span>
            <span className="text-ink-900 break-all">{String(v)}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Markdown + 动画样式 */}
      <style>{`
        .ai-md-body { line-height: 1.7; font-size: 14px; }
        .ai-md-body h3,.ai-md-body h4 { margin: 10px 0 5px; font-weight: 600; color: var(--tw-prose-headings, #0f1f1c); }
        .ai-md-body h3 { font-size: 15px; }
        .ai-md-body h4 { font-size: 14px; }
        .ai-md-body p { margin: 0 0 8px; }
        .ai-md-body p:last-child { margin-bottom: 0; }
        .ai-md-body ul,.ai-md-body ol { margin: 6px 0 9px; padding-left: 20px; }
        .ai-md-body ul:last-child,.ai-md-body ol:last-child { margin-bottom: 0; }
        .ai-md-body li { margin-bottom: 4px; }
        .ai-md-body li:last-child { margin-bottom: 0; }
        .ai-md-body .ai-md-codeblock {
          background: #f7f8f8; border: 1px solid #ebedec; border-radius: 8px;
          padding: 9px 12px; margin: 8px 0; overflow-x: auto;
          font-size: 12.5px; font-family: ui-monospace, SFMono-Regular, monospace;
        }
        .ai-md-body .ai-md-code {
          background: #f7f8f8; border-radius: 4px;
          padding: 1px 5px; font-size: 12.5px; font-family: ui-monospace, SFMono-Regular, monospace;
        }
        .ai-md-body .ai-md-link { color: var(--s-main); text-decoration: underline; text-underline-offset: 2px; }
        .ai-dots { display: inline-flex; gap: 3px; align-items: center; }
        .ai-dots i { width: 4px; height: 4px; border-radius: 50%; background: #b3bab8; animation: ai-blink 1s infinite; }
        .ai-dots i:nth-child(2) { animation-delay: 0.15s; }
        .ai-dots i:nth-child(3) { animation-delay: 0.3s; }
        @keyframes ai-blink { 0%,60%,100% { opacity: 0.3; } 30% { opacity: 1; } }
        .ai-spin { display: inline-flex; animation: ai-rotate 1s linear infinite; }
        @keyframes ai-rotate { to { transform: rotate(360deg); } }
        /* 输入框聚焦态：浅蓝描边 + 弥散式蓝调投影（大 blur 低透明度，不使用实心光环） */
        .ai-composer { border-color: #e2e6e5; box-shadow: 0 1px 3px rgba(0,0,0,0.03); transition: border-color .18s ease, box-shadow .25s ease; }
        .ai-composer:focus-within {
          border-color: #A8C7FA;
          box-shadow: 0 4px 20px rgba(96,150,248,0.16), 0 1px 4px rgba(96,150,248,0.08);
        }
        /* 语音识别中：红色脉冲光环 */
        @keyframes ai-pulse { 0% { box-shadow: 0 0 0 0 rgba(255,59,48,0.35); } 100% { box-shadow: 0 0 0 9px rgba(255,59,48,0); } }
      `}</style>

      {/* ===== 顶部栏（模式切换 / 模型设置已移至输入框底部工具条）===== */}
      {!headerless && (
      <div className={`flex items-center gap-2.5 flex-shrink-0 ${compact ? 'pb-2' : 'pb-3'}`}>
        {!compact && (
          <>
            <span className="w-[5px] h-[20px] rounded-full flex-shrink-0" style={{ background: 'var(--s-grad-bg)' }} />
            <span className="text-[15.5px] font-bold text-ink-900 leading-none flex-1">小亦</span>
          </>
        )}
        {compact && <span className="flex-1" />}

        {/* 清空 */}
        <button
          onClick={() => messages.length > 0 && setConfirmClear(true)}
          disabled={messages.length === 0}
          className="w-[26px] h-[26px] rounded-lg flex items-center justify-center flex-shrink-0 text-ink-400 hover:bg-ink-50 transition-colors disabled:opacity-30 disabled:cursor-default"
          title="清空对话"
        >
          <IconRotate size={13} />
        </button>
      </div>
      )}

      {/* 知识库模式提示条 */}
      {mode === 'kb' && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl mb-2 flex-shrink-0"
          style={{ background: 'rgba(var(--s-rgb),0.06)' }}>
          <span className="text-[var(--s-main)] flex-shrink-0"><IconBook size={13} /></span>
          <span className="text-[11.5px]" style={{ color: 'var(--s-deep, var(--s-main))' }}>
            知识库模式：仅基于你沉淀的 {kbCount} 条知识回答，未命中会提示切换通用
          </span>
        </div>
      )}

      {/* 清空确认（内联轻量确认，headerless 时由父组件 ConfirmDialog 处理） */}
      {!headerless && confirmClear && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl mb-2 flex-shrink-0 bg-[#FF3B300A] border border-[#FF3B3022]">
          <span className="text-[#FF3B30] flex-shrink-0"><IconAlert size={13} /></span>
          <span className="text-[11.5px] text-ink-700 flex-1">确定清空当前对话？清空后不可恢复。</span>
          <button
            onClick={handleClear}
            className="px-2.5 py-1 rounded-md text-[11.5px] font-semibold text-white bg-[#FF3B30] transition-all active:scale-[0.97]"
          >清空</button>
          <button
            onClick={() => setConfirmClear(false)}
            className="px-2.5 py-1 rounded-md text-[11.5px] font-medium text-ink-600 bg-ink-100 hover:bg-ink-200/70 transition-colors"
          >取消</button>
        </div>
      )}

      {/* ===== 消息区（滚动容器占满卡片宽度，滚动条贴卡片右缘；
               内容居中限宽并留出右padding，气泡与滚动条不再重合）===== */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto nice-scroll">
        <div className={`min-h-full flex flex-col mx-auto w-full max-w-[820px] px-4 ${compact ? 'gap-2 py-1' : 'gap-3 py-2'}`}>
          {messages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-2">
              <span className="w-[52px] h-[52px] rounded-2xl flex items-center justify-center mb-1"
                style={{ background: 'rgba(var(--s-rgb),0.08)', color: 'var(--s-main)' }}>
                <IconSparkle size={26} strokeWidth={1.5} />
              </span>
              <div className="text-[14px] font-semibold text-ink-900">你好，我是小亦</div>
              <div className="text-[12.5px] text-ink-400 leading-relaxed">
                {mode === 'kb' ? '基于你在知识库沉淀的内容回答' : '你的个人 AI 伙伴 · 使用你配置的大模型'}
                <br />还可以让我记待办、建日程，会同步到重点事项与日历
              </div>
            </div>
          ) : (
            messages.map(renderMessage)
          )}
        </div>
      </div>

      {/* ===== 输入区（composer：文本框 + 底部工具条）===== */}
      <div className="pt-2 flex-shrink-0 mx-auto w-full max-w-[820px]">
        <div className="ai-composer rounded-[22px] bg-white border px-4 pt-3 pb-2.5">
          <textarea
            ref={taRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={listening ? '正在聆听，请说话…' : streaming ? 'AI 正在回复…' : '输入问题，回车发送，Shift + 回车换行'}
            disabled={streaming}
            rows={1}
            className="w-full bg-transparent border-0 outline-none resize-none overflow-y-auto nice-scroll text-[14px] leading-[1.65] text-ink-900 placeholder:text-ink-300 disabled:opacity-60"
            style={{ maxHeight: '148px' }}
          />

          {/* 语音识别异常提示（短暂显示） */}
          {voiceHint && (
            <div className="text-[11px] text-[#FF3B30] mt-1">{voiceHint}</div>
          )}

          {/* 工具条：左下角模式切换，右下角语音 + 模型选择 + 发送 */}
          <div className="flex items-center gap-2 mt-2">
            <div className="flex items-center p-[2px] rounded-lg flex-shrink-0" style={{ background: 'rgba(120,120,128,0.08)' }}>
              <button
                onClick={() => onModeChange?.('general')}
                title="通用：直接使用模型知识回答"
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all text-[12px] font-medium"
                style={mode === 'general'
                  ? { background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', color: 'var(--s-main)' }
                  : { color: '#8a9491' }}
              >
                <IconGlobe size={12} />
                通用
              </button>
              <button
                onClick={() => onModeChange?.('kb')}
                title="知识库：仅基于你沉淀的知识回答"
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all text-[12px] font-medium"
                style={mode === 'kb'
                  ? { background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', color: 'var(--s-main)' }
                  : { color: '#8a9491' }}
              >
                <IconBook size={12} />
                知识库
              </button>
            </div>

            <div className="flex-1 min-w-0" />

            {/* 模型选择（Trae Work 式：胶囊按钮 → 上拉菜单，无边框） */}
            <div className="relative flex-shrink-0">
              <button
                onClick={() => setModelMenuOpen(v => !v)}
                className={`flex items-center gap-1 px-2 py-[5px] rounded-lg text-[12px] font-medium transition-colors ${
                  config?.apiKey ? 'text-ink-600 hover:bg-ink-50' : 'text-white'
                }`}
                style={!config?.apiKey
                  ? { background: 'var(--s-grad-bg)', boxShadow: '0 2px 6px rgba(var(--s-rgb),0.25)' }
                  : {}}
                title="选择模型"
              >
                <span className="max-w-[110px] truncate">{currentModelLabel}</span>
                <IconChevronDown size={11} />
              </button>

              {modelMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setModelMenuOpen(false)} />
                  <div
                    className="absolute bottom-[calc(100%+8px)] right-0 z-50 w-[236px] rounded-xl bg-white border border-ink-100 overflow-hidden"
                    style={{ boxShadow: '0 10px 32px rgba(0,0,0,0.13), 0 2px 8px rgba(0,0,0,0.06)' }}
                  >
                    <div className="px-3 pt-2.5 pb-1.5 text-[11px] font-semibold text-ink-400 tracking-wide">选择模型</div>
                    {Object.entries(modelConfigs).map(([key, cfg]) => {
                      const active = (config?.provider || 'doubao') === key;
                      return (
                        <button
                          key={key}
                          onClick={() => handlePickModel(key)}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-ink-50"
                        >
                          <span
                            className="flex-1 min-w-0 truncate text-[12.5px]"
                            style={active ? { color: 'var(--s-main)', fontWeight: 600 } : { color: '#0f1f1c' }}
                          >{cfg.label}</span>
                          {key !== 'custom' && (
                            <span className="text-[10.5px] text-ink-300 truncate max-w-[86px]">{cfg.model}</span>
                          )}
                          {active && (
                            <span className="flex-shrink-0" style={{ color: 'var(--s-main)' }}><IconCheck size={12} /></span>
                          )}
                        </button>
                      );
                    })}
                    <button
                      onClick={() => { setModelMenuOpen(false); onConfigClick?.(); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-ink-50 border-t border-ink-100/70"
                    >
                      <span className="text-ink-400"><IconGear size={12} /></span>
                      <span className="text-[12px] text-ink-600">模型设置…</span>
                      {!config?.apiKey && (
                        <span className="ml-auto px-1.5 py-0.5 rounded-md text-[10px] font-semibold text-white"
                          style={{ background: 'var(--s-grad-bg)' }}>待配置</span>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* 语音输入（置于模型与发送之间；浏览器不支持时自动隐藏） */}
            {speechSupported && (
              <button
                onClick={toggleVoice}
                disabled={streaming}
                className={`w-[28px] h-[28px] rounded-lg flex items-center justify-center flex-shrink-0 transition-all active:scale-95 disabled:opacity-40 ${listening ? 'text-white' : 'text-ink-400 hover:bg-ink-50 hover:text-ink-600'}`}
                style={listening ? { background: '#FF3B30', animation: 'ai-pulse 1.2s ease-out infinite' } : {}}
                title={listening ? '停止语音输入' : '语音输入'}
              >
                <IconMic size={14} />
              </button>
            )}

            {streaming ? (
              <button
                onClick={handleStop}
                className="w-[32px] h-[32px] rounded-lg flex items-center justify-center flex-shrink-0 text-[#FF3B30] bg-[#FF3B300F] hover:bg-[#FF3B301A] transition-all active:scale-95"
                title="停止生成"
              >
                <IconStop size={14} />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className="w-[32px] h-[32px] rounded-lg flex items-center justify-center flex-shrink-0 text-white transition-all hover:scale-105 active:scale-95 disabled:opacity-30 disabled:cursor-default"
                style={input.trim()
                  ? { background: 'var(--s-grad-bg)', boxShadow: '0 2px 6px rgba(var(--s-rgb),0.25)' }
                  : { background: '#b3bab8' }}
                title="发送"
              >
                <IconArrowUp size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

export default AIChat;

// 参数 key → 中文标签
function argLabel(k) {
  const map = {
    title: '标题', date: '日期', start_time: '开始', end_time: '结束',
    category: '分类', notes: '备注', priority: '优先级',
    content: '内容', tag: '标签', days: '范围',
  };
  return map[k] || k;
}

// 模型标签辅助
function modelLabel(provider) {
  const labels = {
    doubao: '豆包', deepseek: 'DeepSeek', qwen: '通义千问',
    kimi: 'Kimi', glm: '智谱 GLM', custom: '自定义',
  };
  return labels[provider] || provider;
}
