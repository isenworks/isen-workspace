/* ============================================================
 * AI Agent 工具定义与执行器
 *   · aiToolDefinitions：OpenAI tools 格式，供 callLLMStream 传给模型
 *   · executeTool：前端执行工具（调已有工作台 API，不新建后端）
 *   · isWriteTool：判断是否为写操作（写操作需用户确认）
 *   · formatToolResult：把 API 返回格式化为 AI 易读的文本
 * ============================================================ */

import { API } from '../api/client.js';
import { today as getToday, toISODate, addDaysISO } from './date.js';

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
      name: 'get_habits_stats',
      description: '获取习惯打卡统计，支持查指定日期范围。返回每个习惯的打卡率、连续天数',
      parameters: {
        type: 'object',
        properties: {
          days: { type: 'number', description: '查询最近几天的统计，默认7天（本周）' },
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

// ===== 工具执行器（前端调已有 API）=====
export async function executeTool(name, args = {}) {
  switch (name) {
    // ── 读数据 ──
    case 'get_today_schedules': {
      const day = resolveDate(args.date);
      const res = await API.schedules.list({ from: day, to: day });
      const items = (res?.schedules || res?.items || []).map(s => ({
        title: s.title,
        time: s.start_time ? `${s.start_time}${s.end_time ? '-' + s.end_time : ''}` : '全天',
        done: !!s.is_done,
        category: s.category || '',
      }));
      return { date: day, count: items.length, schedules: items };
    }
    case 'get_habits_stats': {
      const days = Math.max(1, Math.min(90, args.days || 7));
      const to = getToday();
      const from = addDaysISO(to, -(days - 1));
      const res = await API.habits.stats(from, to);
      return { range: `${from} ~ ${to}`, stats: res?.stats || res || [] };
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
        content: (n.content || '').replace(/<[^>]+>/g, '').slice(0, 100),
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
        content: (s.content || '').replace(/<[^>]+>/g, '').slice(0, 200),
      }));
      return { range: `${from} ~ ${to}`, count: items.length, summaries: items };
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
    case 'get_today_schedules':
      return `今日（${result.date}）共 ${result.count} 条日程：` +
        result.schedules.map(s => `\n- ${s.time} ${s.title}${s.done ? '（已完成）' : ''} [${s.category}]`).join('');
    case 'get_habits_stats':
      return `习惯打卡统计（${result.range}）：\n` + JSON.stringify(result.stats, null, 2);
    case 'get_habits_list':
      return `共 ${result.count} 个习惯：` +
        result.habits.map(h => `\n- ${h.name}（频次:${h.frequency}，分类:${h.category}）`).join('');
    case 'get_inbox_list':
      return `收集箱共 ${result.count} 条小记：` +
        result.items.map(n => `\n- ${n.content}${n.tag ? ' [标签:' + n.tag + ']' : ''}`).join('');
    case 'get_summaries_range':
      return `每日总结（${result.range}）共 ${result.count} 条：` +
        result.summaries.map(s => `\n- ${s.date}: ${s.content}`).join('');
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
  get_today_schedules: '查询今日日程',
  get_habits_stats: '查询习惯统计',
  get_habits_list: '查询习惯列表',
  get_inbox_list: '查询小记列表',
  get_summaries_range: '查询每日总结',
  create_schedule: '新建事项',
  create_inbox: '创建小记',
};
