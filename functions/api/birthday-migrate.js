import { lunarLib } from '../lib/lunar.js';

// 一次性迁移：录入生日事项（阳历=yearly, 农历=lunar-yearly）
// 访问 /api/birthday-migrate 触发

const BIRTHDAYS = [
  { title: '🎂溪客生日', solar: { month: 10, day: 9 }, type: 'yearly' },
  { title: '🎂宝贝生日', lunar: { month: 9, day: 10 }, type: 'lunar-yearly' },
  { title: '🎂丈母娘生日', lunar: { month: 9, day: 14 }, type: 'lunar-yearly' },
  { title: '🎂老妈生日', lunar: { month: 9, day: 17 }, type: 'lunar-yearly' },
  { title: '🎂我的生日', lunar: { month: 9, day: 26 }, type: 'lunar-yearly' },
  { title: '🎂三姐生日', lunar: { month: 12, day: 4 }, type: 'lunar-yearly' },
  { title: '🎂大姐生日', lunar: { month: 12, day: 13 }, type: 'lunar-yearly' },
  { title: '🎂拾柒生日', solar: { month: 2, day: 28 }, type: 'yearly' },
  { title: '🎂哥生日', lunar: { month: 2, day: 27 }, type: 'lunar-yearly' },
  { title: '🎂二姐生日', lunar: { month: 3, day: 24 }, type: 'lunar-yearly' },
  { title: '🎂老爸生日', lunar: { month: 5, day: 8 }, type: 'lunar-yearly' },
  { title: '🎂嘉澍生日', solar: { month: 8, day: 11 }, type: 'yearly' },
  { title: '🎂云峰生日', solar: { month: 8, day: 22 }, type: 'yearly' },
];

const DEFAULT_USER_ID = '50f12e1e-d561-423e-a424-d07a21d00cf2';

export async function onRequestGet({ env }) {
  const results = [];

  // 先查已有事项，避免重复
  const existing = await env.DB.prepare(
    `SELECT title FROM ethan_schedules WHERE user_id=? AND repeat_rule IN ('yearly','lunar-yearly')`
  ).bind(DEFAULT_USER_ID).all();

  const existingTitles = new Set((existing.results || []).map(r => r.title));

  for (const bd of BIRTHDAYS) {
    if (existingTitles.has(bd.title)) {
      results.push({ title: bd.title, status: 'skipped', reason: 'already exists' });
      continue;
    }

    // 计算初始日期（2026年的阳历日期）
    let dateStr;
    if (bd.type === 'lunar-yearly') {
      // 农历转阳历：用 lunar 库算 2026 年对应的阳历日期
      const lunar = lunarLib.Lunar.fromYmd(2026, bd.lunar.month, bd.lunar.day);
      const solar = lunar.getSolar();
      dateStr = `${solar.getYear()}-${String(solar.getMonth()).padStart(2,'0')}-${String(solar.getDay()).padStart(2,'0')}`;
    } else {
      dateStr = `2026-${String(bd.solar.month).padStart(2,'0')}-${String(bd.solar.day).padStart(2,'0')}`;
    }

    await env.DB.prepare(
      `INSERT INTO ethan_schedules (user_id, title, date, start_time, end_time, duration_min, is_key, category, is_done, sort_order, repeat_rule)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(
      DEFAULT_USER_ID, bd.title, dateStr,
      null, null, null,
      0, 3, 0, 0, bd.type
    ).run();

    results.push({ title: bd.title, date: dateStr, repeat: bd.type, status: 'created' });
  }

  return new Response(JSON.stringify({
    total: BIRTHDAYS.length,
    created: results.filter(r => r.status === 'created').length,
    skipped: results.filter(r => r.status === 'skipped').length,
    results
  }, null, 2), {
    headers: { 'Content-Type': 'application/json' }
  });
}
