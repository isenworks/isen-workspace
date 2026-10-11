import { useState, useRef } from 'react';
import AIChat from '../components/AIChat.jsx';
import AIConfigModal from '../components/AIConfigModal.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { IconGlobe, IconBook, IconGear, IconRotate } from '../components/aiIcons.jsx';
import { getAIConfig } from '../utils/aiLLM.js';

/* AI 助手主页面：顶部横条卡（标题+模式+配置+清空）+ 对话卡
   与「小记」「知识库」页的三卡范式对齐 */
function modelLabel(provider) {
  const labels = {
    doubao: '豆包', deepseek: 'DeepSeek', qwen: '通义千问',
    kimi: 'Kimi', glm: '智谱 GLM', custom: '自定义',
  };
  return labels[provider] || provider;
}

export default function AIAssistantPage() {
  const [mode, setMode] = useState('general');
  const [configOpen, setConfigOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [messageCount, setMessageCount] = useState(0);
  const chatRef = useRef(null);

  const config = getAIConfig();
  const currentModelLabel = config?.apiKey
    ? (config.provider === 'custom' ? (config.model || '自定义') : modelLabel(config.provider))
    : '未配置';

  return (
    <div className="flex-1 min-w-0 w-full flex flex-col gap-3">
      {/* ===== 顶部横条卡 ===== */}
      <div className="glass-card rounded-2xl p-2.5 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="w-[5px] h-[20px] rounded-full flex-shrink-0" style={{ background: 'var(--s-grad-bg)' }} />
          <span className="text-[15.5px] font-bold text-ink-900 leading-none flex-shrink-0">AI 助手</span>

          {/* 模式切换（工作台分段控件风格） */}
          <div className="ml-auto flex items-center p-[2px] rounded-lg flex-shrink-0" style={{ background: 'rgba(120,120,128,0.08)' }}>
            <button
              onClick={() => setMode('general')}
              title="通用问答：直接使用模型知识回答"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all text-[12px] font-medium"
              style={mode === 'general'
                ? { background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', color: 'var(--s-main)' }
                : { color: '#8a9491' }}
            >
              <IconGlobe size={12} />
              通用问答
            </button>
            <button
              onClick={() => setMode('kb')}
              title="知识库问答：仅基于你沉淀的知识回答"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all text-[12px] font-medium"
              style={mode === 'kb'
                ? { background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', color: 'var(--s-main)' }
                : { color: '#8a9491' }}
            >
              <IconBook size={12} />
              知识库问答
            </button>
          </div>

          {/* 模型配置 */}
          <button
            onClick={() => setConfigOpen(true)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] font-medium flex-shrink-0 transition-colors ${
              config?.apiKey ? 'text-ink-600 hover:bg-ink-50' : 'text-white'
            }`}
            style={config?.apiKey
              ? { border: '1px solid #d4d9d8' }
              : { background: 'var(--s-grad-bg)', boxShadow: '0 2px 6px rgba(var(--s-rgb),0.25)' }}
            title="配置模型 API"
          >
            <IconGear size={12} />
            {currentModelLabel}
            {!config?.apiKey && <span className="ml-0.5">去配置</span>}
          </button>

          {/* 清空 */}
          <button
            onClick={() => messageCount > 0 && setConfirmClear(true)}
            disabled={messageCount === 0}
            className="w-[26px] h-[26px] rounded-lg flex items-center justify-center flex-shrink-0 text-ink-400 hover:bg-ink-50 transition-colors disabled:opacity-30 disabled:cursor-default"
            title="清空对话"
          >
            <IconRotate size={13} />
          </button>
        </div>
      </div>

      {/* ===== 对话卡 ===== */}
      <div className="glass-card rounded-2xl flex-1 min-h-0 flex flex-col px-5 pt-3 pb-4">
        <AIChat
          ref={chatRef}
          mode={mode}
          onModeChange={setMode}
          onConfigClick={() => setConfigOpen(true)}
          storageKey="ai_messages_main"
          headerless
          onMessagesChange={setMessageCount}
        />
      </div>

      <AIConfigModal open={configOpen} onClose={() => setConfigOpen(false)} />

      {/* 清空确认 */}
      <ConfirmDialog
        open={confirmClear}
        title="清空对话"
        message="确定清空当前对话？清空后不可恢复。"
        confirmText="清空"
        danger
        onConfirm={() => { chatRef.current?.clear(); setConfirmClear(false); }}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  );
}
