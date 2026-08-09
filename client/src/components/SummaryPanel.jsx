import { useState, useEffect } from 'react';

const STORAGE_KEY = (uid) => `summary_doc_url:${uid || 'anon'}`;

export default function SummaryPanel({ userId, date, onClose }) {
  const storageKey = STORAGE_KEY(userId);
  const [docUrl, setDocUrl] = useState('');
  const [inputUrl, setInputUrl] = useState('');
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(storageKey) || '';
    setDocUrl(saved);
    setInputUrl(saved);
  }, [storageKey]);

  const handleSave = () => {
    const url = inputUrl.trim();
    if (!url) return;
    localStorage.setItem(storageKey, url);
    setDocUrl(url);
    setEditing(false);
  };

  const handleOpen = () => {
    if (docUrl) {
      window.open(docUrl, '_blank', 'noopener,noreferrer');
      onClose?.();
    }
  };

  const handleClear = () => {
    localStorage.removeItem(storageKey);
    setDocUrl('');
    setInputUrl('');
    setEditing(false);
  };

  const isValidUrl = (url) => /^https?:\/\//i.test(url);

  if (!docUrl || editing) {
    return (
      <div>
        <p className="text-[14px] text-[#8e8e93] mb-4">
          粘贴你的在线文档链接，之后点击总结会直接打开这个文档。
        </p>

        <div className="mb-3">
          <label className="block text-[13px] font-medium text-[#1c1c1e] mb-1.5">
            文档链接
          </label>
          <input
            type="url"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            placeholder="https://doc.weixin.qq.com/..."
            className="w-full px-3 py-2.5 text-[14px] rounded-xl border border-[#d1d1d6] bg-white/70 text-[#1c1c1e] placeholder-[#c7c7cc] focus:outline-none focus:border-[#007aff] focus:ring-2 focus:ring-[#007aff]/20 transition"
            autoFocus
          />
          {inputUrl && !isValidUrl(inputUrl) && (
            <p className="text-[12px] text-[#ff3b30] mt-1.5">
              请输入以 http:// 或 https:// 开头的有效链接
            </p>
          )}
        </div>

        <p className="text-[12px] text-[#8e8e93] mb-5">
          支持飞书、Notion、语雀、腾讯文档、金山文档等
        </p>

        <div className="flex gap-2 justify-end">
          {docUrl && (
            <button
              onClick={handleClear}
              className="px-4 py-2 text-[14px] text-[#ff3b30] hover:bg-[#ff3b30]/10 rounded-xl transition"
            >
              清除
            </button>
          )}
          <button
            onClick={() => { setInputUrl(docUrl || ''); setEditing(false); }}
            className="px-4 py-2 text-[14px] text-[#8e8e93] hover:bg-black/5 rounded-xl transition"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={!isValidUrl(inputUrl)}
            className="px-4 py-2 text-[14px] font-medium text-white rounded-xl transition disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: '#007aff' }}
          >
            保存
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 p-3 rounded-xl bg-[#f2f2f7] mb-4">
        <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-[#007aff] text-lg flex-shrink-0">
          📄
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-medium text-[#1c1c1e] truncate">
            我的总结文档
          </p>
          <p className="text-[12px] text-[#8e8e93] truncate">{docUrl}</p>
        </div>
      </div>

      <p className="text-[13px] text-[#8e8e93] mb-5">
        点击下方按钮在新标签页打开文档，记录今日总结。
      </p>

      <div className="flex gap-2 justify-end">
        <button
          onClick={() => setEditing(true)}
          className="px-4 py-2 text-[14px] text-[#8e8e93] hover:bg-black/5 rounded-xl transition"
        >
          更换链接
        </button>
        <button
          onClick={handleOpen}
          className="px-5 py-2 text-[14px] font-medium text-white rounded-xl transition"
          style={{ background: '#007aff' }}
        >
          打开文档
        </button>
      </div>
    </div>
  );
}
