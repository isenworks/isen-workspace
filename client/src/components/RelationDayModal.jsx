import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Modal from './Modal.jsx';
import { today as getToday } from '../utils/date.js';
import { hexToRgba } from '../utils/color.js';

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
const mdOf = s => `${Number(s.slice(5, 7))}.${s.slice(8, 10)}`;
const weekdayOf = s => `周${WEEK[new Date(`${s}T00:00:00`).getDay()]}`;

/**
 * 单日记录弹窗（右击 / 长按日期格打开）
 *   一天一条记录，相处与心情在同一张卡里改完，避免在行内来回点。
 *   标签点选即存（和行内快捷选择同一套写入），备注在失焦或关闭时提交。
 */
export default function RelationDayModal({
  open, date, log, tags, moods, onPatch, onClose,
}) {
  const [tag, setTag] = useState('');
  const [mood, setMood] = useState('');
  const [note, setNote] = useState('');
  const [moodNote, setMoodNote] = useState('');
  const saved = useRef({ note: '', moodNote: '' });

  // 只在打开或切换日期时回填，标签改动引起的 log 更新不能覆盖正在输入的备注
  useEffect(() => {
    if (!open) return;
    setTag(log?.tag || '');
    setMood(log?.mood || '');
    setNote(log?.note || '');
    setMoodNote(log?.mood_note || '');
    saved.current = { note: log?.note || '', moodNote: log?.mood_note || '' };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, date]);

  // 待提交的备注（与已保存值比较，避免每次关闭都写一遍）
  function dirty() {
    const p = {};
    const n = note.trim();
    const mn = moodNote.trim();
    if (n !== saved.current.note) p.note = n;
    if (mn !== saved.current.moodNote) p.mood_note = mn;
    return p;
  }

  function commit(patch) {
    saved.current = { note: note.trim(), moodNote: moodNote.trim() };
    onPatch(date, patch);
  }

  function choose(field, key) {
    const cur = field === 'tag' ? tag : mood;
    const next = cur === key ? '' : key;
    if (field === 'tag') setTag(next); else setMood(next);
    commit({ ...dirty(), [field]: next });
  }

  function flush() {
    const p = dirty();
    if (Object.keys(p).length) commit(p);
  }

  function close() {
    flush();
    onClose();
  }

  const isToday = date === getToday();

  return createPortal(
    <Modal
      open={open}
      onClose={close}
      title={`${mdOf(date)} ${weekdayOf(date)}`}
      maxWidth={400}
      headerExtra={isToday ? <span className="text-[11.5px] text-ink-400">今天</span> : null}
    >
      <div className="flex flex-col gap-4">
        <Block
          title="相处"
          options={tags}
          value={tag}
          onPick={k => choose('tag', k)}
          note={note}
          onNote={setNote}
          onNoteBlur={flush}
          placeholder="那天发生了什么"
        />
        <Block
          title="心情"
          options={moods}
          value={mood}
          onPick={k => choose('mood', k)}
          note={moodNote}
          onNote={setMoodNote}
          onNoteBlur={flush}
          placeholder="心情的原因"
        />
      </div>

      <div className="flex items-center justify-between gap-2 mt-4 pt-3" style={{ borderTop: '1px solid rgba(60,60,67,0.08)' }}>
        <button
          type="button"
          onClick={() => { commit({ tag: '', mood: '', note: '', mood_note: '' }); onClose(); }}
          className="text-[12px] text-ink-300 hover:text-[var(--danger)] transition"
        >清除当天</button>
        <button
          type="button"
          onClick={close}
          className="h-8 px-4 rounded-lg text-[12.5px] font-semibold transition active:scale-95"
          style={{ color: '#fff', background: 'var(--m-life)' }}
        >完成</button>
      </div>
    </Modal>,
    document.body
  );
}

function Block({ title, options, value, onPick, note, onNote, onNoteBlur, placeholder }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[12px] font-semibold text-ink-500">{title}</span>
        <span className="text-[10.5px] text-ink-300">再点一次取消</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map(o => {
          const on = value === o.key;
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => onPick(o.key)}
              className="h-6 px-2 rounded-md text-[11.5px] font-semibold transition active:scale-95"
              style={on
                ? { color: o.color, background: hexToRgba(o.color, 0.14), border: `1px solid ${hexToRgba(o.color, 0.45)}` }
                : { color: 'var(--text-2)', background: 'rgba(120,120,128,0.08)', border: '1px solid transparent' }}
            >{o.label}</button>
          );
        })}
      </div>
      <textarea
        value={note}
        onChange={e => onNote(e.target.value)}
        onBlur={onNoteBlur}
        placeholder={placeholder}
        maxLength={200}
        rows={2}
        className="mt-2 w-full resize-none rounded-lg px-2.5 py-2 text-[12.5px] leading-5 outline-none"
        style={{ background: 'rgba(120,120,128,0.07)', border: '1px solid rgba(60,60,67,0.1)' }}
      />
    </div>
  );
}
