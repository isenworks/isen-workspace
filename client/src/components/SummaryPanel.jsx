import { useState, useEffect, useMemo, useRef } from 'react';
import { API } from '../api/client.js';
import { calcDurationMin, formatDuration } from '../utils/date.js';

function getWeekNumber(dateStr) {
  if (!dateStr) return 1;
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1, d));
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil(((target - yearStart) / 86400000 + 1) / 7);
}

// ===== 模板定义 =====
const DEFAULT_TEMPLATES = [
  {
    id: 'daily',
    name: '通用每日',
    emoji: '📋',
    sections: [
      { idx: 1, title: '今日成果 / 亮点', color: '#ff3b30', placeholder: '今天完成了什么重要的事？' },
      { idx: 2, title: '今日不足 / 改进', color: '#ff9500', placeholder: '哪些事没做好？哪里可以改进？' },
      { idx: 3, title: '今日收获（可复利新知 / 动作）', color: '#007aff', placeholder: '学到了什么新知识？有什么可以复用的经验？' },
      { idx: 4, title: '明日计划 / 验证清单', color: '#34c759', placeholder: '明天最重要的 3 件事？' },
    ],
  },
  {
    id: 'kpt',
    name: 'KPT 复盘',
    emoji: '🔁',
    sections: [
      { idx: 1, title: 'Keep（继续保持）', color: '#34c759', placeholder: '哪些做得好，值得持续坚持？' },
      { idx: 2, title: 'Problem（遇到问题）', color: '#ff3b30', placeholder: '遇到了什么阻碍或问题？' },
      { idx: 3, title: 'Try（下一步尝试）', color: '#007aff', placeholder: '针对问题，计划尝试什么改变？' },
      { idx: 4, title: '明日小目标', color: '#ff9500', placeholder: '明天最重要的行动项？' },
    ],
  },
  {
    id: 'job',
    name: '求职专项',
    emoji: '💼',
    sections: [
      { idx: 1, title: '今日投递 & 进展', color: '#007aff', placeholder: '投了哪些公司？有什么新进展？' },
      { idx: 2, title: '刷题 / 学习输出', color: '#34c759', placeholder: '刷了多少题？学了哪些知识点？' },
      { idx: 3, title: '复盘 & 不足', color: '#ff9500', placeholder: '哪里表现不好？需要补什么？' },
      { idx: 4, title: '明日计划', color: '#ff3b30', placeholder: '投哪些 / 学什么 / 准备什么？' },
    ],
  },
  {
    id: 'gtd',
    name: 'GTD 清空',
    emoji: '🧠',
    sections: [
      { idx: 1, title: '已完成（拖出大脑）', color: '#34c759', placeholder: '把今天做完的所有事列出来' },
      { idx: 2, title: '未完成 & 转移', color: '#ff3b30', placeholder: '哪些没做完？挪到哪天？' },
      { idx: 3, title: '新想法 & 收集箱', color: '#007aff', placeholder: '脑中冒出来的新念头/项目/灵感' },
      { idx: 4, title: '明日 Top3 + 下一步', color: '#ff9500', placeholder: '明天最高优先级的 3 件事，以及立刻能做的第一步' },
    ],
  },
];

const TEMPLATES_KEY = (uid) => `summary_templates:${uid || 'anon'}`;
const PRESET_OVERRIDES_KEY = (uid) => `summary_preset_overrides:${uid || 'anon'}`;
const PRESET_DELETED_KEY = (uid) => `summary_preset_deleted:${uid || 'anon'}`;
const CUSTOM_TPL_LIMIT = 8;

function loadCustomTemplates(uid) {
  try {
    const raw = localStorage.getItem(TEMPLATES_KEY(uid));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveCustomTemplates(uid, list) {
  try {
    localStorage.setItem(TEMPLATES_KEY(uid), JSON.stringify(list || []));
  } catch {}
}

function loadPresetOverrides(uid) {
  try {
    const raw = localStorage.getItem(PRESET_OVERRIDES_KEY(uid));
    if (!raw) return {};
    const obj = JSON.parse(raw);
    return (obj && typeof obj === 'object') ? obj : {};
  } catch { return {}; }
}

function savePresetOverrides(uid, obj) {
  try { localStorage.setItem(PRESET_OVERRIDES_KEY(uid), JSON.stringify(obj || {})); } catch {}
}

function loadDeletedPresets(uid) {
  try {
    const raw = localStorage.getItem(PRESET_DELETED_KEY(uid));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function saveDeletedPresets(uid, arr) {
  try { localStorage.setItem(PRESET_DELETED_KEY(uid), JSON.stringify(arr || [])); } catch {}
}

// ===== 工具函数 =====
function parseContent(raw) {
  const empty = { template: 'daily', highlights: '', improvements: '', learnings: '', tomorrow: '' };
  if (!raw) return empty;
  try {
    const p = JSON.parse(raw);
    return { ...empty, ...p };
  } catch {
    return empty;
  }
}

function toDisplayDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return `${m}月${d}日 · ${weekdays[dt.getDay()]}`;
}

function countChinese(text) {
  if (!text) return 0;
  return text.replace(/\s/g, '').length;
}

// 根据 template id 返回 4 个 section 的 key
function getSectionKeys(templateId) {
  // 始终用 4 个固定 key 存储（便于切换模板时内容保持对应位置）
  return ['highlights', 'improvements', 'learnings', 'tomorrow'];
}

// ===== Markdown 生成 =====
function buildMarkdown({ dateStr, schedules, habits, energyState, moodState, template, sectionsText }) {
  const weekNum = getWeekNumber(dateStr);
  const displayDate = toDisplayDate(dateStr);

  // === 重点事项 ===
  const keySchedules = (schedules || []).filter(s => s.is_key === 1 || s.category === 1 || s.category === 2);
  const keyDone = keySchedules.filter(s => s.is_done).length;
  const keyTotal = keySchedules.length;
  const keyRate = keyTotal === 0 ? 0 : Math.round((keyDone / keyTotal) * 100);

  const catLabel = (cat) => {
    if (cat === 1) return '🔴';
    if (cat === 2) return '🟠';
    return '';
  };
  const stateLabel = (done) => done ? '✅ 完成' : '❌ 未完成';
  const scheduleTime = (s) => {
    if (s.start_time && s.end_time) return `${s.start_time} – ${s.end_time}`;
    if (s.start_time) return s.start_time;
    return '—';
  };
  const scheduleDur = (s) => {
    const calc = calcDurationMin(s.start_time, s.end_time);
    const dur = calc != null ? calc : s.duration_min;
    return dur ? formatDuration(dur) : '—';
  };

  let md = `# ${displayDate} · 每日总结\n\n`;
  md += `> 📅 ${dateStr} · 第${weekNum}周\n`;
  md += `> 📊 重点 ${keyDone}/${keyTotal} · 习惯 ${habits?.filter(h => h.done_today).length || 0}/${habits?.length || 0}\n\n`;
  md += `---\n\n`;

  md += `## ✅ 今日重点事项\n\n`;
  if (keySchedules.length === 0) {
    md += `> 今日无重点事项\n\n`;
  } else {
    md += `| 事项 | 时间段 | 时长 | 状态 |\n|---|---|---|---|\n`;
    keySchedules.forEach(s => {
      md += `| ${catLabel(s.category)} ${s.title.replace(/\|/g, '\\|')} | ${scheduleTime(s)} | ${scheduleDur(s)} | ${stateLabel(!!s.is_done)} |\n`;
    });
    md += `\n> 完成率 ${keyRate}%\n\n`;
  }

  md += `---\n\n`;

  // === 习惯打卡 ===
  md += `## 💧 习惯打卡\n\n`;
  if (!habits || habits.length === 0) {
    md += `> 今日无习惯\n\n`;
  } else {
    md += `| 习惯 | 目标 | 实际 | 状态 |\n|---|---|---|---|\n`;
    habits.forEach(h => {
      const targetTxt = (() => {
        if (h.start_time && h.end_time) return `${h.start_time}-${h.end_time} · ${formatDuration(h.duration_min || calcDurationMin(h.start_time, h.end_time) || 0)}`;
        if (h.target_time) return `${h.target_time} · ${h.duration_min ? formatDuration(h.duration_min) : '全天'}`;
        if (h.duration_min) return formatDuration(h.duration_min);
        return '全天';
      })();
      const actualTxt = (() => {
        if (h.sleep_start && h.sleep_end) {
          const calc = calcDurationMin(h.sleep_start, h.sleep_end);
          return `${h.sleep_start}-${h.sleep_end} · **${calc ? formatDuration(calc) : '—'}**`;
        }
        if (h.done_today) return '✅ 已完成';
        return '–';
      })();
      const state = h.done_today ? '✅ 达成' : '❌ 未开始';
      md += `| ${h.emoji || '✅'} ${h.name.replace(/\|/g, '\\|')} | ${targetTxt} | ${actualTxt} | ${state} |\n`;
    });

    // 精力 + 心情（从睡眠记录取）
    const en = energyState || habits.find(h => h.energy_state)?.energy_state;
    const md_ = moodState || habits.find(h => h.mood_state)?.mood_state;
    const energyText = { energized: '⚡充沛', normal: '⚡一般', poor: '⚡疲惫' }[en] || '⚡—';
    const moodText = { positive: '❤️积极', neutral: '❤️平淡', negative: '❤️消极' }[md_] || '❤️—';
    md += `\n**精力**：${energyText} · **心情**：${moodText}\n\n`;
  }

  md += `---\n\n`;

  // === 4 段总结 ===
  const tpl = DEFAULT_TEMPLATES.find(t => t.id === template) || DEFAULT_TEMPLATES[0];
  const keys = getSectionKeys(template);
  tpl.sections.forEach((sec, i) => {
    const key = keys[i];
    const content = sectionsText[key] || '';
    md += `## ${sec.idx}. ${sec.title}\n\n`;
    md += content ? `${content.trim()}\n\n` : '_\n\n';
  });

  md += `---\n\n`;
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const ts = `${dateStr} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  md += `_由 Ethan 工作台生成 · ${ts}_\n`;

  return md;
}

// ===== 简单的 Markdown 渲染（用于右侧预览） =====
function renderMdToHtml(md) {
  const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const lines = md.split('\n');
  let html = '';
  let inUl = false;
  let inTable = false;
  let tableHeadDone = false;
  let inBlockquote = false;
  let paragraphLines = [];

  const closeUl = () => { if (inUl) { html += '</ul>'; inUl = false; } };
  const closeTable = () => { if (inTable) { html += '</tbody></table>'; inTable = false; tableHeadDone = false; } };
  const closeBlockquote = () => { if (inBlockquote) { html += '</blockquote>'; inBlockquote = false; } };
  const flushPara = () => {
    if (paragraphLines.length > 0) {
      html += `<p>${escape(paragraphLines.join(' ')).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/_(.+?)_/g, '<em>$1</em>')}</p>`;
      paragraphLines = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    // hr
    if (/^---+\s*$/.test(line)) {
      closeUl(); closeTable(); closeBlockquote(); flushPara();
      html += '<hr style="border:none;border-top:1px solid rgba(0,0,0,0.08);margin:14px 0">';
      continue;
    }
    // h1
    const h1 = line.match(/^# (.+)$/);
    if (h1) {
      closeUl(); closeTable(); closeBlockquote(); flushPara();
      html += `<h1 style="font-size:17px;margin:0 0 8px;padding-bottom:6px;border-bottom:2px solid rgba(0,0,0,0.06)">${escape(h1[1])}</h1>`;
      continue;
    }
    // h2
    const h2 = line.match(/^## (.+)$/);
    if (h2) {
      closeUl(); closeTable(); closeBlockquote(); flushPara();
      html += `<h2 style="font-size:14px;margin:14px 0 6px;color:#007aff;display:flex;align-items:center;gap:6px"><span style="display:inline-block;width:3px;height:12px;border-radius:2px;background:#007aff"></span>${escape(h2[1])}</h2>`;
      continue;
    }
    // blockquote
    if (line.startsWith('>')) {
      closeUl(); closeTable(); flushPara();
      const txt = line.replace(/^>\s?/, '');
      if (!inBlockquote) { html += '<blockquote style="border-left:3px solid #007aff;background:rgba(0,122,255,0.04);padding:6px 10px;margin:6px 0;border-radius:0 8px 8px 0;color:#3c3c43;font-size:12px;line-height:1.7">'; inBlockquote = true; }
      else html += '<br>';
      html += escape(txt).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/_(.+?)_/g, '<em>$1</em>').replace(/  /g, '&nbsp;&nbsp;');
      continue;
    } else {
      closeBlockquote();
    }
    // ul
    const ul = line.match(/^[-*+] (.+)$/);
    if (ul) {
      closeTable(); flushPara();
      if (!inUl) { html += '<ul style="padding-left:18px;margin:4px 0">'; inUl = true; }
      html += `<li style="margin:2px 0;line-height:1.7">${escape(ul[1]).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/_(.+?)_/g, '<em>$1</em>').replace(/\[(.+?)\]/g, '<span style="color:#007aff;font-weight:600">[$1]</span>')}</li>`;
      continue;
    } else {
      closeUl();
    }
    // table
    if (line.startsWith('|')) {
      flushPara();
      const cells = line.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
      const isSep = cells.every(c => /^:?-+:?$/.test(c));
      if (isSep) continue;
      if (!inTable) {
        html += '<table style="border-collapse:collapse;width:100%;font-size:12px;margin:6px 0"><thead><tr>';
        cells.forEach(c => { html += `<th style="border:1px solid rgba(0,0,0,0.08);padding:4px 8px;text-align:left;background:rgba(0,0,0,0.02);font-weight:600">${escape(c)}</th>`; });
        html += '</tr></thead><tbody>';
        inTable = true; tableHeadDone = true;
      } else {
        html += '<tr>';
        cells.forEach(c => {
          let cellHtml = escape(c).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
          if (/✅/.test(c)) cellHtml = cellHtml.replace(/✅[^\u4e00-\u9fa5|]*/g, m => `<span style="color:#34c759;font-weight:600">${m}</span>`);
          if (/❌/.test(c)) cellHtml = cellHtml.replace(/❌[^\u4e00-\u9fa5|]*/g, m => `<span style="color:#ff3b30;font-weight:600">${m}</span>`);
          if (/⚡|❤️/.test(c)) {
            cellHtml = cellHtml.replace(/⚡充沛/g, '<span style="color:#34c759;font-weight:600">⚡充沛</span>');
            cellHtml = cellHtml.replace(/⚡一般/g, '<span style="color:#007aff;font-weight:600">⚡一般</span>');
            cellHtml = cellHtml.replace(/⚡疲惫/g, '<span style="color:#ff3b30;font-weight:600">⚡疲惫</span>');
            cellHtml = cellHtml.replace(/❤️积极/g, '<span style="color:#34c759;font-weight:600">❤️积极</span>');
            cellHtml = cellHtml.replace(/❤️平淡/g, '<span style="color:#007aff;font-weight:600">❤️平淡</span>');
            cellHtml = cellHtml.replace(/❤️消极/g, '<span style="color:#ff3b30;font-weight:600">❤️消极</span>');
          }
          html += `<td style="border:1px solid rgba(0,0,0,0.08);padding:4px 8px;text-align:left;line-height:1.6">${cellHtml}</td>`;
        });
        html += '</tr>';
      }
      continue;
    } else {
      closeTable();
    }
    // blank
    if (line.trim() === '') {
      flushPara();
      continue;
    }
    // paragraph line
    paragraphLines.push(line);
  }
  flushPara();
  closeUl(); closeTable(); closeBlockquote();
  return html;
}

// ============================================================
// 主组件：支持 embed（嵌入到右栏）与 modal（弹窗）两种模式
// embed 模式下：自己负责整体卡片外观 + Tab 切换 + 数据加载
// ============================================================
export default function SummaryPanel({
  userId,
  date,
  onClose,
  // embed 模式 props
  embed = false,
  // 当 embed 模式下，父组件已拉好的数据（可选）；不传则内部自己拉
  schedules: propSchedules,
  habits: propHabits,
  refreshSignal,
  onChange,
  onBack, // embed 模式下"返回时间线"按钮
}) {
  const [templateId, setTemplateId] = useState('daily');
  const [sectionsText, setSectionsText] = useState({ highlights: '', improvements: '', learnings: '', tomorrow: '' });
  const [customTpls, setCustomTpls] = useState([]);
  const [presetOverrides, setPresetOverrides] = useState({});
  const [deletedPresets, setDeletedPresets] = useState([]);
  const [savedTime, setSavedTime] = useState(null); // 最后保存时间 Date
  const [saving, setSaving] = useState(false);
  const [schedules, setSchedules] = useState(propSchedules || []);
  const [habits, setHabits] = useState(propHabits || []);
  const [mdOpen, setMdOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tplMenuOpen, setTplMenuOpen] = useState(false);
  const tplMenuRef = useRef(null);
  const [showTplEditor, setShowTplEditor] = useState(false);
  const [editingTplId, setEditingTplId] = useState(null); // null 表示新建，否则为编辑模板 id
  const [newTplDraft, setNewTplDraft] = useState({ name: '', s1: '', s2: '', s3: '', s4: '' });
  const autoSaveTimer = useRef(null);
  // ==== 保存相关：dirty 标记 + latestRef 规避闭包 + localStorage 草稿兜底 ====
  const dirtyRef = useRef(false);
  const latestRef = useRef({ templateId: 'daily', sectionsText: { highlights: '', improvements: '', learnings: '', tomorrow: '' } });
  const savingNowRef = useRef(false);
  const loadedApiTextRef = useRef(null); // 记录本次从 API 加载的内容签名，用于判断是否走草稿
  const lastSaveTsRef = useRef(0); // 最近一次 flushSave 成功的本地时间戳（ms），优先级最高

  function getDraftKey() { return `summary_draft_${date}_${userId || 'anon'}`; }
  function writeDraftToLS() {
    try {
      const payload = {
        t: Date.now(),
        templateId: latestRef.current.templateId,
        sectionsText: latestRef.current.sectionsText,
      };
      localStorage.setItem(getDraftKey(), JSON.stringify(payload));
    } catch (_) {}
  }
  function readDraftFromLS() {
    try {
      const raw = localStorage.getItem(getDraftKey());
      if (!raw) return null;
      const d = JSON.parse(raw);
      if (!d || typeof d !== 'object') return null;
      return d;
    } catch (_) { return null; }
  }
  function clearDraftLS() { try { localStorage.removeItem(getDraftKey()); } catch (_) {} }

  useEffect(() => { latestRef.current.templateId = templateId; }, [templateId]);
  useEffect(() => { latestRef.current.sectionsText = sectionsText; }, [sectionsText]);

  // 内容变更：先写 localStorage 草稿（兜底，100% 无延迟），再走 debounce API 保存
  useEffect(() => {
    // 初次尚未 load 完成，或 loadData 刚 setSectionsText 时：不写入草稿、不立即标记脏
    if (loadedApiTextRef.current == null) return;
    writeDraftToLS();
    dirtyRef.current = true;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => flushSave(true), 500);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
    // eslint-disable-next-line
  }, [sectionsText, templateId]);

  // flushSave：执行真实保存（silent=true 自动保存不展示 loading，但仍会 setSaving(true)/setSaving(false) 以触发重渲染，保证 savedTime 立刻显示）
  const flushSave = async (silent = false) => {
    if (autoSaveTimer.current) { clearTimeout(autoSaveTimer.current); autoSaveTimer.current = null; }
    if (savingNowRef.current) return; // 上一次还在飞：等下次触发
    const snapshot = {
      templateId: latestRef.current.templateId,
      sectionsText: { ...latestRef.current.sectionsText },
    };
    try {
      savingNowRef.current = true;
      setSaving(true); // 强制触发一次重渲染，避免 state 更新不及时
      const content = JSON.stringify({
        template: snapshot.templateId,
        highlights: snapshot.sectionsText.highlights || '',
        improvements: snapshot.sectionsText.improvements || '',
        learnings: snapshot.sectionsText.learnings || '',
        tomorrow: snapshot.sectionsText.tomorrow || '',
      });
      await API.summaries.upsert({ date, content });
      const now = new Date();
      const nowTs = now.getTime();
      lastSaveTsRef.current = nowTs; // 记录最近一次本地成功保存的时间戳（最高优先级）
      setSavedTime(now);
      dirtyRef.current = false;
      clearDraftLS(); // 保存成功后清草稿，避免后续误导
      // localStorage 存时间戳兜底（防止 setState 在卸载后不生效、跨刷新/切Tab丢失）
      try { localStorage.setItem(getDraftKey().replace('_draft_', '_savedAt_'), String(nowTs)); } catch (_) {}
      onChange?.();
    } catch (e) {
      console.warn('[SummaryPanel] save fail', e?.message || e);
    } finally {
      savingNowRef.current = false;
      setSaving(false);
    }
  };
  // 保留原名调用点（旧底部按钮、其他位置）
  const saveSummary = flushSave;

  // 组件卸载 / 页签关闭 / 切路由：强制 flush 未保存内容 + beforeunload 同步写一次草稿（极端情况）
  useEffect(() => {
    const onBeforeUnload = () => {
      if (dirtyRef.current) writeDraftToLS();
      try { flushSave(true); } catch (_) {}
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      // 卸载时 flush 一次（注意：async 未 await，但这里也没别的办法）
      if (dirtyRef.current) {
        writeDraftToLS();
        try { flushSave(true); } catch (_) {}
      }
    };
    // eslint-disable-next-line
  }, [date, userId]);

  // 包装 onBack：切回时间线前先 flush，避免切 Tab 丢最后一次输入
  const handleBack = () => {
    const run = () => { try { onBack?.(); } catch (_) {} };
    if (!dirtyRef.current) { run(); return; }
    // 1) 先写 LS 兜底
    writeDraftToLS();
    // 2) 发保存请求；保存无论成败，300ms 后返回时间线（不阻塞用户）
    const timer = setTimeout(run, 300);
    flushSave(true).then(() => { clearTimeout(timer); run(); }).catch(() => { clearTimeout(timer); run(); });
  };

  // 点击外部关闭模板下拉
  useEffect(() => {
    if (!tplMenuOpen) return;
    function onDocMouseDown(e) {
      const el = tplMenuRef.current;
      if (el && el.contains(e.target)) return;
      setTplMenuOpen(false);
    }
    function onDocKey(e) { if (e.key === 'Escape') setTplMenuOpen(false); }
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onDocKey);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onDocKey);
    };
  }, [tplMenuOpen]);

  // 合并模板：预设（应用 overrides、过滤 deleted）+ 自定义
  const allTemplates = useMemo(() => {
    const base = DEFAULT_TEMPLATES
      .filter(t => !deletedPresets.includes(t.id))
      .map(t => presetOverrides[t.id] ? { ...t, ...presetOverrides[t.id] } : t);
    return [...base, ...customTpls];
  }, [customTpls, presetOverrides, deletedPresets]);
  const currentTpl = allTemplates.find(t => t.id === templateId) || DEFAULT_TEMPLATES[0];

  // 判断是否为预设模板 id
  const isPresetId = (id) => DEFAULT_TEMPLATES.some(t => t.id === id);

  // ===== 初始化：加载已保存总结 + 自定义模板 + 预设修改/删除 + 数据 =====
  useEffect(() => {
    setCustomTpls(loadCustomTemplates(userId));
    setPresetOverrides(loadPresetOverrides(userId));
    setDeletedPresets(loadDeletedPresets(userId));
  }, [userId]);

  const loadData = async () => {
    try {
      // 在真正加载前，先把 loadedApiTextRef 置 null，避免加载过程中 draft debounce 写草稿被当成脏内容
      loadedApiTextRef.current = null;

      if (!propSchedules) {
        const r = await API.schedules.list({ date });
        setSchedules(r?.schedules || []);
      } else {
        setSchedules(propSchedules);
      }
      if (!propHabits) {
        const h = await API.habits.list({ date });
        setHabits(h?.habits || []);
      } else {
        setHabits(propHabits);
      }
      const s = await API.summaries.get(date);
      const parsed = parseContent(s?.summary?.content);
      const apiSections = {
        highlights: parsed.highlights || '',
        improvements: parsed.improvements || '',
        learnings: parsed.learnings || '',
        tomorrow: parsed.tomorrow || '',
      };
      const apiTemplate = parsed.template || 'daily';
      const apiUpdated = s?.summary?.updated_at ? new Date(s.summary.updated_at).getTime() : 0;

      // 本地草稿兜底：若草稿比 API 更新时间更新，或 API 为空但草稿有内容 → 以草稿为准
      const draft = readDraftFromLS();
      let finalSections = apiSections;
      let finalTemplate = apiTemplate;
      if (draft) {
        const allApiEmpty = !apiSections.highlights && !apiSections.improvements && !apiSections.learnings && !apiSections.tomorrow;
        const draftHasContent = !!(draft.sectionsText?.highlights || draft.sectionsText?.improvements || draft.sectionsText?.learnings || draft.sectionsText?.tomorrow);
        const draftNewer = draft.t && (draft.t > apiUpdated);
        if (draftHasContent && (allApiEmpty || draftNewer)) {
          finalSections = {
            highlights: draft.sectionsText?.highlights || '',
            improvements: draft.sectionsText?.improvements || '',
            learnings: draft.sectionsText?.learnings || '',
            tomorrow: draft.sectionsText?.tomorrow || '',
          };
          finalTemplate = draft.templateId || apiTemplate;
        }
      }
      setTemplateId(finalTemplate);
      setSectionsText(finalSections);
      // savedTime：取「API updated_at」「localStorage 保存时间」「最近一次本地 flushSave 时间戳」三者中的最大值（最新）
      // 解决：onChange 触发 reload 时 API 返回的 updated_at 可能滞后/时区转换，覆盖刚刚保存的时间
      let savedAtFromLSTs = 0;
      try {
        const raw = localStorage.getItem(getDraftKey().replace('_draft_', '_savedAt_'));
        if (raw) savedAtFromLSTs = parseInt(raw, 10) || 0;
      } catch (_) {}
      const candidates = [apiUpdated, savedAtFromLSTs, lastSaveTsRef.current].filter(t => t && !isNaN(t) && t > 0);
      const finalSavedTs = candidates.length ? Math.max(...candidates) : 0;
      if (finalSavedTs) {
        setSavedTime(new Date(finalSavedTs));
      }

      // 内容签名：标记加载完成，之后的用户变更才走脏检测 + debounce
      latestRef.current = { templateId: finalTemplate, sectionsText: finalSections };
      loadedApiTextRef.current = JSON.stringify([finalTemplate, finalSections]);
      dirtyRef.current = false;
    } catch (e) {
      console.warn('[SummaryPanel] load fail', e?.message || e);
    }
  };

  useEffect(() => { loadData(); /* eslint-disable-next-line */ }, [date, userId, refreshSignal]);

  // ===== 操作：模板、编辑、Markdown =====
  const openTplEditorForNew = () => {
    setEditingTplId(null);
    setNewTplDraft({ name: '', s1: '', s2: '', s3: '', s4: '' });
    setShowTplEditor(true);
  };

  const openTplEditorForEdit = (t) => {
    setEditingTplId(t.id);
    setNewTplDraft({
      name: t.name,
      s1: t.sections[0]?.title || '',
      s2: t.sections[1]?.title || '',
      s3: t.sections[2]?.title || '',
      s4: t.sections[3]?.title || '',
    });
    setShowTplEditor(true);
  };

  const handleSaveTplEditor = () => {
    const name = (newTplDraft.name || '').trim();
    const names = [newTplDraft.s1, newTplDraft.s2, newTplDraft.s3, newTplDraft.s4].map(s => s.trim());
    if (!name) return;
    if (names.some(n => !n)) return;
    const colors = ['#ff3b30', '#ff9500', '#007aff', '#34c759'];

    if (editingTplId) {
      if (isPresetId(editingTplId)) {
        // 编辑预设模板 → 保存 override
        const preset = DEFAULT_TEMPLATES.find(t => t.id === editingTplId);
        const override = {
          name,
          sections: names.map((n, i) => ({ idx: i + 1, title: n, color: colors[i], placeholder: '写点什么…' })),
        };
        const next = { ...presetOverrides, [editingTplId]: { ...preset, ...override } };
        setPresetOverrides(next);
        savePresetOverrides(userId, next);
      } else {
        // 编辑自定义模板
        const next = customTpls.map(t => {
          if (t.id !== editingTplId) return t;
          return {
            ...t,
            name,
            sections: names.map((n, i) => ({ idx: i + 1, title: n, color: colors[i], placeholder: '写点什么…' })),
          };
        });
        setCustomTpls(next);
        saveCustomTemplates(userId, next);
      }
    } else {
      if (customTpls.length >= CUSTOM_TPL_LIMIT) return;
      const newTpl = {
        id: 'custom_' + Date.now(),
        name,
        emoji: '✨',
        sections: names.map((n, i) => ({ idx: i + 1, title: n, color: colors[i], placeholder: '写点什么…' })),
        custom: true,
      };
      const next = [...customTpls, newTpl];
      setCustomTpls(next);
      saveCustomTemplates(userId, next);
      setTemplateId(newTpl.id);
    }
    setShowTplEditor(false);
    setEditingTplId(null);
    setNewTplDraft({ name: '', s1: '', s2: '', s3: '', s4: '' });
  };

  const handleAddCustomTpl = handleSaveTplEditor; // 兼容旧命名引用

  const handleDelTemplate = (id) => {
    if (isPresetId(id)) {
      // 删除预设模板 → 加入 deleted 列表
      const next = [...new Set([...deletedPresets, id])];
      setDeletedPresets(next);
      saveDeletedPresets(userId, next);
      if (templateId === id) setTemplateId('daily');
    } else {
      // 删除自定义模板
      const next = customTpls.filter(t => t.id !== id);
      setCustomTpls(next);
      saveCustomTemplates(userId, next);
      if (templateId === id) setTemplateId('daily');
    }
  };

  const handleDelCustomTpl = handleDelTemplate; // 兼容旧命名引用

  const handleSectionChange = (idx, value) => {
    const keys = getSectionKeys(templateId);
    const key = keys[idx - 1];
    if (!key) return;
    setSectionsText(prev => ({ ...prev, [key]: value }));
  };

  const handleManualSave = async () => {
    await flushSave(false);
  };

  const markdown = useMemo(() => {
    const keys = getSectionKeys(templateId);
    return buildMarkdown({
      dateStr: date,
      schedules,
      habits,
      energyState: habits.find(h => h.energy_state)?.energy_state,
      moodState: habits.find(h => h.mood_state)?.mood_state,
      template: templateId,
      sectionsText,
    });
  }, [date, schedules, habits, templateId, sectionsText]);

  const renderedMd = useMemo(() => renderMdToHtml(markdown), [markdown]);

  const copyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = markdown;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
      document.body.removeChild(ta);
    }
  };

  // ===== 公共内部 UI =====
  const sectionKeys = getSectionKeys(templateId);

  // --- 模板下拉弹出菜单内容（通用） ---
  const tplMenuPopup = tplMenuOpen && (
    <div
      style={{
        position: 'absolute', top: 'calc(100% + 6px)', right: 0,
        minWidth: '200px',
        background: '#fff',
        borderRadius: '12px',
        padding: '6px',
        boxShadow: '0 12px 36px rgba(0,0,0,0.18), 0 4px 10px rgba(0,0,0,0.06)',
        border: '1px solid rgba(0,0,0,0.06)',
        zIndex: 10002,
        maxHeight: '320px',
        overflowY: 'auto',
      }}
    >
      {allTemplates.map(t => (
        <div
          key={t.id}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '6px 10px',
            borderRadius: '8px',
            cursor: 'pointer',
            background: templateId === t.id ? 'rgba(0,122,255,0.08)' : 'transparent',
            color: templateId === t.id ? '#007aff' : '#1c1c1e',
            transition: 'background .1s',
            fontSize: '13px',
          }}
          onClick={() => { setTemplateId(t.id); setTplMenuOpen(false); }}
          onMouseEnter={(e) => { if (templateId !== t.id) e.currentTarget.style.background = 'rgba(0,0,0,0.04)'; }}
          onMouseLeave={(e) => { if (templateId !== t.id) e.currentTarget.style.background = 'transparent'; }}
        >
          <span style={{ fontSize: '14px', flexShrink: 0 }}>{t.emoji}</span>
          <span style={{ flex: 1, fontWeight: templateId === t.id ? '600' : '500', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {t.name}
          </span>
          {templateId === t.id && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#007aff" strokeWidth="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
          )}
          {templateId !== t.id && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
              <button
                onClick={(e) => { e.stopPropagation(); openTplEditorForEdit(t); setTplMenuOpen(false); }}
                style={{
                  width: '20px', height: '20px',
                  borderRadius: '50%',
                  border: 'none',
                  background: 'transparent',
                  color: '#c7c7cc',
                  cursor: 'pointer',
                  fontSize: '11px',
                  lineHeight: 1,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}
                title="编辑"
                onMouseEnter={(e) => { e.currentTarget.style.color = '#007aff'; e.currentTarget.style.background = 'rgba(0,122,255,0.08)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#c7c7cc'; e.currentTarget.style.background = 'transparent'; }}
              >✎</button>
              <button
                onClick={(e) => { e.stopPropagation(); handleDelTemplate(t.id); }}
                style={{
                  width: '20px', height: '20px',
                  borderRadius: '50%',
                  border: 'none',
                  background: 'transparent',
                  color: '#c7c7cc',
                  cursor: 'pointer',
                  fontSize: '12px',
                  lineHeight: 1,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}
                title="删除"
                onMouseEnter={(e) => { e.currentTarget.style.color = '#ff3b30'; e.currentTarget.style.background = 'rgba(255,59,48,0.08)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#c7c7cc'; e.currentTarget.style.background = 'transparent'; }}
              >×</button>
            </div>
          )}
        </div>
      ))}
      {customTpls.length < CUSTOM_TPL_LIMIT && (
        <>
          <div style={{ height: '1px', background: 'rgba(0,0,0,0.06)', margin: '4px 6px' }}></div>
          <div
            onClick={() => { openTplEditorForNew(); setTplMenuOpen(false); }}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '6px 10px',
              borderRadius: '8px',
              cursor: 'pointer',
              color: '#007aff',
              fontSize: '13px',
              fontWeight: '500',
              transition: 'background .1s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,122,255,0.08)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <span style={{ fontSize: '14px' }}>+</span>
            <span>新建模板</span>
          </div>
        </>
      )}
    </div>
  );

  // --- 模板按钮（header 风格，与「返回时间线」样式一致，embed 头部使用） ---
  const tplBtnHeaderStyle = (hover) => ({
    display: 'inline-flex', alignItems: 'center', gap: '4px',
    padding: '4px 10px', borderRadius: '8px',
    border: 'none', cursor: 'pointer',
    fontSize: '12px', fontWeight: '500',
    color: '#007aff',
    background: hover || tplMenuOpen ? 'rgba(0,122,255,0.15)' : 'rgba(0,122,255,0.08)',
    transition: 'all 0.15s',
  });

  // --- 模板按钮（内部风格，modal 模式单独使用） ---
  const tplBtnInnerStyle = () => ({
    display: 'inline-flex', alignItems: 'center', gap: '6px',
    padding: '5px 12px', borderRadius: '8px',
    fontSize: '12px', fontWeight: '600',
    cursor: 'pointer', transition: 'all .15s',
    background: tplMenuOpen ? 'rgba(0,122,255,0.10)' : 'rgba(120,120,128,0.10)',
    color: '#1c1c1e',
    border: tplMenuOpen ? '1px solid rgba(0,122,255,0.2)' : '1px solid transparent',
  });

  const tplArrow = (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
      style={{ transition: 'transform .15s', transform: tplMenuOpen ? 'rotate(180deg)' : 'none' }}>
      <polyline points="6 9 12 15 18 9"></polyline>
    </svg>
  );

  // embed 头部的模板按钮（与返回时间线同一排，样式统一）
  const templateHeaderBtn = (
    <div ref={tplMenuRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setTplMenuOpen(v => !v)}
        style={tplBtnHeaderStyle(false)}
        onMouseEnter={(e) => Object.assign(e.currentTarget.style, tplBtnHeaderStyle(true))}
        onMouseLeave={(e) => Object.assign(e.currentTarget.style, tplBtnHeaderStyle(false))}
      >
        <span style={{ fontSize: '12px' }}>{currentTpl.emoji}</span>
        <span>{currentTpl.name}</span>
        {tplArrow}
      </button>
      {tplMenuPopup}
    </div>
  );

  // modal 内部的模板按钮（右对齐，去掉模板 label）
  const templateInnerBtn = (
    <div ref={tplMenuRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setTplMenuOpen(v => !v)}
        style={tplBtnInnerStyle()}
        onMouseEnter={(e) => { if (!tplMenuOpen) e.currentTarget.style.background = 'rgba(120,120,128,0.18)'; }}
        onMouseLeave={(e) => { if (!tplMenuOpen) e.currentTarget.style.background = 'rgba(120,120,128,0.10)'; }}
      >
        <span style={{ fontSize: '12px' }}>{currentTpl.emoji}</span>
        <span>{currentTpl.name}</span>
        {tplArrow}
      </button>
      {tplMenuPopup}
    </div>
  );

  const panelInner = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* 仅 modal 模式显示模板选择按钮（去掉「模板」文字，右对齐） */}
      {!embed && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
          {templateInnerBtn}
        </div>
      )}

      {/* 自定义模板编辑器 */}
      {showTplEditor && (
        <div style={{
          padding: '12px 14px',
          borderRadius: '12px',
          border: '1px solid rgba(0,122,255,0.12)',
          background: 'rgba(0,122,255,0.03)',
          display: 'flex', flexDirection: 'column', gap: '8px',
        }}>
          <div style={{ fontSize: '13px', fontWeight: '600', color: '#007aff' }}>
            {editingTplId ? (isPresetId(editingTplId) ? '编辑预设模板' : '编辑自定义模板') : '新建自定义模板'}
          </div>
          <input
            value={newTplDraft.name}
            onChange={(e) => setNewTplDraft(d => ({ ...d, name: e.target.value }))}
            placeholder="模板名称（如：运动日复盘）"
            style={{
              padding: '7px 10px', fontSize: '13px',
              borderRadius: '8px', border: '1px solid #d1d1d6',
              background: '#fff', outline: 'none',
            }}
            maxLength={12}
          />
          {[1, 2, 3, 4].map(i => (
            <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{
                width: '18px', height: '18px', borderRadius: '5px',
                color: '#fff', fontSize: '10px', fontWeight: '700',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: ['#ff3b30', '#ff9500', '#007aff', '#34c759'][i - 1], flexShrink: 0,
              }}>{i}</span>
              <input
                value={newTplDraft['s' + i]}
                onChange={(e) => setNewTplDraft(d => ({ ...d, ['s' + i]: e.target.value }))}
                placeholder={`第 ${i} 段标题`}
                style={{
                  flex: 1, padding: '7px 10px', fontSize: '13px',
                  borderRadius: '8px', border: '1px solid #d1d1d6',
                  background: '#fff', outline: 'none',
                }}
                maxLength={20}
              />
            </div>
          ))}
          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
            <button
              onClick={() => { setShowTplEditor(false); setEditingTplId(null); setNewTplDraft({ name: '', s1: '', s2: '', s3: '', s4: '' }); }}
              style={{
                padding: '5px 12px', borderRadius: '8px', border: 'none',
                background: 'rgba(120,120,128,0.10)', color: '#3c3c43',
                fontSize: '12px', fontWeight: '600', cursor: 'pointer',
              }}
            >取消</button>
            <button
              onClick={handleSaveTplEditor}
              disabled={!newTplDraft.name.trim() || [newTplDraft.s1, newTplDraft.s2, newTplDraft.s3, newTplDraft.s4].some(s => !s.trim())}
              style={{
                padding: '5px 12px', borderRadius: '8px', border: 'none',
                background: '#007aff', color: '#fff',
                fontSize: '12px', fontWeight: '600', cursor: 'pointer',
                opacity: (!newTplDraft.name.trim() || [newTplDraft.s1, newTplDraft.s2, newTplDraft.s3, newTplDraft.s4].some(s => !s.trim())) ? 0.5 : 1,
              }}
            >{editingTplId ? '保存' : '创建'}</button>
          </div>
        </div>
      )}

      {/* 4 段编辑区 */}
      <div style={{
        background: 'rgba(255,255,255,0.55)',
        borderRadius: '14px',
        border: '1px solid rgba(0,0,0,0.04)',
        overflow: 'hidden',
      }}>
        {currentTpl.sections.map((sec, i) => {
          const key = sectionKeys[i];
          const val = sectionsText[key] || '';
          return (
            <div key={sec.idx} style={{
              padding: '12px 14px',
              borderBottom: i < currentTpl.sections.length - 1 ? '1px solid rgba(0,0,0,0.04)' : 'none',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: '6px',
              }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '7px',
                  fontSize: '13px', fontWeight: '600', color: '#1c1c1e',
                }}>
                  <span style={{
                    width: '18px', height: '18px', borderRadius: '5px',
                    color: '#fff', fontSize: '10px', fontWeight: '700',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, background: sec.color,
                  }}>{sec.idx}</span>
                  <span>{sec.title}</span>
                </div>
                <span style={{ fontSize: '10px', fontWeight: '600', color: '#c7c7cc' }}>
                  {countChinese(val)}字
                </span>
              </div>
              <textarea
                value={val}
                onChange={(e) => handleSectionChange(sec.idx, e.target.value)}
                placeholder={sec.placeholder}
                rows={5}
                style={{
                  width: '100%', border: 'none', borderRadius: '8px',
                  padding: '8px 10px', fontSize: '13px', lineHeight: '1.7',
                  fontFamily: 'inherit', color: '#1c1c1e',
                  background: 'rgba(0,0,0,0.015)',
                  outline: 'none', resize: 'none',
                  minHeight: '94px', maxHeight: '94px',
                  transition: 'all .15s',
                }}
              />
            </div>
          );
        })}
      </div>

      {/* 底部操作栏 */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '10px 14px',
        background: 'rgba(255,255,255,0.5)',
        borderRadius: '12px',
        border: '1px solid rgba(0,0,0,0.04)',
        flexWrap: 'wrap', gap: '8px',
      }}>
        <div style={{ fontSize: '11px', color: '#8e8e93', display: 'flex', gap: '8px', alignItems: 'center' }}>
          {saving
            ? <span style={{ color: '#007aff', fontWeight: '600' }}>⟳ 保存中…</span>
            : savedTime
              ? (
                <>
                  <span style={{ color: '#34c759', fontWeight: '600' }}>✓ 已保存</span>
                  <span>· {String(savedTime.getHours()).padStart(2, '0')}:{String(savedTime.getMinutes()).padStart(2, '0')}</span>
                </>
              )
              : <span>未保存</span>}
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setMdOpen(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '5px',
              padding: '6px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer',
              fontSize: '12px', fontWeight: '600', transition: 'all .15s',
              background: 'rgba(120,120,128,0.10)', color: '#3c3c43',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(120,120,128,0.18)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(120,120,128,0.10)'}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
            预览 Markdown
          </button>
          <button
            onClick={copyMarkdown}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '5px',
              padding: '6px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer',
              fontSize: '12px', fontWeight: '600', transition: 'all .15s',
              background: copied ? '#34c759' : '#007aff', color: '#fff',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"></path></svg>
            {copied ? '✓ 已复制' : '复制 Markdown'}
          </button>
          <button
            onClick={handleManualSave}
            disabled={saving}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '5px',
              padding: '6px 12px', borderRadius: '8px', border: 'none', cursor: saving ? 'default' : 'pointer',
              fontSize: '12px', fontWeight: '600', transition: 'all .15s',
              background: saving ? '#2db24f' : '#34c759', color: '#fff',
              opacity: saving ? 0.85 : 1,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
            {saving ? '保存中' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );

  // ===== Markdown 弹窗 =====
  const mdDialog = mdOpen && (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)',
        backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', zIndex: 10005,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
      }}
      onClick={() => setMdOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(860px, 100%)', maxHeight: '85vh',
          background: 'rgba(255,255,255,0.92)',
          backdropFilter: 'saturate(180%) blur(20px)',
          borderRadius: '18px',
          border: '1px solid rgba(255,255,255,0.6)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
          overflow: 'hidden',
          display: 'grid', gridTemplateRows: 'auto 1fr auto',
        }}
      >
        {/* head */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', borderBottom: '1px solid rgba(0,0,0,0.05)',
        }}>
          <div style={{ fontSize: '14px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}>
            Markdown 预览
            <span style={{
              fontSize: '10px', fontWeight: '600', padding: '2px 8px', borderRadius: '999px',
              background: 'rgba(0,122,255,0.10)', color: '#007aff',
            }}>可粘贴到飞书 / Notion</span>
          </div>
          <button
            onClick={() => setMdOpen(false)}
            style={{
              width: '28px', height: '28px', borderRadius: '8px',
              background: 'rgba(120,120,128,0.10)', border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: '#575f6a', fontSize: '16px', fontWeight: '500',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,59,48,0.10)'; e.currentTarget.style.color = '#ff3b30'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(120,120,128,0.10)'; e.currentTarget.style.color = '#575f6a'; }}
          >×</button>
        </div>
        {/* body */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, overflow: 'hidden',
        }}>
          <div style={{
            overflowY: 'auto', padding: '16px',
            borderRight: '1px solid rgba(0,0,0,0.05)', background: '#0d1117',
          }}>
            <div style={{ color: '#7d8590', fontSize: '10px', fontWeight: '700', letterSpacing: '0.05em', marginBottom: '8px', textTransform: 'uppercase' }}>原始 Markdown</div>
            <pre style={{
              margin: 0, fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
              fontSize: '11.5px', lineHeight: '1.7', color: '#e6edf3',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>{markdown}</pre>
          </div>
          <div style={{ overflowY: 'auto', padding: '16px' }}>
            <div style={{ color: '#8e8e93', fontSize: '10px', fontWeight: '700', letterSpacing: '0.05em', marginBottom: '8px', textTransform: 'uppercase' }}>渲染预览</div>
            <div
              style={{ fontSize: '13px', lineHeight: '1.7', color: '#1c1c1e' }}
              dangerouslySetInnerHTML={{ __html: renderedMd }}
            />
          </div>
        </div>
        {/* foot */}
        <div style={{
          padding: '10px 16px', borderTop: '1px solid rgba(0,0,0,0.05)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
        }}>
          <div style={{ fontSize: '11px', color: copied ? '#34c759' : '#8e8e93', fontWeight: copied ? '600' : '400' }}>
            {copied ? '✓ 已复制到剪贴板' : '点击复制即可粘贴到飞书 / Notion'}
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              onClick={() => setMdOpen(false)}
              style={{
                padding: '6px 12px', borderRadius: '8px', border: 'none',
                background: 'rgba(120,120,128,0.10)', color: '#3c3c43',
                fontSize: '12px', fontWeight: '600', cursor: 'pointer',
              }}
            >取消</button>
            <button
              onClick={copyMarkdown}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '5px',
                padding: '6px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                fontSize: '12px', fontWeight: '600', transition: 'all .15s',
                background: copied ? '#34c759' : '#007aff', color: '#fff',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"></path></svg>
              {copied ? '已复制' : '一键复制'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // ===== embed 模式：独立卡片 + 日期头 =====
  if (embed) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', height: '100%' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ fontSize: '15px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              width: '5px', height: '18px', borderRadius: '3px', background: '#007aff', flexShrink: 0,
            }}></span>
            每日总结
            <span style={{
              fontSize: '12px', fontWeight: '500', color: '#8e8e93',
              background: 'rgba(120,120,128,0.10)', padding: '2px 10px', borderRadius: '999px',
            }}>{toDisplayDate(date)}</span>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            {templateHeaderBtn}
            {onBack && (
              <button
                onClick={handleBack}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                  padding: '4px 10px', borderRadius: '8px',
                  border: 'none', cursor: 'pointer',
                  fontSize: '12px', fontWeight: '500',
                  color: '#007aff',
                  background: 'rgba(0,122,255,0.08)',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0,122,255,0.15)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(0,122,255,0.08)'}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6"></polyline>
                </svg>
                返回时间线
              </button>
            )}
          </div>
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {panelInner}
        </div>
        {mdDialog}
      </div>
    );
  }

  // ===== modal 模式（旧兼容 + 用户点击总结按钮弹窗）：直接输出内容 =====
  return (
    <div>
      {panelInner}
      {mdDialog}
    </div>
  );
}
