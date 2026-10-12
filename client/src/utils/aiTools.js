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

// priority 文本 → DB 整数（ethan_tasks.priority 为 INTEGER：1=高 2=中 3=低）。
// 后端 toInt 对非数字字符串会静默回退默认值 2，'high' 会丢优先级，这里前置换算。
function prioToInt(v) {
  const map = { high: 1, medium: 2, low: 3, '1': 1, '2': 2, '3': 3, 高: 1, 中: 2, 低: 3 };
  const n = map[String(v ?? '').trim().toLowerCase()] ?? Number(v);
  return [1, 2, 3].includes(n) ? n : 2;
}
export function priorityLabel(v) {
  return { 1: '高', 2: '中', 3: '低' }[v] || String(v ?? '');
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
      name: 'get_today_tasks',
      description: '获取指定日期（默认今天）的待办任务列表，包括标题、优先级、是否完成。核对某天是否已创建任务时传入 date',
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
      description: '创建一条日程到日历/今日计划。date 用 YYYY-MM-DD（明天/后天需按当前日期换算），默认今天。创建前先向用户确认',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '日程标题' },
          date: { type: 'string', description: '日期，格式 YYYY-MM-DD，默认今天' },
          start_time: { type: 'string', description: '开始时间，格式 HH:MM' },
          end_time: { type: 'string', description: '结束时间，格式 HH:MM' },
          category: { type: 'string', description: '分类：工作/生活/学习/其他' },
          notes: { type: 'string', description: '备注' },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_task',
      description: '创建一条待办任务到今日计划。date 用 YYYY-MM-DD（明天/后天需按当前日期换算），默认今天。创建前先向用户确认',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '待办标题' },
          date: { type: 'string', description: '日期，格式 YYYY-MM-DD，默认今天' },
          priority: { type: 'string', description: '优先级：high/medium/low' },
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
const WRITE_TOOLS = new Set(['create_schedule', 'create_task', 'create_inbox']);
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
    case 'get_today_tasks': {
      const day = resolveDate(args.date);
      const res = await API.tasks.list({ from: day, to: day });
      const items = (res?.tasks || res?.items || []).map(t => ({
        title: t.title,
        priority: t.priority || 'medium',
        done: !!t.is_done,
      }));
      return { date: day, count: items.length, tasks: items };
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
        start_time: args.start_time || '',
        end_time: args.end_time || '',
        category: args.category || '工作',
        notes: args.notes || '',
      };
      const res = await API.schedules.create(data);
      const id = res?.id || res?.schedule?.id;
      if (!id) throw new Error('创建接口未返回日程 id，可能未真正写入');
      // 回读：确认日程真实落库且日期无误
      const check = await API.schedules.get(id);
      if (!check?.schedule) throw new Error(`写入校验失败：日程 #${id} 回读不到，数据可能未落库`);
      if (check.schedule.date !== data.date) {
        throw new Error(`写入校验失败：日期不一致（期望 ${data.date}，实际 ${check.schedule.date}）`);
      }
      return { success: true, id, title: data.title, date: data.date, start_time: data.start_time, category: data.category };
    }
    case 'create_task': {
      const data = {
        title: args.title,
        date: resolveDate(args.date),
        priority: prioToInt(args.priority),
      };
      const res = await API.tasks.create(data);
      const id = res?.id || res?.task?.id;
      if (!id) throw new Error('创建接口未返回任务 id，可能未真正写入');
      // 回读：确认任务真实落库且日期无误
      const check = await API.tasks.get(id);
      if (!check?.task) throw new Error(`写入校验失败：任务 #${id} 回读不到，数据可能未落库`);
      if (check.task.date !== data.date) {
        throw new Error(`写入校验失败：日期不一致（期望 ${data.date}，实际 ${check.task.date}）`);
      }
      return { success: true, id, title: data.title, date: data.date, priority: data.priority };
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
    case 'get_today_tasks':
      return `今日（${result.date}）共 ${result.count} 条待办：` +
        result.tasks.map(t => `\n- ${t.title}（优先级:${t.priority}）${t.done ? '（已完成）' : ''}`).join('');
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
    case 'create_schedule':
      return `已创建日程「${result.title}」→ ${result.date}${result.start_time ? ' ' + result.start_time : ''}，分类${result.category}（#${result.id}，已回读校验落库成功）`;
    case 'create_task':
      return `已创建待办「${result.title}」→ ${result.date}，优先级${priorityLabel(result.priority)}（#${result.id}，已回读校验落库成功）`;
    case 'create_inbox':
      return `已创建小记「${result.content}」${result.tag ? '，标签' + result.tag : ''}（#${result.id}）`;
    default:
      return JSON.stringify(result);
  }
}

// 工具友好显示名（用于对话区步骤条）
export const toolDisplayNames = {
  get_today_schedules: '查询今日日程',
  get_today_tasks: '查询今日待办',
  get_habits_stats: '查询习惯统计',
  get_habits_list: '查询习惯列表',
  get_inbox_list: '查询小记列表',
  get_summaries_range: '查询每日总结',
  create_schedule: '创建日程',
  create_task: '创建待办',
  create_inbox: '创建小记',
};
