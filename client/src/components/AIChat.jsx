import { useState, useRef, useEffect, useCallback } from 'react';
import {
  callLLMStream, getAIConfig, buildSystemPrompt, renderMarkdown,
} from '../utils/aiLLM.js';
import {
  aiToolDefinitions, executeTool, isWriteTool, formatToolResult, toolDisplayNames,
} from '../utils/aiTools.js';
import { getKBTextForPrompt } from '../utils/aiKnowledgeBase.js';
import { store } from '../utils/store.js';

/* AIChat · 可复用对话组件
   功能：流式渲染 / 工具调用可视化 / 写操作内联确认 / Markdown 渲染 / 消息持久化
   Props:
     - mode: 'general' | 'kb'  当前模式
     - onModeChange(mode)  模式切换回调
     - onConfigClick  点击模型配置的回调
     - storageKey  消息持久化 key（默认 'ai_messages_main'）
     - compact  是否紧凑模式（默认 false）
*/

function genId() {
  return 'msg_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

export default function AIChat({
  mode = 'general',
  onModeChange,
  onConfigClick,
  storageKey = 'ai_messages_main',
  compact = false,
}) {
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

  const msgsRef = useRef(messages);
  const abortRef = useRef(null);
  const pendingConfirms = useRef(new Map()); // id → resolve(confirm)
  const scrollRef = useRef(null);

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
      // 粗略计数：按 "---" 分隔的块数
      setKbCount(text ? text.split('\n\n---\n\n').length : 0);
    }
  }, [mode, messages.length]);

  // 自动滚动到底部
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // ===== 构建 OpenAI 格式 messages =====
  const buildApiMessages = useCallback(() => {
    // 系统提示词
    let kbText = '';
    if (mode === 'kb') {
      kbText = getKBTextForPrompt();
      if (!kbText) {
        kbText = '（知识库暂无内容，请告知用户先去知识库添加条目，或切换到通用问答模式。）';
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
      // 创建 placeholder assistant 消息
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
            m.id === assistantId ? { ...m, content: '（已取消）', streaming: false } : m
          ));
        } else {
          setMessages(prev => prev.map(m =>
            m.id === assistantId ? { ...m, content: `⚠️ ${err.message}`, streaming: false } : m
          ));
        }
        break;
      }

      // 更新 assistant 消息
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
            // 用户取消，追加 tool 消息告诉 AI
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

    // 追加 user 消息
    setMessages(prev => [...prev, { id: genId(), role: 'user', content: text }]);
    setInput('');
    setStreaming(true);

    // 创建 AbortController
    abortRef.current = new AbortController();

    try {
      await runConversation();
    } catch (err) {
      console.error('AI conversation error:', err);
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [input, streaming, onConfigClick, runConversation]);

  // ===== 取消流式 =====
  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // ===== 清空消息 =====
  const handleClear = useCallback(() => {
    setMessages([]);
    try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
  }, [storageKey]);

  // ===== 回车发送 =====
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ===== 渲染单条消息 =====
  const renderMessage = (m) => {
    // 用户消息
    if (m.role === 'user') {
      return (
        <div key={m.id} style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{
            maxWidth: '78%',
            background: 'var(--s-grad-bg)', color: '#fff',
            borderRadius: '14px', padding: '10px 14px',
            fontSize: '13px', lineHeight: 1.6,
            wordBreak: 'break-word',
          }}>{m.content}</div>
        </div>
      );
    }

    // 工具消息（确认/执行步骤）
    if (m.role === 'tool') {
      const displayName = toolDisplayNames[m.toolName] || m.toolName || '工具';
      // 写操作确认卡片
      if (m.toolStatus === 'pending') {
        return (
          <div key={m.id} style={{
            display: 'flex', justifyContent: 'flex-start',
          }}>
            <div style={{
              maxWidth: '82%',
              background: '#fff',
              border: '1px solid rgba(255,149,0,0.3)',
              borderRadius: '12px', padding: '12px 14px',
              fontSize: '13px', lineHeight: 1.5,
            }}>
              <div style={{ fontWeight: '600', color: '#FF9500', marginBottom: '8px', fontSize: '12px' }}>
                ✏️ {displayName} · 需要确认
              </div>
              <div style={{ color: '#1c1c1e', marginBottom: '12px' }}>
                {renderToolArgs(m.toolName, m.toolArgs)}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => handleConfirm(m.id, true)}
                  style={{
                    padding: '7px 16px', borderRadius: '8px',
                    background: 'var(--s-grad-bg)', color: '#fff',
                    border: 'none', fontWeight: '600', fontSize: '12px', cursor: 'pointer',
                  }}
                >确认执行</button>
                <button
                  onClick={() => handleConfirm(m.id, false)}
                  style={{
                    padding: '7px 16px', borderRadius: '8px',
                    background: 'rgba(120,120,128,0.12)', color: '#1c1c1e',
                    border: 'none', fontWeight: '600', fontSize: '12px', cursor: 'pointer',
                  }}
                >取消</button>
              </div>
            </div>
          </div>
        );
      }
      // 工具执行步骤条
      const statusIcon = m.toolStatus === 'running' ? '⏳' :
        m.toolStatus === 'done' ? '✓' :
        m.toolStatus === 'error' ? '✕' :
        m.toolStatus === 'cancelled' ? '⊘' :
        m.toolStatus === 'confirmed' ? '✓' : '•';
      const statusColor = m.toolStatus === 'done' || m.toolStatus === 'confirmed' ? '#34C759' :
        m.toolStatus === 'error' ? '#FF3B30' :
        m.toolStatus === 'cancelled' ? '#8e8e93' : '#8e8e93';
      return (
        <div key={m.id} style={{ display: 'flex', justifyContent: 'flex-start' }}>
          <div style={{
            maxWidth: '82%',
            background: 'rgba(var(--s-rgb),0.04)',
            border: '1px solid rgba(var(--s-rgb),0.12)',
            borderRadius: '10px', padding: '8px 12px',
            fontSize: '12px', lineHeight: 1.5, color: '#1c1c1e',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: m.content && m.toolStatus === 'done' ? '4px' : 0 }}>
              <span style={{ color: statusColor, fontWeight: '600' }}>{statusIcon}</span>
              <span style={{ fontWeight: '500', color: statusColor }}>{displayName}</span>
              {m.toolStatus === 'running' && <span style={{ color: '#8e8e93' }}>执行中...</span>}
            </div>
            {m.content && m.toolStatus === 'done' && (
              <div style={{ color: '#8e8e93', fontSize: '11px', marginTop: '2px', whiteSpace: 'pre-wrap' }}>
                {m.content.length > 200 ? m.content.slice(0, 200) + '...' : m.content}
              </div>
            )}
          </div>
        </div>
      );
    }

    // AI 消息
    if (m.role === 'assistant') {
      // 正在思考（流式且 content 为空）
      if (m.streaming && !m.content) {
        return (
          <div key={m.id} style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{
              background: '#fff', border: '1px solid rgba(60,60,67,0.12)',
              borderRadius: '12px', padding: '10px 14px',
              fontSize: '13px', color: '#8e8e93',
              display: 'flex', alignItems: 'center', gap: '4px',
            }}>
              正在思考
              <span className="ai-typing-dot">.</span>
              <span className="ai-typing-dot">.</span>
              <span className="ai-typing-dot">.</span>
            </div>
          </div>
        );
      }
      // 有内容的 AI 消息
      return (
        <div key={m.id} style={{ display: 'flex', justifyContent: 'flex-start' }}>
          <div style={{
            maxWidth: '82%',
            background: '#fff', border: '1px solid rgba(60,60,67,0.12)',
            borderRadius: '14px', padding: '10px 14px',
            fontSize: '13px', lineHeight: 1.6, color: '#1c1c1e',
            wordBreak: 'break-word',
          }}>
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
    const rows = Object.entries(args).map(([k, v]) => (
      <div key={k} style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}>
        <span style={{ color: '#8e8e93', minWidth: '60px', fontSize: '12px' }}>{k}:</span>
        <span style={{ color: '#1c1c1e', fontSize: '12px', wordBreak: 'break-word' }}>{String(v)}</span>
      </div>
    ));
    return <div>{rows}</div>;
  }

  // 当前模型名（配置按钮显示用）
  const config = getAIConfig();
  const currentModelLabel = config?.provider
    ? (config.provider === 'custom' ? (config.model || '自定义') : (config.model || modelLabel(config.provider)))
    : '未配置';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Markdown + 打字动画样式 */}
      <style>{`
        .ai-md-body h3,.ai-md-body h4 { margin: 8px 0 4px; font-weight: 600; }
        .ai-md-body h3 { font-size: 14px; }
        .ai-md-body h4 { font-size: 13px; }
        .ai-md-body p { margin: 0 0 6px; }
        .ai-md-body p:last-child { margin-bottom: 0; }
        .ai-md-body ul,.ai-md-body ol { margin: 4px 0 6px; padding-left: 20px; }
        .ai-md-body li { margin-bottom: 2px; }
        .ai-md-body .ai-md-codeblock {
          background: rgba(0,0,0,0.05); border-radius: 6px;
          padding: 8px 10px; margin: 6px 0; overflow-x: auto;
          font-size: 12px; font-family: ui-monospace, monospace;
        }
        .ai-md-body .ai-md-code {
          background: rgba(0,0,0,0.05); border-radius: 3px;
          padding: 1px 4px; font-size: 12px; font-family: ui-monospace, monospace;
        }
        .ai-md-body .ai-md-link { color: var(--s-main); text-decoration: underline; }
        .ai-typing-dot { animation: ai-blink 1s infinite; }
        .ai-typing-dot:nth-child(2) { animation-delay: 0.15s; }
        .ai-typing-dot:nth-child(3) { animation-delay: 0.3s; }
        @keyframes ai-blink { 0%,60%,100% { opacity: 0.3; } 30% { opacity: 1; } }
      `}</style>

      {/* 顶部栏 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: compact ? '6px' : '10px',
        padding: compact ? '8px 12px' : '12px 16px',
        borderBottom: '1px solid rgba(60,60,67,0.12)',
        flexShrink: 0,
      }}>
        {!compact && <span style={{ fontSize: '16px', fontWeight: '600', color: '#1c1c1e' }}>🤖 AI 助手</span>}
        {/* 模式切换 */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '3px', background: 'rgba(120,120,128,0.08)', borderRadius: '8px', padding: '3px' }}>
          <button
            onClick={() => onModeChange?.('general')}
            style={{
              border: 'none', background: mode === 'general' ? '#fff' : 'transparent',
              color: mode === 'general' ? '#1c1c1e' : '#8e8e93',
              fontSize: '12px', fontWeight: '500',
              padding: '5px 10px', borderRadius: '6px', cursor: 'pointer',
              boxShadow: mode === 'general' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
            }}
          >🌐 通用问答</button>
          <button
            onClick={() => onModeChange?.('kb')}
            style={{
              border: 'none', background: mode === 'kb' ? '#fff' : 'transparent',
              color: mode === 'kb' ? '#1c1c1e' : '#8e8e93',
              fontSize: '12px', fontWeight: '500',
              padding: '5px 10px', borderRadius: '6px', cursor: 'pointer',
              boxShadow: mode === 'kb' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
            }}
          >📚 知识库问答</button>
        </div>
        {/* 模型配置快设 */}
        <button
          onClick={() => onConfigClick?.()}
          style={{
            border: '1px solid rgba(var(--s-rgb),0.3)',
            background: config?.apiKey ? 'rgba(var(--s-rgb),0.06)' : '#fff',
            color: config?.apiKey ? 'var(--s-main)' : '#8e8e93',
            borderRadius: '999px', padding: '5px 10px',
            fontSize: '12px', fontWeight: '500', cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >⚙️ {currentModelLabel}</button>
        {/* 清空 */}
        <button
          onClick={handleClear}
          style={{
            border: '1px solid rgba(60,60,67,0.18)',
            background: '#fff', color: '#8e8e93',
            borderRadius: '999px', padding: '5px 10px',
            fontSize: '11px', fontWeight: '500', cursor: 'pointer',
          }}
        >清空</button>
      </div>

      {/* 知识库提示条 */}
      {mode === 'kb' && (
        <div style={{
          padding: '6px 16px',
          background: 'rgba(var(--s-rgb),0.04)',
          borderBottom: '1px solid rgba(var(--s-rgb),0.08)',
          fontSize: '11px', color: 'var(--s-main)',
          display: 'flex', alignItems: 'center', gap: '6px',
          flexShrink: 0,
        }}>
          📚 知识库问答模式：基于你沉淀的 {kbCount} 条知识回答，未命中会提示切换通用问答
        </div>
      )}

      {/* 消息区 */}
      <div ref={scrollRef} style={{
        flex: 1, minHeight: 0, overflowY: 'auto',
        padding: compact ? '10px 12px' : '16px',
        display: 'flex', flexDirection: 'column', gap: compact ? '8px' : '12px',
      }}>
        {messages.length === 0 ? (
          <div style={{
            margin: 'auto 0', textAlign: 'center',
            color: '#8e8e93', fontSize: '14px', lineHeight: 1.7,
          }}>
            <div style={{ fontSize: '28px', marginBottom: '8px' }}>💬</div>
            问点什么吧
            <div style={{ fontSize: '12px', color: '#8e8e93', marginTop: '4px' }}>
              {mode === 'kb' ? '基于你的知识库回答' : '个人 AI 助手 · 基于你配置的大模型'}
            </div>
          </div>
        ) : (
          messages.map(renderMessage)
        )}
      </div>

      {/* 输入区 */}
      <div style={{
        display: 'flex', gap: '8px',
        padding: compact ? '8px 12px' : '12px 16px',
        borderTop: '1px solid rgba(60,60,67,0.12)',
        alignItems: 'flex-end',
        flexShrink: 0,
      }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={streaming ? 'AI 正在回复...' : '输入问题，回车发送...'}
          disabled={streaming}
          rows={1}
          style={{
            flex: 1, border: '1px solid rgba(60,60,67,0.18)',
            borderRadius: '10px', padding: '9px 12px',
            fontSize: '13px', lineHeight: 1.5, color: '#1c1c1e',
            background: '#fff', outline: 'none',
            resize: 'none', minHeight: '38px', maxHeight: '120px',
            opacity: streaming ? 0.6 : 1,
          }}
        />
        {streaming ? (
          <button
            onClick={handleStop}
            style={{
              border: 'none', background: 'rgba(255,59,48,0.1)',
              color: '#FF3B30', borderRadius: '10px',
              padding: '0 16px', height: '38px',
              fontSize: '12px', fontWeight: '600', cursor: 'pointer',
            }}
          >停止</button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            style={{
              border: 'none',
              background: input.trim() ? 'var(--s-grad-bg)' : 'rgba(120,120,128,0.15)',
              color: input.trim() ? '#fff' : '#8e8e93',
              borderRadius: '10px',
              padding: '0 16px', height: '38px',
              fontSize: '12px', fontWeight: '600', cursor: 'pointer',
            }}
          >发送</button>
        )}
      </div>
    </div>
  );
}

// 模型标签辅助
function modelLabel(provider) {
  const labels = {
    doubao: '豆包', deepseek: 'DeepSeek', qwen: '通义',
    kimi: 'Kimi', glm: 'GLM', custom: '自定义',
  };
  return labels[provider] || provider;
}
