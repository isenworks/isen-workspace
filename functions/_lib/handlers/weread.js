// ============================================================
// /api/weread/* 处理器：微信读书 Skills 官方 API 网关
//   官方统一网关：POST https://i.weread.qq.com/api/agent/gateway
//     Header: Authorization: Bearer wrk-xxx
//     Body:   { "api_name": "/shelf/sync", "skill_version": "1.0.3", ... }
//   参考 weread.qq.com/r/weread-skills（官方 Skill 文档）
// ============================================================
import { json, settingGet } from '../core.js';

const GATEWAY = 'https://i.weread.qq.com/api/agent/gateway';
const SKILL_VER = '1.0.3';

// 通用调用 Weread Skills 网关
async function callWeread(key, apiName, extra = {}) {
  const body = { api_name: apiName, skill_version: SKILL_VER, ...extra };
  const r = await fetch(GATEWAY, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + key,
      'Content-Type': 'application/json',
      'User-Agent': 'Ethan-Workbench/1.0',
      'Accept': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await r.text().catch(() => '');
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { _raw: text }; }
  if (!r.ok) {
    const msg = (data && (data.message || data.statusMessage || data.error)) || text || `HTTP ${r.status}`;
    throw new Error(`${r.status}: ${JSON.stringify(msg).slice(0, 200)}`);
  }
  return data;
}

const isHashBookId = (v) => typeof v === 'string' && /^[a-z0-9]{20,}$/i.test(v.replace(/-/g, ''));
const extractHashFromDeepLink = (deepLink) => {
  if (!deepLink || typeof deepLink !== 'string') return '';
  const m = deepLink.match(/v=([a-z0-9]+)/);
  return m ? m[1] : '';
};

// weread.sync：拉书架 + 对每本书补 /book/info 详情
export async function handleWereadSync(env, q) {
  const key = await settingGet(env, 'weread_api_key');
  if (!key) return json({ error: '未配置 Weread Skills API Key。请到书架右上角「设置」填入 wrk- 开头的 key。' }, 400);

  let shelfResp = null;
  let lastErr = null;
  // Weread 官方 skill 有两个常见书架接口名，按顺序尝试
  for (const name of ['/shelf/sync', '/shelf/list']) {
    try {
      shelfResp = await callWeread(key, name);
      if (shelfResp && (Array.isArray(shelfResp.books) || Array.isArray(shelfResp.data?.books) || Array.isArray(shelfResp.data))) break;
    } catch (e) { lastErr = e.message; shelfResp = null; }
  }
  if (!shelfResp) {
    return json({ error: '微信读书书架接口未返回有效数据，最后错误：' + (lastErr || 'unknown') }, 502);
  }

  // 归一化 books[]
  const raw = shelfResp.books || shelfResp.data?.books || shelfResp.data || [];
  const bookList = (Array.isArray(raw) ? raw : []).slice(0, 500);

  // 对每本书调用 /book/info 补封面 + 作者 + 详情（batch 5 本并行）
  const books = bookList.map(x => {
    const rawId = x.bookId || x.book_id || x.id || x.bookid || '';
    const hashFromDeepLink = extractHashFromDeepLink(x.deepLink);
    const bookId = isHashBookId(hashFromDeepLink) ? hashFromDeepLink : (isHashBookId(rawId) ? rawId : '');
    const numericId = !bookId && /^\d+$/.test(String(rawId)) ? String(rawId) : '';
    return {
      title: String(x.title || x.bookTitle || x.name || '').trim(),
      author: String(x.author || x.bookAuthor || x.authors || (Array.isArray(x.authors) ? x.authors.join('/') : '') || '').trim(),
      cover: x.cover || x.coverUrl || x.cover_img || x.coverImg || '',
      bookId,
      numericId,
      status: x.readStatus ?? x.read_status ?? x.status ?? (x.finishedReading || x.finished ? 4 : x.reading || x.isReading ? 3 : 1),
      progress: Number(x.readingProgress ?? x.progress ?? x.pct ?? x.reading_progress ?? 0),
      startDate: x.startDate || x.start_read_date || x.startTime || '',
      endDate: x.endDate || x.finish_date || x.endTime || x.finishDate || '',
    };
  }).filter(b => b.title);

  // 对缺封面/作者/bookId的，再查一次详情
  const BATCH = 5;
  for (let i = 0; i < books.length; i += BATCH) {
    const slice = books.slice(i, i + BATCH);
    await Promise.all(slice.map(async (b) => {
      const needInfo = !b.cover || !b.author || !b.bookId;
      if (!needInfo) return;
      try {
        const params = {};
        if (b.bookId) params.bookId = b.bookId;
        else if (b.numericId) params.id = b.numericId;
        else params.title = b.title;
        const info = await callWeread(key, '/book/info', params);
        const d = info?.data || info || {};
        if (!b.cover && (d.cover || d.coverUrl)) b.cover = d.cover || d.coverUrl;
        if (!b.author && d.author) b.author = d.author;
        if (!b.author && d.authors) b.author = Array.isArray(d.authors) ? d.authors.join('/') : String(d.authors);
        // 优先从 deepLink 提取哈希 ID
        const hashFromDeepLink = extractHashFromDeepLink(d.deepLink);
        if (hashFromDeepLink && isHashBookId(hashFromDeepLink)) {
          b.bookId = hashFromDeepLink;
        } else {
          const newBookId = d.bookId || d.book_id || '';
          if (newBookId && isHashBookId(newBookId)) b.bookId = newBookId;
        }
        if (d.title && !b.title) b.title = d.title;
      } catch (_) { /* 忽略单本失败，继续 */ }
    }));
  }

  return json({ ok: true, books, total: books.length, rawDebug: (q.debug === '1') ? shelfResp : undefined });
}

// weread.search：按书名搜索微信读书，返回 bookId + reader URL
export async function handleWereadSearch(env, q) {
  const key = await settingGet(env, 'weread_api_key');
  if (!key) return json({ error: '未配置 Weread Skills API Key' }, 400);

  const query = String(q.q || '').trim();
  if (!query) return json({ error: '缺少书名 q' }, 400);

  try {
    const data = await callWeread(key, '/store/search', { keyword: query, scope: 10, count: 5 });

    // Parse: results[].books[].bookInfo -> extract hashId from deepLink
    const isHashId = (v) => typeof v === 'string' && /^[a-z0-9]{20,}$/i.test(v.replace(/-/g, ''));
    const results = [];
    const resultGroups = data?.results || [];
    for (const group of resultGroups) {
      const books = group?.books || [];
      for (const item of books) {
        const info = item?.bookInfo || {};
        const deepLink = info.deepLink || '';
        const hashMatch = deepLink.match(/v=([a-z0-9]+)/);
        const hashId = hashMatch ? hashMatch[1] : '';
        if (!hashId || !isHashId(hashId)) continue;
        results.push({
          title: String(info.title || '').trim(),
          author: String(info.author || '').trim(),
          bookId: hashId,
          cover: info.cover || '',
          rating: info.newRating ? String(info.newRating) : '',
        });
      }
    }
    return json({ ok: true, results, total: results.length });
  } catch (e) {
    return json({ error: e.message || '搜索失败' }, 502);
  }
}
