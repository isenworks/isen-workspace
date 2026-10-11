/* ============================================================
 * 知识库数据层（localStorage 主存储 + cloudKV 镜像）
 *   条目结构：{ id, title, content(HTML富文本), source, sourceUrl, tags[], createdAt, updatedAt }
 *   · 复用 cloudPush 实现云端镜像（同年度规划/主题同款机制）
 *   · 搜索：标题 + 正文(纯文本) + 标签 全文匹配
 *   · getKBTextForPrompt：全量拼文本给 AI system prompt（v1 不做 RAG）
 * ============================================================ */

import { cloudPush } from './cloudKV.js';

const KB_LS_KEY = 'ai_kb_entries';
const KB_CLOUD_KEY = 'ai_kb_entries';

// 生成唯一 ID
function genId() {
  return 'kb_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

// 读取所有条目
export function getKBEntries() {
  try {
    const raw = localStorage.getItem(KB_LS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

// 保存条目（内部用，写 localStorage + 推云端）
function persist(entries) {
  try {
    localStorage.setItem(KB_LS_KEY, JSON.stringify(entries));
    cloudPush(KB_CLOUD_KEY, JSON.stringify(entries));
  } catch { /* ignore */ }
}

// 新增条目
export function addKBEntry({ title, content, source = 'manual', sourceUrl = '', tags = [] }) {
  const entries = getKBEntries();
  const now = Date.now();
  const entry = {
    id: genId(),
    title: title || '无标题',
    content: content || '',
    source,
    sourceUrl,
    tags: Array.isArray(tags) ? tags : [],
    createdAt: now,
    updatedAt: now,
  };
  entries.unshift(entry);
  persist(entries);
  return entry;
}

// 更新条目
export function updateKBEntry(id, { title, content, sourceUrl, tags }) {
  const entries = getKBEntries();
  const idx = entries.findIndex(e => e.id === id);
  if (idx === -1) return null;
  const updated = {
    ...entries[idx],
    title: title !== undefined ? title : entries[idx].title,
    content: content !== undefined ? content : entries[idx].content,
    sourceUrl: sourceUrl !== undefined ? sourceUrl : entries[idx].sourceUrl,
    tags: tags !== undefined ? (Array.isArray(tags) ? tags : entries[idx].tags) : entries[idx].tags,
    updatedAt: Date.now(),
  };
  entries[idx] = updated;
  persist(entries);
  return updated;
}

// 删除条目
export function removeKBEntry(id) {
  const entries = getKBEntries().filter(e => e.id !== id);
  persist(entries);
  return true;
}

// 获取所有标签及计数
export function getKBTags() {
  const entries = getKBEntries();
  const tagMap = {};
  for (const e of entries) {
    for (const t of (e.tags || [])) {
      tagMap[t] = (tagMap[t] || 0) + 1;
    }
  }
  return Object.entries(tagMap)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

// 搜索条目（标题 + 正文纯文本 + 标签）
export function searchKB(query, tagFilter = null) {
  let entries = getKBEntries();
  if (tagFilter) {
    entries = entries.filter(e => (e.tags || []).includes(tagFilter));
  }
  if (!query) return entries;
  const q = query.toLowerCase();
  return entries.filter(e => {
    const title = (e.title || '').toLowerCase();
    // 正文 strip HTML 取纯文本
    const text = stripHtml(e.content).toLowerCase();
    const tags = (e.tags || []).join(' ').toLowerCase();
    return title.includes(q) || text.includes(q) || tags.includes(q);
  });
}

// HTML → 纯文本（用于搜索和 AI prompt）
function stripHtml(html) {
  if (!html) return '';
  try {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return (tmp.innerText || tmp.textContent || '').replace(/\s+/g, ' ').trim();
  } catch {
    // SSR/无 DOM 环境兜底：正则去标签
    return String(html).replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
  }
}

// 拼知识库文本（给 AI system prompt 用，v1 全量拼）
// 超过条数或字数上限时截断（防 prompt 过长）
export function getKBTextForPrompt(maxEntries = 50, maxChars = 20000) {
  const entries = getKBEntries();
  if (!entries.length) return '';

  const parts = [];
  let totalChars = 0;
  const count = Math.min(entries.length, maxEntries);

  for (let i = 0; i < count; i++) {
    const e = entries[i];
    const plainText = stripHtml(e.content);
    const tags = (e.tags || []).join('、');
    const block = [
      `[条目${i + 1}] ${e.title}`,
      tags ? `标签：${tags}` : null,
      e.sourceUrl ? `来源：${e.sourceUrl}` : null,
      `内容：${plainText}`,
    ].filter(Boolean).join('\n');

    if (totalChars + block.length > maxChars) break;
    parts.push(block);
    totalChars += block.length;
  }

  return parts.join('\n\n---\n\n');
}

// 从云端同步（页面加载时调用）
export async function syncKBFromCloud() {
  try {
    const res = await fetch(`/api/userSettings/get?k=${encodeURIComponent(KB_CLOUD_KEY)}`, {
      headers: { 'X-Unlock-Token': localStorage.getItem('pw_unlock_token') || '' },
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.ok && data.data) {
      const cloudStr = data.data[KB_CLOUD_KEY];
      if (cloudStr) {
        const cloudEntries = JSON.parse(cloudStr);
        if (Array.isArray(cloudEntries)) {
          // 云端较新则覆盖本地（LWW，同年度规划简单值策略）
          const local = getKBEntries();
          const localMax = local.length ? Math.max(...local.map(e => e.updatedAt || 0)) : 0;
          const cloudMax = cloudEntries.length ? Math.max(...cloudEntries.map(e => e.updatedAt || 0)) : 0;
          if (cloudMax > localMax) {
            localStorage.setItem(KB_LS_KEY, JSON.stringify(cloudEntries));
            return cloudEntries;
          }
        }
      }
    }
  } catch { /* ignore */ }
  return null;
}
