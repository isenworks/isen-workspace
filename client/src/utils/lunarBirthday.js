import lunarLib from '../vendor/lunar.js';

/* ============================================================
 * 农历生日换算（生日列表 / 首页即将到来 / 生日表单共用）
 *
 * 坑：农历腊月、正月的生日会跨公历年。
 *   · 农历 2026 年腊月初四 = 公历 2027-01-11
 *   · 农历 2027 年腊月初四 = 公历 2027-12-31
 * 若直接用「公历年 = 农历年」换算（Lunar.fromYmd(2027, 12, 4)），
 * 2027 页会得到 12-31 而漏掉 01-11 —— 所以必须按公历年反查所有命中日期。
 * ============================================================ */

/* 存储的公历日期 → 农历月日（农历生日存的是录入当年的公历日子） */
export function lunarMonthDayOf(dateStr) {
  const parts = String(dateStr || '').split('-');
  const y = Number(parts[0]), mo = Number(parts[1]), d = Number(parts[2]);
  if (!y || !mo || !d) return null;
  try {
    const lun = lunarLib.Solar.fromYmd(y, mo, d).getLunar();
    return { month: lun.getMonth(), day: lun.getDay() };
  } catch {
    return null;
  }
}

/* 农历月日在某个公历年内实际出现的日期：0 / 1 / 2 次
   （极少数年份一个公历年里同一天会出现两次，属于正常历法现象，两条都要展示） */
export function lunarDatesInYear(month, day, year) {
  const out = [];
  for (const ly of [year - 1, year, year + 1]) {
    try {
      const s = lunarLib.Lunar.fromYmd(ly, month, day).getSolar();
      if (s.getYear() !== year) continue;
      const mo = s.getMonth(), d = s.getDay();
      if (!out.some(x => x.mo === mo && x.day === d)) out.push({ mo, day: d, lunarYear: ly });
    } catch { /* 该农历年没有这一天 */ }
  }
  return out.sort((a, b) => a.mo - b.mo || a.day - b.day);
}

/* 下一次（含今天）农历生日对应的公历 Date；找不到返回 null */
export function nextLunarDate(month, day, from) {
  const y = from.getFullYear();
  const cands = [];
  for (const ly of [y - 1, y, y + 1]) {
    try {
      const s = lunarLib.Lunar.fromYmd(ly, month, day).getSolar();
      const d = new Date(s.getYear(), s.getMonth() - 1, s.getDay());
      d.setHours(0, 0, 0, 0);
      if (d >= from) cands.push(d);
    } catch { /* ignore */ }
  }
  return cands.sort((a, b) => a - b)[0] || null;
}
