'use client';

import { tx } from "@/lib/i18n";
import { useEffect, useRef } from 'react';

const CDN_JS  = 'https://iam.example.com/portal/bb_plugin/js/datepicker-full-TH.min.js';
const CDN_CSS = 'https://iam.example.com/portal/bb_plugin/css/datepicker-full-TH.min.css';

const TH_LOCALE = {
  days:        [tx("อาทิตย์"),tx("จันทร์"),tx("อังคาร"),tx("พุธ"),tx("พฤหัส"),tx("ศุกร์"),tx("เสาร์"),tx("อาทิตย์")],
  daysShort:   [tx("อา"),tx("จ"),tx("อ"),tx("พ"),tx("พฤ"),tx("ศ"),tx("ส"),tx("อา")],
  daysMin:     [tx("อา"),tx("จ"),tx("อ"),tx("พ"),tx("พฤ"),tx("ศ"),tx("ส"),tx("อา")],
  months:      [tx("มกราคม"),tx("กุมภาพันธ์"),tx("มีนาคม"),tx("เมษายน"),tx("พฤษภาคม"),tx("มิถุนายน"),tx("กรกฎาคม"),tx("สิงหาคม"),tx("กันยายน"),tx("ตุลาคม"),tx("พฤศจิกายน"),tx("ธันวาคม")],
  monthsShort: [tx("ม.ค."),tx("ก.พ."),tx("มี.ค."),tx("เม.ย."),tx("พ.ค."),tx("มิ.ย."),tx("ก.ค."),tx("ส.ค."),tx("ก.ย."),tx("ต.ค."),tx("พ.ย."),tx("ธ.ค.")],
  today:       tx("วันนี้"),
};

interface Props {
  value: string;       // ISO yyyy-mm-dd (AD) — '' if empty
  onChange: (iso: string) => void;
  className?: string;
  disabled?: boolean;
}

function isoToDate(iso: string): Date | null {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return isNaN(date.getTime()) ? null : date;
}

function parseBEText(text: string): string {
  const match = text.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return '';
  const d   = match[1].padStart(2, '0');
  const mon = match[2].padStart(2, '0');
  const y   = Number(match[3]) - 543;
  if (y < 1900 || y > 2100) return '';
  return `${y}-${mon}-${d}`;
}

export default function ThaiDatePicker({ value, onChange, className, disabled }: Props) {
  const inputRef    = useRef<HTMLInputElement>(null);
  const pickerRef   = useRef<any>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!document.querySelector(`link[href="${CDN_CSS}"]`)) {
      const link = document.createElement('link');
      link.rel  = 'stylesheet';
      link.href = CDN_CSS;
      document.head.appendChild(link);
    }

    function init() {
      if (!inputRef.current) return;
      const W = window as any;
      if (!W.Datepicker) return;

      W.Datepicker.locales.th = TH_LOCALE;

      pickerRef.current = new W.Datepicker(inputRef.current, {
        language: 'th',
        todayBtn: false,
        clearBtn: true,
        maxNumberOfDates: 1,
        format: {
          toValue(dateStr: string) { return new Date(dateStr); },
          toDisplay(date: Date) {
            const d   = String(date.getDate()).padStart(2, '0');
            const mon = String(date.getMonth() + 1).padStart(2, '0');
            return `${d}/${mon}/${date.getFullYear() + 543}`;
          },
        },
      });

      inputRef.current.addEventListener('changeDate', (e: Event) => {
        const date = (e as any).detail?.date;
        if (date instanceof Date && !isNaN(date.getTime())) {
          const y   = date.getFullYear();
          const mon = String(date.getMonth() + 1).padStart(2, '0');
          const d   = String(date.getDate()).padStart(2, '0');
          onChangeRef.current(`${y}-${mon}-${d}`);
        } else {
          onChangeRef.current('');
        }
      });

      inputRef.current.addEventListener('blur', () => {
        if (!inputRef.current) return;
        const iso = parseBEText(inputRef.current.value);
        onChangeRef.current(iso);
      });

      const date = isoToDate(value);
      if (date) pickerRef.current.setDate(date);
    }

    const W = window as any;
    if (W.Datepicker) {
      init();
    } else {
      const existing = document.querySelector(`script[src="${CDN_JS}"]`) as HTMLScriptElement | null;
      if (existing) {
        existing.addEventListener('load', init);
      } else {
        const script = document.createElement('script');
        script.src    = CDN_JS;
        script.onload = init;
        document.head.appendChild(script);
      }
    }

    return () => {
      pickerRef.current?.destroy();
      pickerRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!pickerRef.current) return;
    const date = isoToDate(value);
    if (date) {
      pickerRef.current.setDate(date);
    } else {
      try { pickerRef.current.setDate([], { clear: true }); } catch { /* ignore */ }
    }
  }, [value]);

  return (
    <input
      ref={inputRef}
      type="text"
      className={className}
      placeholder={tx("วว/ดด/ปปปป")}
      autoComplete="off"
      disabled={disabled}
    />
  );
}
