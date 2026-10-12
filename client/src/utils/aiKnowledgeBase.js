/* ============================================================
 * 知识库数据层（localStorage 主存储 + cloudKV 镜像）
 *   知识库（书架）：{ id, name, order, createdAt, updatedAt }
 *   文档条目：{ id, kbId, group, order, title, content(HTML), source, sourceUrl, tags[], createdAt, updatedAt }
 *   · 三级结构：知识库 → 章节分组 → 文档
 *   · 旧扁平数据自动迁移：无 kbId 的条目归入默认知识库，group 置空
 *   · 搜索：标题 + 正文(纯文本) + 标签 全文匹配
 *   · getKBTextForPrompt：全量拼文本给 AI system prompt（v1 不做 RAG）
 * ============================================================ */

import { cloudPush } from './cloudKV.js';

const KB_LS_KEY = 'ai_kb_entries';
const KB_CLOUD_KEY = 'ai_kb_entries';
const BOOKS_LS_KEY = 'ai_kb_books';
const BOOKS_CLOUD_KEY = 'ai_kb_books';

const DEFAULT_KB_ID = 'kb_default';
const DEFAULT_KB_NAME = '我的知识库';

// 生成唯一 ID
function genId(prefix = 'kb_') {
  return prefix + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

/* ------------------------------ 文档条目 ------------------------------ */

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

// 按 order 升序（其次按创建时间）
function byOrder(a, b) {
  const ao = typeof a.order === 'number' ? a.order : 0;
  const bo = typeof b.order === 'number' ? b.order : 0;
  return ao - bo || (a.createdAt || 0) - (b.createdAt || 0);
}

// 新增文档（挂到指定知识库 / 分组，自动排在末尾）
export function addKBEntry({ title, content, source = 'manual', sourceUrl = '', tags = [], kbId, group = '' }) {
  const entries = getKBEntries();
  const now = Date.now();
  const g = group || '';
  const siblings = entries.filter(e => e.kbId === kbId && (e.group || '') === g);
  const order = siblings.length ? Math.max(...siblings.map(e => (typeof e.order === 'number' ? e.order : 0))) + 1 : 0;
  const entry = {
    id: genId(),
    kbId,
    group: g,
    order,
    title: title || '无标题',
    content: content || '',
    source,
    sourceUrl,
    tags: Array.isArray(tags) ? tags : [],
    createdAt: now,
    updatedAt: now,
  };
  entries.push(entry);
  persist(entries);
  return entry;
}

// 更新文档
export function updateKBEntry(id, { title, content, source, sourceUrl, tags, kbId, group } = {}) {
  const entries = getKBEntries();
  const idx = entries.findIndex(e => e.id === id);
  if (idx === -1) return null;
  const prev = entries[idx];
  const updated = {
    ...prev,
    title: title !== undefined ? title : prev.title,
    content: content !== undefined ? content : prev.content,
    source: source !== undefined ? source : prev.source,
    sourceUrl: sourceUrl !== undefined ? sourceUrl : prev.sourceUrl,
    tags: tags !== undefined ? (Array.isArray(tags) ? tags : prev.tags) : prev.tags,
    kbId: kbId !== undefined ? kbId : prev.kbId,
    group: group !== undefined ? (group || '') : prev.group,
    updatedAt: Date.now(),
  };
  entries[idx] = updated;
  persist(entries);
  return updated;
}

// 删除文档
export function removeKBEntry(id) {
  const entries = getKBEntries().filter(e => e.id !== id);
  persist(entries);
  return true;
}

// 某知识库下的文档（按 order 排序，可带关键词过滤）
export function getKBDocs(kbId, query = '') {
  let list = getKBEntries().filter(e => e.kbId === kbId).sort(byOrder);
  const q = String(query || '').trim().toLowerCase();
  if (!q) return list;
  list = list.filter(e => {
    const title = (e.title || '').toLowerCase();
    const text = stripHtml(e.content).toLowerCase();
    const tags = (e.tags || []).join(' ').toLowerCase();
    return title.includes(q) || text.includes(q) || tags.includes(q);
  });
  return list;
}

// 某知识库的目录树：[{ group, docs[] }]
//   分组顺序：先按知识库显式声明的分组（支持空章节），再追加文档中出现但未声明的分组；
//   搜索时自动隐藏没有命中的空分组。空 group('') 表示「未分组」。
export function getKBTree(kbId, query = '') {
  const book = getKBBooks().find(b => b.id === kbId);
  const declared = Array.isArray(book?.groups) ? book.groups : [];
  const docs = getKBDocs(kbId, query);
  const order = [];
  const map = new Map();
  for (const name of declared) {
    if (!map.has(name)) { map.set(name, []); order.push(name); }
  }
  for (const d of docs) {
    const g = d.group || '';
    if (!map.has(g)) { map.set(g, []); order.push(g); }
    map.get(g).push(d);
  }
  let result = order.map(g => ({ group: g, docs: map.get(g) }));
  if (String(query || '').trim()) result = result.filter(it => it.docs.length > 0);
  return result;
}

// 新建分组（章节），支持空章节
export function addKBGroup(kbId, name) {
  const next = (name || '').trim();
  if (!next) return false;
  const books = getRawBooks();
  const idx = books.findIndex(b => b.id === kbId);
  if (idx === -1) return false;
  const groups = Array.isArray(books[idx].groups) ? books[idx].groups : [];
  if (groups.includes(next)) return false;
  books[idx].groups = [...groups, next];
  books[idx].updatedAt = Date.now();
  persistBooks(books);
  return true;
}

// 重命名分组（newName 为空 → 归入「未分组」）；同步知识库显式分组名与该组文档
export function renameKBGroup(kbId, oldName, newName) {
  const next = (newName || '').trim();
  const old = oldName || '';
  const books = getRawBooks();
  const bIdx = books.findIndex(b => b.id === kbId);
  if (bIdx !== -1 && Array.isArray(books[bIdx].groups) && books[bIdx].groups.includes(old)) {
    books[bIdx].groups = books[bIdx].groups
      .map(g => (g === old ? next : g))
      .filter((g, i, arr) => g && arr.indexOf(g) === i);
    books[bIdx].updatedAt = Date.now();
    persistBooks(books);
  }
  const entries = getKBEntries();
  let changed = false;
  for (const e of entries) {
    if (e.kbId === kbId && (e.group || '') === old) {
      e.group = next;
      e.updatedAt = Date.now();
      changed = true;
    }
  }
  if (changed) persist(entries);
  return changed;
}

// 删除分组：从知识库显式分组移除，其下文档归入「未分组」
export function removeKBGroup(kbId, name) {
  const target = name || '';
  const books = getRawBooks();
  const bIdx = books.findIndex(b => b.id === kbId);
  if (bIdx !== -1 && Array.isArray(books[bIdx].groups)) {
    books[bIdx].groups = books[bIdx].groups.filter(g => g !== target);
    books[bIdx].updatedAt = Date.now();
    persistBooks(books);
  }
  return renameKBGroup(kbId, target, '');
}

// 拖拽排序：把 dragId 文档移到 targetId 之前（同/跨分组），或追加到某个分组末尾
//   - targetId 提供时：插到目标文档前，并继承目标分组
//   - 仅提供 group 时：追加到该分组末尾（group 可为 '' 表示未分组）
export function reorderKBDoc(kbId, dragId, { targetId = null, group = null } = {}) {
  const entries = getKBEntries();
  const kbDocs = entries.filter(e => e.kbId === kbId).sort(byOrder);
  const drag = kbDocs.find(d => d.id === dragId);
  if (!drag) return false;
  const rest = kbDocs.filter(d => d.id !== dragId);

  let insertIdx;
  if (targetId) {
    const target = rest.find(d => d.id === targetId);
    if (!target) return false;
    drag.group = target.group || '';
    insertIdx = rest.indexOf(target);
  } else if (group !== null) {
    drag.group = group || '';
    let last = -1;
    rest.forEach((d, i) => { if ((d.group || '') === drag.group) last = i; });
    insertIdx = last === -1 ? rest.length : last + 1;
  } else {
    insertIdx = rest.length;
  }
  drag.updatedAt = Date.now();
  rest.splice(insertIdx, 0, drag);
  rest.forEach((d, i) => { d.order = i; });

  const others = entries.filter(e => e.kbId !== kbId);
  persist([...others, ...rest]);
  return true;
}

// 分组排序：按给定名称顺序重写知识库的显式分组（空字符串「未分组」不参与，恒置末尾）
//   非空分组若尚未显式声明，会被补入声明数组（隐式分组实体化为显式分组）
export function setKBGroupOrder(kbId, orderedNames) {
  const names = (orderedNames || []).filter(g => g && g !== '');
  const books = getRawBooks();
  const idx = books.findIndex(b => b.id === kbId);
  if (idx === -1) return false;
  const existing = Array.isArray(books[idx].groups) ? books[idx].groups.filter(g => g && g !== '') : [];
  const merged = [...names];
  for (const g of existing) if (!merged.includes(g)) merged.push(g);
  books[idx].groups = merged;
  books[idx].updatedAt = Date.now();
  persistBooks(books);
  return true;
}

/* ------------------------------ 知识库（书架） ------------------------------ */

function getRawBooks() {
  try {
    const raw = localStorage.getItem(BOOKS_LS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function persistBooks(books) {
  try {
    localStorage.setItem(BOOKS_LS_KEY, JSON.stringify(books));
    cloudPush(BOOKS_CLOUD_KEY, JSON.stringify(books));
  } catch { /* ignore */ }
}

// 所有知识库（按 order 排序）
export function getKBBooks() {
  return getRawBooks()
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.createdAt || 0) - (b.createdAt || 0));
}

export function addKBBook({ name, desc, icon, color }) {
  const books = getRawBooks();
  const now = Date.now();
  const order = books.length ? Math.max(...books.map(b => b.order ?? 0)) + 1 : 0;
  const book = {
    id: genId('kbk_'), name: (name || '').trim() || '未命名知识库',
    desc: (desc || '').trim(), icon: icon || '', color: color || '',
    order, groups: [], createdAt: now, updatedAt: now,
  };
  books.push(book);
  persistBooks(books);
  return book;
}

export function updateKBBook(id, { name, desc, icon, color }) {
  const books = getRawBooks();
  const idx = books.findIndex(b => b.id === id);
  if (idx === -1) return null;
  if (name !== undefined) books[idx].name = (name || '').trim() || books[idx].name;
  if (desc !== undefined) books[idx].desc = (desc || '').trim();
  if (icon !== undefined) books[idx].icon = icon || '';
  if (color !== undefined) books[idx].color = color || '';
  books[idx].updatedAt = Date.now();
  persistBooks(books);
  return books[idx];
}

// 删除知识库（连同其下文档）
export function removeKBBook(id) {
  const books = getRawBooks().filter(b => b.id !== id);
  persistBooks(books);
  const entries = getKBEntries().filter(e => e.kbId !== id);
  persist(entries);
  return true;
}

// 首次加载 / 数据升级：保证至少有一个知识库，并把旧扁平条目 & 孤儿条目归入默认库
export function ensureKBBooks() {
  let books = getRawBooks();
  let entries = getKBEntries();
  let booksChanged = false;
  let entriesChanged = false;

  if (books.length === 0) {
    books = [{ id: DEFAULT_KB_ID, name: DEFAULT_KB_NAME, order: 0, groups: [], createdAt: Date.now(), updatedAt: Date.now() }];
    booksChanged = true;
  }
  const ids = new Set(books.map(b => b.id));
  const fallbackId = books[0].id;

  entries = entries.map((e, i) => {
    let next = e;
    if (!e.kbId || !ids.has(e.kbId)) {
      next = { ...next, kbId: fallbackId };
      entriesChanged = true;
    }
    if (next.group === undefined) {
      next = { ...next, group: '' };
      entriesChanged = true;
    }
    if (typeof next.order !== 'number') {
      next = { ...next, order: i };
      entriesChanged = true;
    }
    return next;
  });

  if (booksChanged) persistBooks(books);
  if (entriesChanged) persist(entries);
  return books;
}

/* ------------------------------ 标签 / 搜索 / Prompt ------------------------------ */

// 获取所有标签及计数（跨知识库，用于跨库分类）
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

// 全局搜索（标题 + 正文纯文本 + 标签），可选按标签过滤
export function searchKB(query, tagFilter = null) {
  let entries = getKBEntries();
  if (tagFilter) {
    entries = entries.filter(e => (e.tags || []).includes(tagFilter));
  }
  const q = String(query || '').trim().toLowerCase();
  if (!q) return entries;
  return entries.filter(e => {
    const title = (e.title || '').toLowerCase();
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

// 从云端同步（页面加载时调用）：条目 + 知识库，LWW（按各自最新 updatedAt）
export async function syncKBFromCloud() {
  await Promise.all([syncEntriesFromCloud(), syncBooksFromCloud()]);
}

async function fetchCloud(key) {
  try {
    const res = await fetch(`/api/userSettings/get?k=${encodeURIComponent(key)}`, {
      headers: { 'X-Unlock-Token': localStorage.getItem('pw_unlock_token') || '' },
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.ok && data.data) return data.data[key] || null;
  } catch { /* ignore */ }
  return null;
}

async function syncEntriesFromCloud() {
  const cloudStr = await fetchCloud(KB_CLOUD_KEY);
  if (!cloudStr) return null;
  try {
    const cloudEntries = JSON.parse(cloudStr);
    if (!Array.isArray(cloudEntries)) return null;
    const local = getKBEntries();
    const localMax = local.length ? Math.max(...local.map(e => e.updatedAt || 0)) : 0;
    const cloudMax = cloudEntries.length ? Math.max(...cloudEntries.map(e => e.updatedAt || 0)) : 0;
    if (cloudMax > localMax) {
      localStorage.setItem(KB_LS_KEY, JSON.stringify(cloudEntries));
      return cloudEntries;
    }
  } catch { /* ignore */ }
  return null;
}

async function syncBooksFromCloud() {
  const cloudStr = await fetchCloud(BOOKS_CLOUD_KEY);
  if (!cloudStr) return null;
  try {
    const cloudBooks = JSON.parse(cloudStr);
    if (!Array.isArray(cloudBooks)) return null;
    const local = getRawBooks();
    const localMax = local.length ? Math.max(...local.map(b => b.updatedAt || 0)) : 0;
    const cloudMax = cloudBooks.length ? Math.max(...cloudBooks.map(b => b.updatedAt || 0)) : 0;
    if (cloudMax > localMax) {
      localStorage.setItem(BOOKS_LS_KEY, JSON.stringify(cloudBooks));
      return cloudBooks;
    }
  } catch { /* ignore */ }
  return null;
}