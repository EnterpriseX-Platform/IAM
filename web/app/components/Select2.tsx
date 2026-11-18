"use client";

// ตัวเลือกเยอะหรือล้างค่าได้ = ComboBox (พิมพ์ค้นได้) · ตัวเลือกน้อยและต้องมีค่าเสมอ = Dropdown
// props เดิมคงไว้ จอที่ใช้ <Select2> ไม่ต้องแก้
import { tx } from "@/lib/i18n";
import { ComboBox, Dropdown } from "@carbon/react";
import { useId } from "react";

export interface Select2Option {
  value: string;
  label: string;
}

interface Select2Props {
  value?: string;
  onChange?: (v: string) => void;
  options: Select2Option[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** false = ไม่มีปุ่ม × ล้างค่า (ช่องที่ต้องมีค่าเสมอ เช่น สถานะ) */
  clearable?: boolean;
}

export default function Select2({
  value, onChange, options, placeholder = tx("เลือก..."), disabled = false, className = "", clearable = true,
}: Select2Props) {
  const id = useId();
  const items = options.filter((o) => o.value !== "" || !clearable);
  const selected = options.find((o) => o.value === (value ?? "")) ?? null;
  const label = (o: Select2Option | null) => (o ? o.label : "");

  if (!clearable && options.length <= 8) {
    return (
      <div className={`iamx-select ${className}`}>
        <Dropdown
          id={id}
          size="md"
          titleText=""
          hideLabel
          label={placeholder}
          items={options}
          itemToString={label}
          selectedItem={selected}
          disabled={disabled}
          onChange={({ selectedItem }: { selectedItem: Select2Option | null }) => onChange?.(selectedItem?.value ?? "")}
        />
      </div>
    );
  }
  return (
    <div className={`iamx-select ${className}`}>
      <ComboBox
        id={id}
        size="md"
        titleText=""
        placeholder={placeholder}
        items={items}
        itemToString={label}
        selectedItem={selected && selected.value !== "" ? selected : null}
        disabled={disabled}
        shouldFilterItem={({ item, inputValue }: { item: Select2Option; inputValue: string | null }) =>
          !inputValue || item.label.toLowerCase().includes(inputValue.toLowerCase()) || inputValue === item.label}
        onChange={({ selectedItem }: { selectedItem: Select2Option | null | undefined }) => onChange?.(selectedItem?.value ?? "")}
      />
    </div>
  );
}
