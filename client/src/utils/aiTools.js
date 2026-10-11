/* ============================================================
 * AI Agent 工具定义与执行器
 *   · aiToolDefinitions：OpenAI tools 格式，供 callLLMStream 传给模型
 *   · executeTool：前端执行工具（调已有工作台 API，不新建后端）
 *   · isWriteTool：判断是否为写操作（写操作需用户确认）
 *   · formatToolResult：把 API 返回格式化为 AI 易读的文本
 * ============================================================ */

import { API } from '../api/client.js';
import { today as getToday, toISODate, addDaysISO } from './date.js';

// ===== 工具定义（OpenAI function calling 格式）=====
export const aiToolDefinitions = [
  // ── 读数据工具 ──
  {
    type: 'function',
    function: {
      name: 'get_today_schedules',
      description: '获取今天的日程列表，包括标题、时间、是否完成、分类',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_today_tasks',
      description: '获取今天的待办任务列表，包括标题、优先级、是否完成',
      parameters: { type: 'object', properties: {} },
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
      description: '创建一条日程到日历/今日计划。创建前先向用户确认',
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
      description: '创建一条待办任务到今日计划。创建前先向用户确认',
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
      const today = getToday();
      const res = await API.schedules.list({ from: today, to: today });
      const items = (res?.schedules || res?.items || []).map(s => ({
        title: s.title,
        time: s.start_time ? `${s.start_time}${s.end_time ? '-' + s.end_time : ''}` : '全天',
        done: !!s.is_done,
        category: s.category || '',
      }));
      return { date: today, count: items.length, schedules: items };
    }
    case 'get_today_tasks': {
      const today = getToday();
      const res = await API.tasks.list({ from: today, to: today });
      const items = (res?.tasks || res?.items || []).map(t => ({
        title: t.title,
        priority: t.priority || 'medium',
        done: !!t.is_done,
      }));
      return { date: today, count: items.length, tasks: items };
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
    // ── 写数据 ──
    case 'create_schedule': {
      const data = {
        title: args.title,
        date: args.date || getToday(),
        start_time: args.start_time || '',
        end_time: args.end_time || '',
        category: args.category || '工作',
        notes: args.notes || '',
      };
      const res = await API.schedules.create(data);
      return { success: true, id: res?.id || res?.schedule?.id, ...data };
    }
    case 'create_task': {
      const data = {
        title: args.title,
        date: args.date || getToday(),
        priority: args.priority || 'medium',
      };
      const res = await API.tasks.create(data);
      return { success: true, id: res?.id || res?.task?.id, ...data };
    }
    case 'create_inbox': {
      const data = { content: args.content };
      if (args.tag) data.tag_name = args.tag;
      const res = await API.inbox.create(data);
      return { success: true, id: res?.id, content: args.content, tag: args.tag || '' };
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
      return `已创建日程「${result.title}」，日期${result.date}${result.start_time ? ' ' + result.start_time : ''}，分类${result.category}`;
    case 'create_task':
      return `已创建待办「${result.title}」，日期${result.date}，优先级${result.priority}`;
    case 'create_inbox':
      return `已创建小记「${result.content}」${result.tag ? '，标签' + result.tag : ''}`;
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
