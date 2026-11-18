'use client';

import { useEffect, useRef, useState } from 'react';

interface Option {
  value: string;
  label: string;
}

interface SingleProps {
  multi?: false;
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

interface MultiProps {
  multi: true;
  options: Option[];
  values: string[];
  onChangeMulti: (values: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}

type Props = SingleProps | MultiProps;

const DROPDOWN_HEIGHT = 280;

export default function SearchableSelect(props: Props) {
  const { options, placeholder = '-- เลือก --', disabled = false } = props;
  const isMulti = props.multi === true;

  const selectedValues: string[] = isMulti ? (props as MultiProps).values : [];
  const singleValue: string = !isMulti ? (props as SingleProps).value : '';

  const [open, setOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredRaw = query.trim()
    ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;
  const filtered = isMulti
    ? [
        ...filteredRaw.filter(o => selectedValues.includes(o.value)),
        ...filteredRaw.filter(o => !selectedValues.includes(o.value)),
      ]
    : filteredRaw;

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function handleToggle() {
    if (disabled) return;
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setOpenUpward(window.innerHeight - rect.bottom < DROPDOWN_HEIGHT);
    }
    setOpen(o => !o);
    if (!open) setQuery('');
  }

  function handleSelect(opt: Option) {
    if (isMulti) {
      const current = (props as MultiProps).values;
      const next = current.includes(opt.value)
        ? current.filter(v => v !== opt.value)
        : [...current, opt.value];
      (props as MultiProps).onChangeMulti(next);
    } else {
      (props as SingleProps).onChange(opt.value);
      setOpen(false);
      setQuery('');
    }
  }

  function renderTriggerContent() {
    if (isMulti) {
      const sel = selectedValues;
      if (sel.length === 0) return <span style={{ color: '#94a3b8' }}>{placeholder}</span>;
      const labels = sel.map(v => options.find(o => o.value === v)?.label ?? v);
      if (sel.length <= 2) {
        return (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, flex: 1, minWidth: 0 }}>
            {labels.map((lbl, i) => (
              <span key={sel[i]} style={{
                background: '#e0ecf8', color: '#003D60', borderRadius: 4,
                padding: '1px 8px', fontSize: 12, fontWeight: 500,
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                {lbl}
                <span
                  onMouseDown={e => { e.stopPropagation(); (props as MultiProps).onChangeMulti(selectedValues.filter(v => v !== sel[i])); }}
                  style={{ cursor: 'pointer', opacity: 0.6, fontWeight: 700, fontSize: 13, lineHeight: 1 }}
                >×</span>
              </span>
            ))}
          </div>
        );
      }
      return <span style={{ color: '#000', fontWeight: 500 }}>เลือก {sel.length} รายการ</span>;
    } else {
      const selected = options.find(o => o.value === singleValue);
      return (
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: selected ? '#000' : '#94a3b8' }}>
          {selected ? selected.label : placeholder}
        </span>
      );
    }
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <div
        ref={triggerRef}
        onClick={handleToggle}
        style={{
          padding: '7px 12px',
          border: `1px solid ${open ? '#003D60' : '#d1d5db'}`,
          borderRadius: 8,
          fontSize: 14,
          fontFamily: 'inherit',
          background: disabled ? '#f9fafb' : '#fff',
          cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          userSelect: 'none',
          transition: 'border-color 0.2s',
          minHeight: 38,
        }}
      >
        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center' }}>
          {renderTriggerContent()}
        </div>
        <svg
          width="14" height="14" viewBox="0 0 14 14" fill="none"
          style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}
        >
          <path d="M2 4l5 5 5-5" stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      {open && (
        <div
          style={{
            position: 'fixed',
            width: triggerRef.current ? triggerRef.current.getBoundingClientRect().width : '100%',
            left: triggerRef.current ? triggerRef.current.getBoundingClientRect().left : 0,
            ...(openUpward
              ? { bottom: window.innerHeight - (triggerRef.current?.getBoundingClientRect().top ?? 0) + 4 }
              : { top: (triggerRef.current?.getBoundingClientRect().bottom ?? 0) + 4 }),
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            zIndex: 99999,
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9' }}>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="ค้นหา..."
              style={{
                width: '100%', padding: '7px 10px',
                border: '1px solid #e2e8f0', borderRadius: 6,
                fontSize: 13, fontFamily: 'inherit',
                outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '10px 14px', fontSize: 13, color: '#94a3b8' }}>ไม่พบข้อมูล</div>
            ) : (
              filtered.map(opt => {
                const isSelected = isMulti ? selectedValues.includes(opt.value) : opt.value === singleValue;
                return (
                  <div
                    key={opt.value}
                    onMouseDown={() => handleSelect(opt)}
                    style={{
                      padding: '9px 14px',
                      fontSize: 14,
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                      background: isSelected ? '#e0ecf8' : '#fff',
                      color: '#000',
                      fontWeight: isSelected ? 600 : 400,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = '#f8fafc'; }}
                    onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = '#fff'; }}
                  >
                    {isMulti && (
                      <span style={{
                        width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                        border: `2px solid ${isSelected ? '#003D60' : '#cbd5e1'}`,
                        background: isSelected ? '#003D60' : '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {isSelected && (
                          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                            <path d="M1 4l3 3 5-6" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </span>
                    )}
                    {opt.label}
                  </div>
                );
              })
            )}
          </div>

          {isMulti && (
            <div style={{ padding: '8px 12px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: '#64748b' }}>
                {selectedValues.length > 0 ? `เลือกแล้ว ${selectedValues.length} รายการ` : 'ยังไม่ได้เลือก'}
              </span>
              <button
                type="button"
                onMouseDown={e => { e.stopPropagation(); setOpen(false); setQuery(''); }}
                style={{
                  fontSize: 12, padding: '4px 12px', borderRadius: 6,
                  border: '1px solid #003D60', background: '#003D60',
                  color: '#fff', cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                ตกลง
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
