// ============================================================
// /api/cover/* 处理器：封面兜底搜索（weread → 豆瓣 → Google Books）+ 图片防盗链同源代理
// ============================================================
import { json, settingGet } from '../core.js';

// cover.search：weread 优先 → 豆瓣 → Google Books 兜底
export async function handleCoverSearch(env, q) {
  const query = String(q.q || '').trim();
  const author = String(q.author || '').trim();
  if (!query) return json({ error: '缺少 q' }, 400);

  // 0) weread 搜索（如果已配置 weread key，优先使用）
  const wereadKey = await settingGet(env, 'weread_api_key');
  if (wereadKey) {
    try {
      const GATEWAY = 'https://i.weread.qq.com/api/agent/gateway';
      const resp = await fetch(GATEWAY, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + wereadKey,
          'Content-Type': 'application/json',
          'User-Agent': 'Ethan-Workbench/1.0',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ api_name: '/store/search', skill_version: '1.0.3', keyword: query, scope: 10, count: 3 }),
      });
      if (resp.ok) {
        const data = await resp.json().catch(() => null);
        // Parse: results[].books[].bookInfo
        const resultGroups = data?.results || [];
        const items = [];
        for (const group of resultGroups) {
          const books = group?.books || [];
          for (const item of books) {
            const info = item?.bookInfo || {};
            if (info.cover) {
              items.push({
                title: info.title || '',
                author: info.author || '',
                cover: info.cover,
              });
            }
          }
        }
        if (items.length > 0) {
          let pick = null;
          if (author) {
            pick = items.find(x =>
              String(x.title || '').includes(query.slice(0, 2)) &&
              String(x.author || '').includes(author.slice(0, 2))
            );
          }
          if (!pick) pick = items.find(x => String(x.title || '').includes(query.slice(0, 2)));
          if (!pick) pick = items[0];
          if (pick && pick.cover) {
            const proxied = '/api/cover/proxy?url=' + encodeURIComponent(String(pick.cover));
            return json({ ok: true, coverUrl: proxied, source: 'weread', title: pick.title, author: pick.author });
          }
        }
      }
    } catch (_) { /* ignore, fallthrough to Douban */ }
  }

  // 1) 豆瓣建议搜索（中文书首选）
  try {
    const s = encodeURIComponent(query + (author ? ' ' + author : ''));
    const douban = await fetch(`https://book.douban.com/j/subject_suggest?q=${s}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Referer': 'https://book.douban.com/',
      }
    });
    if (douban.ok) {
      const arr = (await douban.json().catch(() => [])) || [];
      let pick = null;
      if (author) {
        pick = arr.find(x => String(x.title || '').includes(query) && String(x.author || '').includes(author));
      }
      if (!pick) pick = arr.find(x => String(x.title || '').includes(query));
      if (!pick) pick = arr[0];
      if (pick && pick.img) {
        // 豆瓣有防盗链，前端必须走同源代理
        const proxied = '/api/cover/proxy?url=' + encodeURIComponent(String(pick.img));
        return json({ ok: true, coverUrl: proxied, source: 'douban', title: pick.title, author: pick.author });
      }
    }
  } catch (e) {
    // ignore, fallthrough
  }

  // 2) Google Books fallback（英文书/漏网译著）
  try {
    const s = encodeURIComponent(`intitle:${query}${author ? ' inauthor:' + author : ''}`);
    const gbUrl = `https://www.googleapis.com/books/v1/volumes?q=${s}&country=CN&maxResults=3&printType=books&fields=items(volumeInfo(imageLinks/thumbnail,title,authors))`;
    const r = await fetch(gbUrl);
    if (r.ok) {
      const d = await r.json().catch(() => ({}));
      const it = (d.items || []).find(x => x?.volumeInfo?.imageLinks?.thumbnail);
      if (it) {
        let u = it.volumeInfo.imageLinks.thumbnail;
        // Google 默认 zoom=1 缩略，升到 zoom=2
        u = u.replace(/&zoom=\d+/, '&zoom=2').replace(/(http:\/\/|^\/\/)/, 'https://');
        return json({ ok: true, coverUrl: u, source: 'google', title: it.volumeInfo.title, author: (it.volumeInfo.authors || []).join('/') });
      }
    }
  } catch (e) { /* ignore */ }

  return json({ ok: false, error: '豆瓣 & Google Books 均未匹配到封面；可手动粘贴图片链接' });
}

// cover.proxy：豆瓣/杂项图片防盗链同源代理
export function handleCoverProxy(env, url) {
  if (!url || typeof url !== 'string') return new Response('missing url', { status: 400 });
  let safeUrl = url;
  // 协议归一
  if (safeUrl.startsWith('//')) safeUrl = 'https:' + safeUrl;
  if (!/^https?:\/\//i.test(safeUrl)) return new Response('bad url', { status: 400 });

  // 允许的域名白名单（防止 SSRF）
  const u = new URL(safeUrl);
  const ALLOWED = /(doubanio\.com|douban\.com|weread\.qq\.com|qq\.com|google\.com|googleapis\.com|googleusercontent\.com|books\.google\.com|books\.googleapis\.com|res\.weread\.qq\.com|img[0-9]+\.doubanio\.com|myqcloud\.com|wfqqreader-10000000\.image\.myqcloud\.com|cos\.ap-beijing\.myqcloud\.com|tencent-cloud\.com|qpic\.cn)$/i;
  if (!ALLOWED.test(u.hostname)) return new Response('domain not allowed', { status: 403 });

  // 智能 Referer 伪装（async 函数返回 Promise<Response>，与 json() 一致）
  return (async () => {
    try {
      let referer = u.origin + '/';
      let ua = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36';
      if (/douban/.test(u.hostname)) {
        referer = 'https://book.douban.com/';
      } else if (/weread|myqcloud|qq\.com/.test(u.hostname)) {
        referer = 'https://weread.qq.com/';
        ua = 'WeRead/1.0 (Linux;Android) Mozilla/5.0 Chrome/120 Safari/537.36';
      }
      const r = await fetch(safeUrl, {
        headers: {
          'User-Agent': ua,
          'Referer': referer,
          'Origin': referer.replace(/\/$/, ''),
          'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9',
        },
        cf: { cacheTtl: 60 * 60 * 24 * 14, cacheEverything: true },
      });
      const ct = r.headers.get('content-type') || 'image/jpeg';
      const buf = await r.arrayBuffer();
      return new Response(buf, {
        status: r.status,
        headers: {
          'Content-Type': ct,
          'Content-Length': String(buf.byteLength),
          'Cache-Control': 'public, max-age=1209600, stale-while-revalidate=86400',
          'Access-Control-Allow-Origin': '*',
        },
      });
    } catch (e) {
      return new Response('proxy error: ' + e.message, { status: 502 });
    }
  })();
}
