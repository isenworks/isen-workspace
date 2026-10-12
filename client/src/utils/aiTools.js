/* ============================================================
 * AI Agent 工具定义与执行器
 *   · aiToolDefinitions：OpenAI tools 格式，供 callLLMStream 传给模型
 *   · executeTool：前端执行工具（调已有工作台 API / 本地数据，不新建后端）
 *   · isWriteTool：判断是否为写操作（写操作需用户确认）
 *   · formatToolResult：把 API 返回格式化为 AI 易读的文本
 * ============================================================ */

import { API } from '../api/client.js';
import { today as getToday, addDaysISO } from './date.js';
import { getKBBooks, getKBEntries, searchKB } from './aiKnowledgeBase.js';

// 相对日期兜底：模型偶尔仍会直接吐「明天」「后天」等自然语言，这里统一换算成 ISO，
// 避免把非法日期丢给后端导致创建失败或建到错误日期。
const RELATIVE_DAYS = {
  '今天': 0, '今日': 0, '明天': 1, '明日': 1, '后天': 2,
  '大后天': 3, '昨天': -1, '昨日': -1, '前天': -2,
};
function resolveDate(input) {
  if (!input || typeof input !== 'string') return getToday();
  const s = input.trim();
  if (s in RELATIVE_DAYS) return addDaysISO(getToday(), RELATIVE_DAYS[s]);
  return s; // 其余交给后端 normalizeDate 校验/规范化
}

// 分类名 → schedule.category（与 categoryMapping BASE_MODULES 对齐：1工作 2能力 3其他 5生活 6精力 7知力 8财务）
const CAT_BY_NAME = {
  '工作': 1, work: 1,
  '能力': 2, '学习': 2, ability: 2, study: 2, learning: 2,
  '其他': 3, other: 3, others: 3,
  '生活': 5, life: 5,
  '精力': 6, energy: 6,
  '知力': 7, cognition: 7,
  '财务': 8, finance: 8,
};
const CAT_LABEL = { 1: '工作', 2: '能力', 3: '其他', 5: '生活', 6: '精力', 7: '知力', 8: '财务' };
function resolveCategory(v) {
  if (v == null) return 1;
  const byName = CAT_BY_NAME[String(v).trim().toLowerCase()];
  if (byName) return byName;
  const n = Number(v);
  return [1, 2, 3, 5, 6, 7, 8].includes(n) ? n : 1;
}

// ===== 本地数据读取（年度规划 / 主题等存 localStorage）=====
function readLS(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function stripHtml(text) {
  if (!text) return '';
  return String(text).replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
}

// 年度规划 · 六大模块速览（工作 OKR / 能力里程碑 / 知力 / 生活）
function annualDigest() {
  const asArr = (v) => (Array.isArray(v) ? v : []);
  const work = asArr(readLS('annual_work'));
  const abilities = asArr(readLS('annual_abilities_v2'));
  const books = asArr(readLS('annual_books_v12'));
  const life = asArr(readLS('annual_life'));
  const cogO = readLS('annual_cog_o') || null;
  const cogKrs = asArr(readLS('annual_cog_krs'));

  return {
    work: work.map(o => ({
      objective: o?.title || o?.label || '',
      mode: o?.mode || '',
      krs: asArr(o?.krs).map(k => ({
        title: k?.t || k?.title || '',
        value: Number(k?.v) || 0,
        target: Number(k?.tgt) || 0,
        rate: Number(k?.tgt) > 0 ? Math.round(((Number(k?.v) || 0) / Number(k.tgt)) * 100) : 0,
      })),
    })),
    abilities: abilities.map(a => ({
      title: a?.title || '',
      milestones: asArr(a?.mstones).map(m => ({ title: m?.lb || m?.title || '', pct: Number(m?.pct) || 0 })),
    })),
    cognition: {
      objective: cogO?.text || '',
      krs: cogKrs.map(k => ({ label: k?.lb || '', value: Number(k?.val) || 0, target: Number(k?.tgt) || 0, unit: k?.u || '' })),
      books: books.map(b => ({
        title: b?.t || b?.title || '',
        status: b?.st || '',
        progress: Number(b?.pct) || 0,
        insights: asArr(b?.insights).length,
        actions: asArr(b?.actions).length,
      })),
    },
    life: life.map(c => ({ category: c?.lb || '', entries: asArr(c?.entries).length })),
  };
}

// 新建事项 + 回读校验（AI 创建统一走 ethan_schedules，与手动「新建事项」同链路，
// 出现在重点事项卡/主页今日/日历/时间线，且天然支持点击编辑、右键删除、勾选完成）
async function createItemAndVerify(data) {
  const res = await API.schedules.create(data);
  const id = res?.id || res?.schedule?.id;
  if (!id) throw new Error('创建接口未返回事项 id，可能未真正写入');
  const check = await API.schedules.get(id);
  if (!check?.schedule) throw new Error(`写入校验失败：事项 #${id} 回读不到，数据可能未落库`);
  if (check.schedule.date !== data.date) {
    throw new Error(`写入校验失败：日期不一致（期望 ${data.date}，实际 ${check.schedule.date}）`);
  }
  return id;
}

// ===== 工具定义（OpenAI function calling 格式）=====
export const aiToolDefinitions = [
  // ── 全局快照（分析「我的数据 / 整体情况」优先用这个）──
  {
    type: 'function',
    function: {
      name: 'get_workspace_overview',
      description: '一次性获取工作台全局数据快照：今日日程、习惯打卡统计（含名称/打卡率/连续天数）、固定日程、近期每日总结、收集箱、财务概览、年度规划（工作/能力/知力/生活）、知识库概况。用户问「分析我的数据」「整体情况」「最近怎么样」时优先调用这个',
      parameters: { type: 'object', properties: {} },
    },
  },
  // ── 读数据工具 ──
  {
    type: 'function',
    function: {
      name: 'get_today_schedules',
      description: '获取指定日期（默认今天）的日程列表，包括标题、时间、是否完成、分类',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: '要查询的日期 YYYY-MM-DD，默认今天' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_schedules_range',
      description: '获取指定日期区间的所有事项/日程（含重点事项、待办、已完成、分类）。分析某段时间的安排与任务完成情况时用这个',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', description: '开始日期 YYYY-MM-DD' },
          to: { type: 'string', description: '结束日期 YYYY-MM-DD' },
        },
        required: ['from', 'to'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_fixed_schedules',
      description: '获取所有固定日程（每天固定重复的作息安排，如起床、通勤、健身时段），含时间区间',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_habits_stats',
      description: '获取每个习惯的打卡统计（含习惯名称、打卡天数、完成率、连续天数、今日是否打卡）。分析习惯打卡完成情况时用这个',
      parameters: {
        type: 'object',
        properties: {
          days: { type: 'number', description: '统计最近几天的打卡，默认7天（本周）' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_habits_list',
      description: '获取所有习惯列表，含名称、目标频次、分类',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_inbox_list',
      description: '获取小记列表（收集箱里未分派的记录），含内容、标签',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_summaries_range',
      description: '获取每日总结记录，支持查指定日期范围',
      parameters: {
        type: 'object',
        properties: {
          days: { type: 'number', description: '查询最近几天的总结，默认7天' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_finance_overview',
      description: '获取财务概览：净资产、指定月份的收支统计、账户余额、攒钱目标进度',
      parameters: {
        type: 'object',
        properties: {
          month: { type: 'string', description: '月份 YYYY-MM，默认当月' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_annual_plan',
      description: '获取年度规划的六大模块数据：工作 OKR、能力里程碑、知力（阅读/思考/行动/改变）、生活体验记录等',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_knowledge_docs',
      description: '获取知识库（书架）的文档清单：知识库名、章节、文档标题与标签，可选关键词过滤',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '按关键词过滤文档，可选' },
        },
      },
    },
  },
  // ── 写数据工具（需用户确认后执行）──
  {
    type: 'function',
    function: {
      name: 'create_schedule',
      description: '新建一条事项到工作台（日程/待办统一入口，与手动「新建事项」效果一致：出现在重点事项卡、主页今日、日历和时间线，且可点击编辑/右键删除）。有明确时间传 start_time/end_time；纯待办（无明确时间）就不要传时间字段。date 用 YYYY-MM-DD（明天/后天需按当前日期换算），默认今天。创建前先向用户确认',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '事项标题' },
          date: { type: 'string', description: '日期，格式 YYYY-MM-DD，默认今天' },
          start_time: { type: 'string', description: '开始时间，格式 HH:MM，可选；无明确时间不要传' },
          end_time: { type: 'string', description: '结束时间，格式 HH:MM，可选' },
          category: { type: 'string', description: '分类：工作/能力/学习/生活/精力/知力/财务/其他，默认工作' },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_inbox',
      description: '创建一条小记到收集箱。创建前先向用户确认',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: '小记内容' },
          tag: { type: 'string', description: '标签名称，可选' },
        },
        required: ['content'],
      },
    },
  },
];

// 写操作工具集合（需用户确认）
const WRITE_TOOLS = new Set(['create_schedule', 'create_inbox']);
export function isWriteTool(name) {
  return WRITE_TOOLS.has(name);
}

// ===== 工具执行器（前端调已有 API / 本地数据）=====
export async function executeTool(name, args = {}) {
  switch (name) {
    // ── 全局快照 ──
    case 'get_workspace_overview': {
      const today = getToday();
      const from30 = addDaysISO(today, -29);
      const from7 = addDaysISO(today, -6);
      const out = { today, warnings: [] };
      const attempt = async (label, fn) => {
        try { return await fn(); } catch (e) { out.warnings.push(`${label}获取失败：${e.message}`); return null; }
      };

      const habitsRes = await attempt('习惯', () => API.habits.list({ date: today }));
      const statsRes = await attempt('习惯统计', () => API.habits.stats(from30, today));
      const statsMap = new Map(((statsRes?.stats) || []).map(s => [s.habit_id, s]));
      if (habitsRes) {
        out.habits = (habitsRes.habits || []).map(h => ({
          name: h.name,
          doneToday: h.done_today === true,
          streakDays: h.streak || 0,
          last30Days: { doneDays: statsMap.get(h.id)?.done_days || 0, loggedDays: statsMap.get(h.id)?.total_days || 0 },
        }));
      }

      const todaySch = await attempt('今日日程', () => API.schedules.list({ from: today, to: today }));
      if (todaySch) {
        out.todaySchedules = (todaySch.schedules || []).map(s => ({
          title: s.title,
          time: s.start_time ? `${s.start_time}${s.end_time ? '-' + s.end_time : ''}` : '全天',
          done: !!s.is_done,
          category: CAT_LABEL[s.category] || s.category || '',
        }));
      }

      const fixedRes = await attempt('固定日程', () => API.fixedSchedules.list());
      if (fixedRes) {
        out.fixedSchedules = (fixedRes.fixedSchedules || []).map(f => ({
          name: f.name,
          time: f.start_time ? `${f.start_time}${f.end_time ? '-' + f.end_time : ''}` : '',
        }));
      }

      const sumRes = await attempt('每日总结', () => API.summaries.range(from7, today));
      if (sumRes) {
        out.recentSummaries = (sumRes.summaries || []).map(s => ({ date: s.date, excerpt: stripHtml(s.content).slice(0, 120) }));
      }

      const inboxRes = await attempt('收集箱', () => API.inbox.list());
      if (inboxRes) out.inboxCount = (inboxRes.items || []).length;

      const finRes = await attempt('财务', () => API.finance.bootstrap());
      if (finRes) {
        out.finance = {
          month: finRes.month,
          netWorth: finRes.netWorth,
          monthStats: finRes.monthStats,
          goals: (finRes.goals || []).map(g => ({ name: g.name, current: g.current_amount, target: g.target_amount })),
        };
      }

      out.annualPlan = annualDigest();
      const kbBooks = getKBBooks();
      out.knowledgeBase = { books: kbBooks.map(b => b.name), docCount: getKBEntries().length };
      return out;
    }

    // ── 读数据 ──
    case 'get_today_schedules': {
      const day = resolveDate(args.date);
      const res = await API.schedules.list({ from: day, to: day });
      const items = (res?.schedules || res?.items || []).map(s => ({
        title: s.title,
        time: s.start_time ? `${s.start_time}${s.end_time ? '-' + s.end_time : ''}` : '全天',
        done: !!s.is_done,
        category: CAT_LABEL[s.category] || s.category || '',
      }));
      return { date: day, count: items.length, schedules: items };
    }
    case 'get_schedules_range': {
      const from = resolveDate(args.from);
      const to = resolveDate(args.to);
      const res = await API.schedules.list({ from, to });
      const items = (res?.schedules || res?.items || []).map(s => ({
        date: s.date,
        title: s.title,
        time: s.start_time ? `${s.start_time}${s.end_time ? '-' + s.end_time : ''}` : '全天',
        done: !!s.is_done,
        category: CAT_LABEL[s.category] || s.category || '',
      }));
      return { from, to, count: items.length, doneCount: items.filter(i => i.done).length, items };
    }
    case 'get_fixed_schedules': {
      const res = await API.fixedSchedules.list();
      const items = (res?.fixedSchedules || []).map(f => ({
        name: f.name,
        time: f.start_time ? `${f.start_time}${f.end_time ? '-' + f.end_time : ''}` : '',
      }));
      return { count: items.length, items };
    }
    case 'get_habits_stats': {
      const days = Math.max(1, Math.min(90, args.days || 7));
      const to = getToday();
      const from = addDaysISO(to, -(days - 1));
      const [listRes, statsRes] = await Promise.all([
        API.habits.list({ date: to }).catch(() => null),
        API.habits.stats(from, to),
      ]);
      const statsMap = new Map(((statsRes?.stats) || []).map(s => [s.habit_id, s]));
      const rows = (listRes?.habits || []).length
        ? listRes.habits.map(h => {
            const st = statsMap.get(h.id) || { done_days: 0, total_days: 0 };
            const doneDays = st.done_days || 0;
            return {
              name: h.name || `习惯#${h.id}`,
              doneToday: h.done_today === true,
              streak: h.streak || 0,
              doneDays,
              loggedDays: st.total_days || 0,
              rate: Math.round((doneDays / days) * 100),
            };
          })
        : ((statsRes?.stats) || []).map(s => ({
            name: `习惯#${s.habit_id}`,
            doneToday: false,
            streak: 0,
            doneDays: s.done_days || 0,
            loggedDays: s.total_days || 0,
            rate: Math.round(((s.done_days || 0) / days) * 100),
          }));
      return { range: `${from} ~ ${to}`, days, count: rows.length, habits: rows };
    }
    case 'get_habits_list': {
      const res = await API.habits.list();
      const items = (res?.habits || []).map(h => ({
        name: h.name,
        frequency: h.frequency || h.target_days || '',
        category: h.category || '',
      }));
      return { count: items.length, habits: items };
    }
    case 'get_inbox_list': {
      const res = await API.inbox.list();
      const items = (res?.items || res?.notes || []).map(n => ({
        content: stripHtml(n.content).slice(0, 100),
        tag: n.tag_name || n.tag || '',
      }));
      return { count: items.length, items };
    }
    case 'get_summaries_range': {
      const days = Math.max(1, Math.min(90, args.days || 7));
      const to = getToday();
      const from = addDaysISO(to, -(days - 1));
      const res = await API.summaries.range(from, to);
      const items = (res?.summaries || []).map(s => ({
        date: s.date,
        content: stripHtml(s.content).slice(0, 200),
      }));
      return { range: `${from} ~ ${to}`, count: items.length, summaries: items };
    }
    case 'get_finance_overview': {
      const month = typeof args.month === 'string' && /^\d{4}-\d{2}$/.test(args.month.trim()) ? args.month.trim() : undefined;
      const res = await API.finance.bootstrap(month);
      return {
        month: res?.month,
        netWorth: res?.netWorth,
        monthStats: res?.monthStats,
        prevStats: res?.prevStats,
        accounts: (res?.accounts || []).map(a => ({ name: a.name, type: a.type, balance: a.balance })),
        goals: (res?.goals || []).map(g => ({ name: g.name, current: g.current_amount, target: g.target_amount, status: g.status })),
      };
    }
    case 'get_annual_plan': {
      return annualDigest();
    }
    case 'get_knowledge_docs': {
      const q = String(args.query || '').trim();
      const entries = searchKB(q);
      const books = getKBBooks();
      const nameOf = new Map(books.map(b => [b.id, b.name]));
      const items = entries.slice(0, 100).map(e => ({
        kb: nameOf.get(e.kbId) || '默认知识库',
        group: e.group || '未分组',
        title: e.title,
        tags: e.tags || [],
        excerpt: stripHtml(e.content).slice(0, 80),
      }));
      return { count: items.length, books: books.map(b => b.name), items };
    }
    // ── 写数据（写入后回读校验，杜绝「假成功」：接口 200 但未真正落库）──
    case 'create_schedule': {
      const data = {
        title: args.title,
        date: resolveDate(args.date),
        start_time: args.start_time || null,
        end_time: args.end_time || null,
        category: resolveCategory(args.category),
      };
      const id = await createItemAndVerify(data);
      return { success: true, id, title: data.title, date: data.date, start_time: data.start_time, end_time: data.end_time, category: data.category };
    }
    case 'create_inbox': {
      const data = { content: args.content };
      if (args.tag) data.tag_name = args.tag;
      const res = await API.inbox.create(data);
      const id = res?.id || res?.item?.id;
      if (!id) throw new Error('创建接口未返回小记 id，可能未真正写入');
      return { success: true, id, content: args.content, tag: args.tag || '' };
    }
    default:
      return { error: `未知工具: ${name}` };
  }
}

// ===== 格式化工具结果为 AI 易读的文本 =====
export function formatToolResult(name, result) {
  if (!result) return '无数据';
  if (result.error) return `错误: ${result.error}`;
  switch (name) {
    case 'get_workspace_overview': {
      const lines = [`工作台全局数据快照（今天 ${result.today}）：`];
      if (result.habits) {
        lines.push(result.habits.length
          ? `\n【习惯打卡 · 近30天】\n` + result.habits.map(h =>
              `- ${h.name}：近30天打卡 ${h.last30Days.doneDays} 天，连续 ${h.streakDays} 天，今日${h.doneToday ? '已' : '未'}打卡`).join('\n')
          : '\n【习惯打卡】暂无习惯');
      }
      if (result.todaySchedules) {
        lines.push(result.todaySchedules.length
          ? `\n【今日日程】\n` + result.todaySchedules.map(s => `- ${s.time} ${s.title}${s.done ? '（已完成）' : ''} [${s.category}]`).join('\n')
          : '\n【今日日程】今日无安排');
      }
      if (result.fixedSchedules) {
        lines.push(result.fixedSchedules.length
          ? `\n【固定日程】\n` + result.fixedSchedules.map(f => `- ${f.time} ${f.name}`).join('\n')
          : '\n【固定日程】无');
      }
      if (result.recentSummaries) {
        lines.push(result.recentSummaries.length
          ? `\n【近7天每日总结】\n` + result.recentSummaries.map(s => `- ${s.date}: ${s.excerpt}`).join('\n')
          : '\n【近7天每日总结】无记录');
      }
      if (result.inboxCount != null) lines.push(`\n【收集箱】${result.inboxCount} 条待分派小记`);
      if (result.finance) lines.push(`\n【财务】\n${JSON.stringify(result.finance)}`);
      if (result.annualPlan) lines.push(`\n【年度规划】\n${JSON.stringify(result.annualPlan)}`);
      if (result.knowledgeBase) lines.push(`\n【知识库】${result.knowledgeBase.docCount} 篇文档，知识库：${result.knowledgeBase.books.join('、') || '无'}`);
      if (result.warnings?.length) lines.push(`\n（部分数据获取异常：${result.warnings.join('；')}）`);
      return lines.join('');
    }
    case 'get_today_schedules':
      return `今日（${result.date}）共 ${result.count} 条日程：` +
        result.schedules.map(s => `\n- ${s.time} ${s.title}${s.done ? '（已完成）' : ''} [${s.category}]`).join('');
    case 'get_schedules_range':
      return `${result.from} ~ ${result.to} 共 ${result.count} 条事项（已完成 ${result.doneCount} 条）：` +
        result.items.map(s => `\n- ${s.date} ${s.time} ${s.title}${s.done ? '（已完成）' : ''} [${s.category}]`).join('');
    case 'get_fixed_schedules':
      return result.count === 0 ? '暂无固定日程' :
        `共 ${result.count} 条固定日程：` + result.items.map(f => `\n- ${f.time} ${f.name}`).join('');
    case 'get_habits_stats': {
      if (!result.count) return `习惯打卡统计（${result.range}）：暂无习惯（可能尚未创建习惯）`;
      return `习惯打卡统计（最近 ${result.days} 天，${result.range}）：\n` + result.habits.map(h =>
        `- ${h.name}：打卡 ${h.doneDays} 天，完成率 ${h.rate}%，连续 ${h.streak} 天，今日${h.doneToday ? '已打卡' : '未打卡'}`
      ).join('\n');
    }
    case 'get_habits_list':
      return `共 ${result.count} 个习惯：` +
        result.habits.map(h => `\n- ${h.name}（频次:${h.frequency}，分类:${h.category}）`).join('');
    case 'get_inbox_list':
      return `收集箱共 ${result.count} 条小记：` +
        result.items.map(n => `\n- ${n.content}${n.tag ? ' [标签:' + n.tag + ']' : ''}`).join('');
    case 'get_summaries_range':
      return `每日总结（${result.range}）共 ${result.count} 条：` +
        result.summaries.map(s => `\n- ${s.date}: ${s.content}`).join('');
    case 'get_finance_overview':
      return `财务概览（${result.month}）：\n${JSON.stringify({
        netWorth: result.netWorth, monthStats: result.monthStats, prevStats: result.prevStats,
        accounts: result.accounts, goals: result.goals,
      })}`;
    case 'get_annual_plan':
      return `年度规划数据：\n${JSON.stringify(result)}`;
    case 'get_knowledge_docs':
      return `知识库共 ${result.count} 篇文档（知识库：${result.books.join('、') || '无'}）：` +
        result.items.map(d => `\n- [${d.kb} / ${d.group}] ${d.title}${d.tags.length ? '（标签:' + d.tags.join('、') + '）' : ''}${d.excerpt ? ' — ' + d.excerpt : ''}`).join('');
    case 'create_schedule': {
      const time = result.start_time
        ? ` ${result.start_time}${result.end_time ? '-' + result.end_time : ''}`
        : '（无时间 · 待办型，进「未定时事项」）';
      return `已新建事项「${result.title}」→ ${result.date}${time}，分类${CAT_LABEL[result.category] || result.category}（#${result.id}，已回读校验落库；重点事项卡、主页今日、日历、时间线均可见，可点击编辑）`;
    }
    case 'create_inbox':
      return `已创建小记「${result.content}」${result.tag ? '，标签' + result.tag : ''}（#${result.id}）`;
    default:
      return JSON.stringify(result);
  }
}

// 工具友好显示名（用于对话区步骤条）
export const toolDisplayNames = {
  get_workspace_overview: '读取工作台数据',
  get_today_schedules: '查询今日日程',
  get_schedules_range: '查询日程区间',
  get_fixed_schedules: '查询固定日程',
  get_habits_stats: '查询习惯统计',
  get_habits_list: '查询习惯列表',
  get_inbox_list: '查询小记列表',
  get_summaries_range: '查询每日总结',
  get_finance_overview: '查询财务概览',
  get_annual_plan: '查询年度规划',
  get_knowledge_docs: '查询知识库',
  create_schedule: '新建事项',
  create_inbox: '创建小记',
};