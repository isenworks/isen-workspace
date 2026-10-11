import { useState, useEffect } from 'react';
import Modal from './Modal.jsx';
import { modelConfigs, getAIConfig, saveAIConfig, testConnection } from '../utils/aiLLM.js';
import { IconGear, IconCheck, IconAlert, IconClock } from './aiIcons.jsx';

/* 模型配置弹窗：选择模型 / 填 API Key / 测试连接 / 保存（风格对齐工作台 Modal） */
export default function AIConfigModal({ open, onClose }) {
  const [provider, setProvider] = useState('doubao');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [enableTools, setEnableTools] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState('');
  const [testOk, setTestOk] = useState(null); // true/false/null

  // 打开时读取当前配置
  useEffect(() => {
    if (!open) return;
    const cfg = getAIConfig();
    if (cfg) {
      setProvider(cfg.provider);
      setApiKey(cfg.apiKey);
      setBaseUrl(cfg.baseUrl);
      setModel(cfg.model);
      setEnableTools(cfg.enableTools !== false);
    } else {
      const def = modelConfigs.doubao;
      setProvider('doubao');
      setApiKey('');
      setBaseUrl(def.baseUrl);
      setModel(def.model);
      setEnableTools(true);
    }
    setTestMsg('');
    setTestOk(null);
  }, [open]);

  // 选择模型时自动填充 baseUrl 和 model
  function handleSelectProvider(p) {
    setProvider(p);
    const cfg = modelConfigs[p];
    if (cfg) {
      setBaseUrl(cfg.baseUrl);
      setModel(cfg.model);
    }
    setTestMsg('');
    setTestOk(null);
  }

  // 测试连接
  async function handleTest() {
    if (!apiKey) { setTestMsg('请先填写 API Key'); setTestOk(false); return; }
    if (!baseUrl) { setTestMsg('请填写 API 地址'); setTestOk(false); return; }
    if (!model) { setTestMsg('请填写模型名称'); setTestOk(false); return; }
    setTesting(true);
    setTestMsg('正在测试连接…');
    setTestOk(null);
    try {
      const reply = await testConnection({ apiKey, baseUrl, model });
      setTestMsg(`连接成功${reply ? `：${reply.slice(0, 60)}` : ''}`);
      setTestOk(true);
    } catch (err) {
      setTestMsg(`连接失败：${err.message}`);
      setTestOk(false);
    } finally {
      setTesting(false);
    }
  }

  // 保存
  function handleSave() {
    saveAIConfig({ provider, apiKey, baseUrl, model, enableTools });
    onClose?.();
  }

  const inputCls = "w-full px-3 py-1.5 rounded-lg text-[13px] bg-white border border-ink-200 focus:border-[var(--s-main)] focus:outline-none transition-colors";
  const labelCls = "block text-[12.5px] font-semibold text-ink-700 mb-1.5";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="模型配置"
      maxWidth={440}
      footer={
        <>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-[13px] font-medium text-ink-600 bg-ink-100 hover:bg-ink-200/70 transition-colors"
          >取消</button>
          <button
            onClick={handleSave}
            className="px-4 py-1.5 rounded-lg text-[13px] font-semibold text-white transition-all active:scale-[0.98]"
            style={{ background: 'var(--s-grad-bg)', boxShadow: '0 2px 6px rgba(var(--s-rgb),0.25)' }}
          >保存</button>
        </>
      }
    >
      {/* 模型选择（工作台选择行风格） */}
      <div className="mb-4">
        <div className={labelCls}>选择模型</div>
        <div className="rounded-xl border border-ink-100 bg-white overflow-hidden">
          {Object.entries(modelConfigs).map(([key, cfg], i) => {
            const active = provider === key;
            return (
              <button
                key={key}
                onClick={() => handleSelectProvider(key)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${i > 0 ? 'border-t border-ink-100/70' : ''} ${
                  active ? 'bg-[rgba(var(--s-rgb),0.06)]' : 'hover:bg-ink-50'
                }`}
              >
                {/* 选中圆点 */}
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${active ? '' : 'bg-ink-200'}`}
                  style={active ? { background: 'var(--s-main)' } : {}} />
                <span className={`text-[12.5px] ${active ? 'text-ink-900 font-semibold' : 'text-ink-700'}`}>
                  {cfg.label}
                </span>
                {key !== 'custom' && (
                  <span className="text-[10.5px] text-ink-300 truncate">{cfg.model}</span>
                )}
                {active && (
                  <span className="ml-auto text-[var(--s-main)]"><IconCheck size={13} /></span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* API Key */}
      <div className="mb-3">
        <label className={labelCls}>API Key</label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => { setApiKey(e.target.value); setTestMsg(''); setTestOk(null); }}
          placeholder="输入你的 API Key"
          className={inputCls}
        />
      </div>

      {/* API 地址 */}
      <div className="mb-3">
        <label className={labelCls}>API 地址</label>
        <input
          type="text"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="如 https://api.deepseek.com/v1"
          className={inputCls}
        />
      </div>

      {/* 模型名称 */}
      <div className="mb-3">
        <label className={labelCls}>模型名称</label>
        <input
          type="text"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="如 deepseek-chat"
          className={inputCls}
        />
      </div>

      {/* 工具调用开关 */}
      <label className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-ink-50 cursor-pointer mb-3">
        <input
          type="checkbox"
          checked={enableTools}
          onChange={(e) => setEnableTools(e.target.checked)}
          className="w-[15px] h-[15px] rounded accent-[var(--s-main)]"
        />
        <span className="text-[12.5px] font-medium text-ink-900">启用 Agent 工具调用</span>
        <span className="text-[11px] text-ink-400">允许 AI 查询 / 创建工作台数据</span>
      </label>

      {/* 测试连接行 */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleTest}
          disabled={testing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12.5px] font-medium text-ink-700 bg-white border border-ink-200 hover:bg-ink-50 transition-colors disabled:opacity-50"
        >
          {testing
            ? <span className="ai-btn-spin"><IconClock size={12} /></span>
            : <IconGear size={12} />}
          {testing ? '测试中…' : '测试连接'}
        </button>
        {testMsg && (
          <div className={`flex items-center gap-1.5 flex-1 min-w-0 px-2.5 py-1.5 rounded-lg text-[11.5px] truncate ${
            testOk === true ? 'bg-[#34C75910] text-[#34C759]'
              : testOk === false ? 'bg-[#FF3B300F] text-[#FF3B30]'
              : 'bg-ink-50 text-ink-400'
          }`}>
            {testOk === true ? <IconCheck size={12} />
              : testOk === false ? <IconAlert size={12} />
              : <span className="ai-btn-spin"><IconClock size={12} /></span>}
            <span className="truncate">{testMsg}</span>
          </div>
        )}
      </div>

      <style>{`
        .ai-btn-spin { display: inline-flex; animation: ai-btn-rotate 1s linear infinite; }
        @keyframes ai-btn-rotate { to { transform: rotate(360deg); } }
      `}</style>
    </Modal>
  );
}
