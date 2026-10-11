import { useState, useEffect } from 'react';
import Modal from './Modal.jsx';
import { modelConfigs, getAIConfig, saveAIConfig, testConnection } from '../utils/aiLLM.js';

/* 模型配置弹窗：选择模型 / 填 API Key / 测试连接 / 保存
   复用 Modal 组件，风格统一 */
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
      // 默认值
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
    setTestMsg('正在测试连接...');
    setTestOk(null);
    try {
      const reply = await testConnection({ apiKey, baseUrl, model });
      setTestMsg(`连接成功${reply ? '：' + reply.slice(0, 60) : ''}`);
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

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="⚙️ 模型配置"
      maxWidth={460}
      footer={
        <>
          <button
            onClick={handleTest}
            disabled={testing}
            style={{
              padding: '9px 16px', borderRadius: '10px',
              background: 'rgba(120,120,128,0.12)',
              color: testing ? '#8e8e93' : '#1c1c1e',
              border: 'none', fontWeight: '600', fontSize: '14px',
              cursor: testing ? 'not-allowed' : 'pointer',
              marginRight: '8px',
            }}
          >{testing ? '测试中...' : '测试连接'}</button>
          <button
            onClick={handleSave}
            style={{
              padding: '9px 20px', borderRadius: '10px',
              background: 'var(--s-grad-bg)', color: '#fff',
              border: 'none', fontWeight: '600', fontSize: '14px',
              cursor: 'pointer',
            }}
          >保存</button>
        </>
      }
    >
      {/* 模型选择 */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '13px', fontWeight: '600', color: '#1c1c1e', marginBottom: '10px' }}>
          选择模型
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {Object.entries(modelConfigs).map(([key, cfg]) => (
            <label
              key={key}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '9px 12px', borderRadius: '8px',
                background: provider === key ? 'rgba(var(--s-rgb),0.08)' : 'transparent',
                cursor: 'pointer', transition: 'background .15s',
                border: provider === key ? '1px solid rgba(var(--s-rgb),0.3)' : '1px solid transparent',
              }}
            >
              <input
                type="radio"
                name="provider"
                checked={provider === key}
                onChange={() => handleSelectProvider(key)}
                style={{ accentColor: 'var(--s-main)' }}
              />
              <span style={{ fontSize: '13px', fontWeight: '500', color: '#1c1c1e' }}>{cfg.label}</span>
              {key !== 'custom' && (
                <span style={{ fontSize: '11px', color: '#8e8e93' }}>
                  {cfg.model}
                </span>
              )}
            </label>
          ))}
        </div>
      </div>

      {/* API Key */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#1c1c1e', marginBottom: '6px' }}>
          API Key
        </label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => { setApiKey(e.target.value); setTestMsg(''); setTestOk(null); }}
          placeholder="输入你的 API Key"
          style={{
            width: '100%', padding: '10px 12px', borderRadius: '10px',
            border: '1px solid rgba(60,60,67,0.18)', fontSize: '13px',
            outline: 'none', background: '#fff', color: '#1c1c1e',
          }}
        />
      </div>

      {/* API 地址 */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#1c1c1e', marginBottom: '6px' }}>
          API 地址
        </label>
        <input
          type="text"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="如 https://api.deepseek.com/v1"
          style={{
            width: '100%', padding: '10px 12px', borderRadius: '10px',
            border: '1px solid rgba(60,60,67,0.18)', fontSize: '13px',
            outline: 'none', background: '#fff', color: '#1c1c1e',
          }}
        />
      </div>

      {/* 模型名称 */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#1c1c1e', marginBottom: '6px' }}>
          模型名称
        </label>
        <input
          type="text"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="如 deepseek-chat"
          style={{
            width: '100%', padding: '10px 12px', borderRadius: '10px',
            border: '1px solid rgba(60,60,67,0.18)', fontSize: '13px',
            outline: 'none', background: '#fff', color: '#1c1c1e',
          }}
        />
      </div>

      {/* 工具调用开关 */}
      <label style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '10px 12px', borderRadius: '10px',
        background: 'rgba(120,120,128,0.06)', cursor: 'pointer',
        marginBottom: '16px',
      }}>
        <input
          type="checkbox"
          checked={enableTools}
          onChange={(e) => setEnableTools(e.target.checked)}
          style={{ accentColor: 'var(--s-main)', width: '16px', height: '16px' }}
        />
        <span style={{ fontSize: '13px', color: '#1c1c1e', fontWeight: '500' }}>
          启用 Agent 工具调用
        </span>
        <span style={{ fontSize: '11px', color: '#8e8e93' }}>
          （允许 AI 查询/创建工作台数据）
        </span>
      </label>

      {/* 测试结果 */}
      {testMsg && (
        <div style={{
          padding: '10px 12px', borderRadius: '8px',
          background: testOk === true ? 'rgba(52,199,89,0.1)' : testOk === false ? 'rgba(255,59,48,0.1)' : 'rgba(120,120,128,0.1)',
          fontSize: '12px', color: testOk === true ? '#34C759' : testOk === false ? '#FF3B30' : '#8e8e93',
        }}>
          {testOk === true ? '✓ ' : testOk === false ? '✕ ' : '⏳ '}{testMsg}
        </div>
      )}
    </Modal>
  );
}
