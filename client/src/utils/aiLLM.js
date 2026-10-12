/* ============================================================
 * AI 助手核心调用层
 *   · modelConfigs：5 家预置 + 自定义，方便以后加新模型
 *   · getAIConfig / saveAIConfig：localStorage「ai_config」读写
 *   · callLLMStream：OpenAI 兼容格式流式调用，支持 function calling
 *   · testConnection：测试连接（发一句"你好"）
 *   · renderMarkdown：极简 Markdown → HTML（加粗/列表/代码/标题/链接）
 *   · buildSystemPrompt：根据模式构建系统提示词
 * ============================================================ */
import { today as getToday, addDaysISO, fromISODate } from './date.js';

// ===== 模型配置（方便以后加新模型）=====
export const modelConfigs = {
  doubao: {
    label: '豆包 Doubao',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    model: 'doubao-pro-32k',
    supportsTools: true,
  },
  deepseek: {
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    supportsTools: true,
  },
  qwen: {
    label: '通义千问 Qwen',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-turbo',
    supportsTools: true,
  },
  kimi: {
    label: 'Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-8k',
    supportsTools: true,
  },
  glm: {
    label: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-flash',
    supportsTools: true,
  },
  custom: {
    label: '自定义',
    baseUrl: '',
    model: '',
    supportsTools: true,
  },
};

// ===== 配置读写（localStorage「ai_config」）=====
const AI_CONFIG_KEY = 'ai_config';

export function getAIConfig() {
  try {
    const raw = localStorage.getItem(AI_CONFIG_KEY);
    if (!raw) return null;
    const cfg = JSON.parse(raw);
    // 合并默认值，防字段缺失
    return {
      provider: cfg.provider || 'doubao',
      apiKey: cfg.apiKey || '',
      baseUrl: cfg.baseUrl || modelConfigs[cfg.provider]?.baseUrl || '',
      model: cfg.model || modelConfigs[cfg.provider]?.model || '',
      enableTools: cfg.enableTools !== false, // 默认开启工具调用
    };
  } catch {
    return null;
  }
}

export function saveAIConfig(config) {
  try {
    localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(config));
  } catch { /* ignore */ }
}

// ===== 系统提示词构建 =====
// 关键：必须显式注入「当前日期」，否则模型对「今天/明天/后天」等相对时间只能靠猜，
// 会把任务建到错误日期上（工作台里看不到，模型的 today 查询也查不到）。
function buildDateContext() {
  const t = getToday();
  const d = fromISODate(t);
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
  return [
    `【当前日期】今天是 ${t}（${week}）。`,
    '用户提到「今天/明天/后天/昨天/本周/下周」等相对时间时，一律基于该日期换算为具体日期（格式 YYYY-MM-DD），禁止凭记忆编造日期。',
    `例如：今天=${t}，明天=${addDaysISO(t, 1)}，后天=${addDaysISO(t, 2)}，昨天=${addDaysISO(t, -1)}。`,
  ].join('\n');
}

// 工具使用规范（通用问答 / 知识库问答都适用）
const TOOL_GUIDE = [
  '【工具使用】',
  '- 你可以调用工具查询工作台数据、新建事项。用户让你「记个待办/加个日程/建个任务」时，一律调用 create_schedule 新建事项（无明确时间就不要传时间字段，会作为待办型事项进入「未定时事项」），不要只回复文字。',
  '- 创建事项时必须给出准确 date（YYYY-MM-DD）；用户说「明天」就按上面换算出的日期填写，不确定就先询问。可按语义传分类（工作/能力/学习/生活等）。',
  '- 执行创建类操作前，先用一两句话复述要点请求确认。',
  '- 每次创建成功后，必须立即调用对应查询工具（如 get_today_schedules 并传用户所说的 date）核对，然后向用户报告「已创建到 X 年 X 月 X 日，查询到该日共 N 条」。',
  '- 告知用户新建的事项与手动「新建事项」效果一致：重点事项卡、主页今日、日历、时间线都能看到，点击即可编辑；若查询核对不到刚创建的条目，如实告知并建议重试，不要谎报成功。',
].join('\n');

export function buildSystemPrompt(mode, knowledgeBaseText) {
  if (mode === 'kb' && knowledgeBaseText) {
    return [
      '你是一个智能助手，请严格基于以下知识库内容回答用户问题。',
      '',
      '【知识库内容】',
      knowledgeBaseText,
      '',
      buildDateContext(),
      '',
      TOOL_GUIDE,
      '',
      '回答规则：',
      '1. 仅基于上方知识库内容回答，不要编造知识库中没有的信息。',
      '2. 如果知识库中没有相关内容，直接回答「这个问题我的知识库里没有，建议切换到通用问答模式询问。」（但用户要求创建日程/待办等工具操作时，正常执行工具）。',
      '3. 口吻亲切专业，简洁明了。',
      '4. 禁止使用绝对化用语（如"最""唯一""第一"等）。',
      '5. 如果引用了知识库条目，在回答末尾标注来源条目标题。',
    ].join('\n');
  }
  // 通用问答
  return [
    '你是一个智能助手，请准确回答用户问题。回答简洁明了，口吻亲切专业。',
    '',
    buildDateContext(),
    '',
    TOOL_GUIDE,
  ].join('\n');
}

// ===== 流式调用核心（OpenAI 兼容格式，支持 function calling）=====
// 返回 { content: string, toolCalls: [{ id, name, args }] | null }
// onToken(chunk) 回调用于流式渲染
export async function callLLMStream({ messages, tools, onToken, signal }) {
  const config = getAIConfig();
  if (!config || !config.apiKey) {
    throw new Error('请先在⚙️模型配置中填写 API Key');
  }

  const baseUrl = (config.baseUrl || '').replace(/\/+$/, '');
  const url = `${baseUrl}/chat/completions`;
  const useTools = config.enableTools && tools && tools.length > 0 && modelConfigs[config.provider]?.supportsTools;

  const body = {
    model: config.model,
    messages,
    temperature: 0.7,
    stream: true,
  };
  if (useTools) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    let errMsg = `请求失败 (${res.status})`;
    try {
      const errData = await res.json();
      errMsg = errData?.error?.message || errData?.error || errData?.message || errMsg;
    } catch { /* ignore */ }
    throw new Error(errMsg);
  }

  // 解析 SSE 流
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let toolCalls = []; // [{ index, id, name, argsStr }]

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // 最后一段可能不完整
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') continue;
      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta;
        if (!delta) continue;
        // 文本增量
        if (delta.content) {
          content += delta.content;
          onToken?.(delta.content);
        }
        // 工具调用增量
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            if (!toolCalls[idx]) {
              toolCalls[idx] = { id: tc.id || '', name: '', argsStr: '' };
            }
            if (tc.id) toolCalls[idx].id = tc.id;
            if (tc.function?.name) toolCalls[idx].name += tc.function.name;
            if (tc.function?.arguments) toolCalls[idx].argsStr += tc.function.arguments;
          }
        }
      } catch { /* 忽略解析失败的行 */ }
    }
  }

  // 规整工具调用
  const finalToolCalls = toolCalls
    .filter(tc => tc && tc.name)
    .map(tc => {
      let args = {};
      try { args = JSON.parse(tc.argsStr || '{}'); } catch { /* 空参数兜底 */ }
      return { id: tc.id, name: tc.name, args };
    });

  return { content, toolCalls: finalToolCalls.length > 0 ? finalToolCalls : null };
}

// ===== 测试连接（发一句"你好"）=====
export async function testConnection(config) {
  if (!config.apiKey) throw new Error('请填写 API Key');
  const baseUrl = (config.baseUrl || '').replace(/\/+$/, '');
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: 'user', content: '你好' }],
      temperature: 0.7,
      stream: false,
    }),
  });
  if (!res.ok) {
    let msg = `连接失败 (${res.status})`;
    try {
      const err = await res.json();
      msg = err?.error?.message || err?.error || msg;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  const data = await res.json();
  const reply = data?.choices?.[0]?.message?.content || '';
  if (!reply) throw new Error('返回内容为空，请检查模型名称是否正确');
  return reply;
}

// ===== 极简 Markdown 渲染（加粗/斜体/代码块/行内代码/列表/标题/链接/换行）=====
// 不引入外部库，覆盖 AI 回答常见的 Markdown 结构
export function renderMarkdown(text) {
  if (!text) return '';
  let html = text;

  // 1. 转义 HTML 实体（防 XSS）
  html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // 2. 代码块 ```lang\ncode\n```
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) =>
    `<pre class="ai-md-codeblock"><code>${code.trim()}</code></pre>`
  );

  // 3. 行内代码 `code`
  html = html.replace(/`([^`]+)`/g, '<code class="ai-md-code">$1</code>');

  // 4. 标题 ### / ## / #
  html = html.replace(/^### (.+)$/gm, '<h4 class="ai-md-h4">$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3 class="ai-md-h3">$1</h3>');
  html = html.replace(/^# (.+)$/gm, '<h3 class="ai-md-h3">$1</h3>');

  // 5. 链接 [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" class="ai-md-link">$1</a>');

  // 6. 加粗 **text**
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // 7. 斜体 *text*
  html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');

  // 8. 无序列表项 - 或 *
  html = html.replace(/^[\-\*] (.+)$/gm, '<li class="ai-md-li">$1</li>');
  html = groupConsecutiveList(html, 'ai-md-li', 'ul');

  // 9. 有序列表项 1.
  html = html.replace(/^\d+\. (.+)$/gm, '<li class="ai-md-oli">$1</li>');
  html = groupConsecutiveList(html, 'ai-md-oli', 'ol');

  // 10. 段落换行（连续两个换行 → 段落分隔；单换行 → <br>）
  html = html
    .split(/\n{2,}/)
    .map(block => {
      // 不包裹已包裹的块级元素
      if (/^\s*<(h[34]|ul|ol|pre|li)/.test(block)) return block.trim();
      const trimmed = block.trim();
      return trimmed ? `<p class="ai-md-p">${trimmed.replace(/\n/g, '<br>')}</p>` : '';
    })
    .join('\n');

  return html;
}

// 把连续的同类 <li> 行合并进同一个 <ul>/<ol>。
// 注意：逐项包裹会让每个条目都带上列表的上下 margin，把行距撑得很大。
function groupConsecutiveList(html, liClass, tag) {
  const marker = `<li class="${liClass}">`;
  const out = [];
  let buf = [];
  const flush = () => {
    if (!buf.length) return;
    // 前后留空行，保证第 10 步按独立块处理
    out.push('', `<${tag} class="ai-md-${tag}">${buf.join('')}</${tag}>`, '');
    buf = [];
  };
  for (const line of html.split('\n')) {
    if (line.startsWith(marker)) buf.push(line);
    else { flush(); out.push(line); }
  }
  flush();
  return out.join('\n');
}
