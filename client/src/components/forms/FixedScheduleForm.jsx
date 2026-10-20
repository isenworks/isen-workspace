import { useState } from 'react';
import { useFormSubmit } from '../../utils/formSubmitBus.js';
import { API } from '../../api/client.js';
import { store } from '../../utils/store.js';
import { useToast } from '../../context/ToastContext.jsx';
import ConfirmAlert from '../ConfirmAlert.jsx';
import FriendlyTimeInput from '../FriendlyTimeInput.jsx';
import { calcDurationMin, formatDuration } from '../../utils/date.js';

const INPUT_STYLE = {
  width: '100%',
  padding: '8px 12px',
  border: '1px solid var(--ink-200)',
  borderRadius: '9px',
  fontSize: '14px',
  color: 'var(--text-1)',
  background: 'var(--surface-card)',
  outline: 'none',
  transition: 'all .15s',
  boxSizing: 'border-box'
};

const LABEL_STYLE = {
  display: 'block',
  fontSize: '11px',
  fontWeight: '600',
  color: 'var(--text-muted)',
  marginBottom: '5px',
  textTransform: 'uppercase',
  letterSpacing: '0.03em'
};

const BTN_GHOST = {
  padding: '6px 14px',
  borderRadius: '9px',
  fontSize: '13px',
  fontWeight: '600',
  background: 'rgba(120,120,128,0.12)',
  color: 'var(--text-1)',
  border: 'none',
  cursor: 'pointer',
  transition: 'all .15s'
};

const BTN_PRIMARY = {
  padding: '6px 14px',
  borderRadius: '9px',
  fontSize: '13px',
  fontWeight: '600',
  background: 'var(--s-main)',
  color: 'var(--surface-card)',
  border: 'none',
  cursor: 'pointer',
  transition: 'all .15s',
  boxShadow: '0 3px 8px rgba(var(--s-rgb),0.25)'
};

const EMOJI_PRESETS = ['📌', '🍚', '🍱', '😴', '☕️', '🌙', '🚶', '🧘', '💪', '📖', '💧', '🍎'];

/* 用户自己添加过的图标：本机记忆（与筛选位、布局偏好同一套 localStorage 惯例），
   添加即收藏，右击移除；只存非预设的 emoji，最多 12 个，超出挤掉最旧的。 */
const LS_CUSTOM_EMOJI = 'fixed_sched_custom_emojis';
const MAX_CUSTOM_EMOJI = 12;
function readCustomEmojis() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_CUSTOM_EMOJI) || '[]');
    return Array.isArray(raw)
      ? raw.filter(e => typeof e === 'string' && e && !EMOJI_PRESETS.includes(e)).slice(0, MAX_CUSTOM_EMOJI)
      : [];
  } catch { return []; }
}

/* ===== 自由图标（任意 emoji）=====
   预设只有 12 个，这里放开限制：用户点「＋」打开输入框，输入/粘贴任意 emoji 即可使用。
   pickEmoji 会把输入里第一个 emoji 取出来（按字素簇切分，天然支持 ZWJ 组合、肤色修饰、
   区域旗帜这类多码位 emoji，如 👨‍👩‍👧 / 👍🏻 / 🇨🇳），避免把多余文字一起存进数据库。 */
const EMOJI_RE = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;
function pickEmoji(text) {
  const s = String(text || '').trim();
  if (!s) return '';
  const segs = typeof Intl !== 'undefined' && Intl.Segmenter
    ? Array.from(new Intl.Segmenter('zh', { granularity: 'grapheme' }).segment(s), x => x.segment)
    : Array.from(s);
  return segs.find(g => EMOJI_RE.test(g)) || '';
}

const iconTile = (active, dashed) => ({
  width: '34px', height: '34px',
  borderRadius: '8px',
  fontSize: '18px',
  background: active ? 'rgba(var(--s-rgb),0.1)' : 'var(--surface-card)',
  border: active ? '1.5px solid var(--s-main)' : (dashed ? '1px dashed var(--ink-300)' : '1px solid var(--ink-200)'),
  cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  transition: 'all .15s',
});

export default function FixedScheduleForm({ initial, onSaved, onCancel }) {
  const toast = useToast();
  const [form, setForm] = useState({
    name: initial?.name || '',
    emoji: initial?.emoji || '📌',
    start_time: initial?.start_time || '',
    end_time: initial?.end_time || '',
  });
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false); // 「＋」自由输入面板开关
  const [customDraft, setCustomDraft] = useState('');  // 输入框原文（可能夹带文字）
  const [customEmojis, setCustomEmojis] = useState(readCustomEmojis); // 已收藏的自定义图标

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  const durMin = calcDurationMin(form.start_time, form.end_time);

  // 当前图标不在预设里 → 视为自定义（遗留数据可能未收藏，并入展示清单，否则用户看不到、也改不回来）
  const customEmoji = EMOJI_PRESETS.includes(form.emoji) ? '' : (form.emoji || '');
  const customTiles = customEmoji && !customEmojis.includes(customEmoji)
    ? [customEmoji, ...customEmojis]
    : customEmojis;
  const draftEmoji = pickEmoji(customDraft);

  function writeCustomEmojis(next) {
    setCustomEmojis(next);
    try { localStorage.setItem(LS_CUSTOM_EMOJI, JSON.stringify(next)); } catch {}
  }

  // 添加即收藏：已收藏过的提到最前，超出上限挤掉最旧的
  function collectEmoji(em) {
    if (EMOJI_PRESETS.includes(em)) return;
    writeCustomEmojis([em, ...customEmojis.filter(x => x !== em)].slice(0, MAX_CUSTOM_EMOJI));
  }

  // 右击移除收藏；若删的正是当前选中的图标，回落到默认图标，保证「删掉了」有可见反馈
  function removeEmoji(em) {
    writeCustomEmojis(customEmojis.filter(x => x !== em));
    if (form.emoji === em) set('emoji', EMOJI_PRESETS[0]);
    toast.info(`已移除图标 ${em}`);
  }

  function toggleCustom() {
    if (customOpen) { setCustomOpen(false); return; }
    setCustomDraft(customEmoji); // 再次打开时预填当前自定义图标，便于修改
    setCustomOpen(true);
  }

  function applyCustom() {
    const em = pickEmoji(customDraft);
    if (!em) return toast.warn('请先输入或粘贴一个 emoji');
    set('emoji', em);
    collectEmoji(em);
    setCustomDraft('');
    setCustomOpen(false);
  }

  // Ctrl+S 优先提交本表单（无表单打开时 Ctrl+S 才走全局同步）
  useFormSubmit(submit);

  async function submit() {
    if (!form.name.trim()) return toast.warn('请输入日程名称');
    if (!form.start_time) return toast.warn('请选择开始时间');
    if (!form.end_time) return toast.warn('请选择结束时间');
    if (durMin == null || durMin <= 0) return toast.warn('结束时间必须晚于开始时间');

    setBusy(true);
    try {
      const payload = {
        name: form.name.trim(),
        emoji: form.emoji || '📌',
        startTime: form.start_time,
        endTime: form.end_time,
        sortOrder: initial?.sort_order || 0,
      };
      if (initial?.id) await API.fixedSchedules.update(initial.id, payload);
      else await API.fixedSchedules.create(payload);
      store.broadcast({ type: 'reload' });
      onSaved?.();
    } catch (e) { toast.error(e.message); }
    setBusy(false);
  }

  async function remove() {
    if (!initial?.id) return;
    setConfirmOpen(true);
  }

  async function doRemove() {
    if (!initial?.id) return;
    setConfirmOpen(false);
    setBusy(true);
    try {
      await API.fixedSchedules.remove(initial.id);
      store.broadcast({ type: 'reload' });
      onSaved?.();
    } catch (e) { toast.error(e.message); }
    setBusy(false);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* 提示说明 */}
      <div style={{
        padding: '10px 12px',
        background: 'linear-gradient(90deg, rgba(142,142,147,0.08) 0%, transparent 65%)',
        borderRadius: '10px',
        fontSize: '12px',
        color: 'var(--text-3)',
        lineHeight: '1.5',
      }}>
        <span style={{ fontWeight: '600', color: 'var(--text-3)' }}>📌 固定日程</span>
        <span> · 每天重复显示在时间线，仅作提醒，不可打卡，不进入重点/习惯事项</span>
      </div>

      <div>
        <label style={LABEL_STYLE}>日程名称</label>
        <input
          className="form-input"
          style={{ ...INPUT_STYLE, fontWeight: '500' }}
          value={form.name}
          onChange={e => set('name', e.target.value)}
          placeholder="例如：吃午饭"
          autoFocus
        />
      </div>

      <div>
        <label style={LABEL_STYLE}>图标</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {EMOJI_PRESETS.map(em => {
            const active = form.emoji === em;
            return (
              <button
                key={em}
                type="button"
                onClick={() => set('emoji', em)}
                style={iconTile(active)}
              >{em}</button>
            );
          })}

          {/* 我的图标：自己添加过的 emoji（本机记忆）—— 点击使用，右击移除 */}
          {customTiles.map(em => (
            <button
              key={em}
              type="button"
              onClick={() => set('emoji', em)}
              onContextMenu={e => { e.preventDefault(); removeEmoji(em); }}
              title="点击使用 · 右击移除"
              style={iconTile(form.emoji === em)}
            >{em}</button>
          ))}

          {/* ＋：自由添加任意 emoji */}
          <button
            type="button"
            onClick={toggleCustom}
            title="添加任意 emoji（自动收藏）"
            style={{ ...iconTile(customOpen, true), color: customOpen ? 'var(--s-main)' : 'var(--text-3)' }}
          >＋</button>
        </div>

        {customOpen && (
          <div style={{
            marginTop: '8px',
            padding: '10px 12px',
            borderRadius: '10px',
            background: 'var(--surface-card)',
            border: '1px solid var(--ink-200)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ ...iconTile(false), cursor: 'default', flexShrink: 0 }}>
                {draftEmoji || <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>?</span>}
              </div>
              <input
                className="form-input"
                autoFocus
                value={customDraft}
                onChange={e => setCustomDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); applyCustom(); }
                  else if (e.key === 'Escape') { e.stopPropagation(); setCustomOpen(false); }
                }}
                placeholder="粘贴或输入任意 emoji，如 🔥 💼 ✈️"
                style={{ ...INPUT_STYLE, flex: 1 }}
              />
              <button
                type="button"
                onClick={applyCustom}
                disabled={!draftEmoji}
                style={{
                  ...BTN_PRIMARY,
                  flexShrink: 0,
                  opacity: draftEmoji ? 1 : 0.45,
                  cursor: draftEmoji ? 'pointer' : 'not-allowed',
                }}
              >使用</button>
            </div>
            <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--text-3)', lineHeight: '1.6' }}>
              添加后自动收进「我的图标」（本机记忆，最多 {MAX_CUSTOM_EMOJI} 个），右击任一图标即可移除。<br />
              桌面端可先打开系统表情面板再选：Windows 按 <b>Win + .</b>，macOS 按 <b>⌘ + Ctrl + 空格</b>。
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div>
          <label style={LABEL_STYLE}>开始时间</label>
          <FriendlyTimeInput
            value={form.start_time}
            onChange={v => set('start_time', v)}
            placeholder="几点开始？"
          />
        </div>
        <div>
          <label style={LABEL_STYLE}>结束时间</label>
          <FriendlyTimeInput
            value={form.end_time}
            onChange={v => set('end_time', v)}
            placeholder="几点结束？"
          />
        </div>
      </div>

      {durMin != null && durMin > 0 && (
        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          时长：<span style={{ color: 'var(--s-main)', fontWeight: '600' }}>{formatDuration(durMin)}</span>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', paddingTop: '8px' }}>
        <div>
          {initial?.id && (
            <button
              onClick={remove}
              disabled={busy}
              style={{
                ...BTN_GHOST,
                color: 'var(--danger)',
                background: 'rgba(255,59,48,0.08)',
                opacity: busy ? 0.5 : 1,
                cursor: busy ? 'not-allowed' : 'pointer',
              }}
            >删除</button>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={onCancel} style={BTN_GHOST}>取消</button>
          <button
            onClick={submit}
            disabled={busy}
            style={{
              ...BTN_PRIMARY,
              opacity: busy ? 0.5 : 1,
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            {busy ? '保存中...' : '保存'}
          </button>
        </div>
      </div>

      {confirmOpen && (
        <ConfirmAlert
          danger
          title="删除确认"
          message={`确认删除固定日程「${initial?.name || ''}」？`}
          confirmText="删除"
          onConfirm={doRemove}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </div>
  );
}
