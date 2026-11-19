// ============================================================
// /api/linkmeta —— 抓取网页标题（浏览器受 CORS 限制，只能服务端代取）
//   用途：小记里粘贴链接后自动把裸 URL 换成页面标题
//   防护：仅 http/https；拒绝内网/环回地址；8 秒超时；正文最多读 256KB
// ============================================================
import { json } from '../core.js';

const PRIVATE_HOST = /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|::1|\[::1\])/i;
const MAX_BYTES = 256 * 1024;

function decodeEntities(s) {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickTitle(html) {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
  const tw = html.match(/<meta[^>]+name=["']twitter:title["'][^>]*content=["']([^"']+)["']/i);
  const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const raw = (og && og[1]) || (tw && tw[1]) || (t && t[1]) || '';
  return decodeEntities(raw).slice(0, 120);
}

export async function handleLinkMeta(env, q, body) {
  const input = String((body && body.url) || q?.url || '').trim();
  if (!input) return json({ error: '缺少 url' }, 400);

  let url;
  try {
    url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    return json({ error: '链接格式不正确' }, 400);
  }
  if (!/^https?:$/.test(url.protocol)) return json({ error: '仅支持 http/https 链接' }, 400);
  if (PRIVATE_HOST.test(url.hostname)) return json({ error: '不支持该地址' }, 400);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url.toString(), {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
      cf: { cacheTtl: 86400, cacheEverything: true },
    });
    if (!res.ok) return json({ error: `目标站点返回 ${res.status}` }, 502);

    const ct = String(res.headers.get('content-type') || '');
    if (ct && !/text\/html|application\/xhtml/i.test(ct)) return json({ error: '目标不是网页' }, 415);

    let received = 0;
    const chunks = [];
    const reader = res.body?.getReader?.();
    if (reader) {
      while (received < MAX_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.byteLength;
      }
      try { await reader.cancel(); } catch { /* 提前截断，忽略 */ }
    }
    const buf = new Uint8Array(received);
    let off = 0;
    for (const c of chunks) { buf.set(c, off); off += c.byteLength; }

    const html = new TextDecoder('utf-8').decode(buf);
    const title = pickTitle(html);
    if (!title) return json({ error: '未能解析到标题' }, 404);
    return json({ ok: true, title, url: res.url || url.toString() });
  } catch (e) {
    const msg = /abort/i.test(String(e?.message)) ? '抓取超时' : '抓取失败';
    return json({ error: msg }, 502);
  } finally {
    clearTimeout(timer);
  }
}
