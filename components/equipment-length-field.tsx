"use client";

import { useEffect, useState } from "react";
import { Ruler } from "lucide-react";
import { EQUIPMENT_LENGTH_OPTIONS } from "@/lib/search-equipment";

type EquipmentLengthFieldProps = {
  id: string;
  value?: number | null;
  defaultValue?: number | null;
  onChange: (lengthFt: number) => void;
  className?: string;
  showChips?: boolean;
};

function normalizedInputValue(value?: number | null, fallback?: number | null) {
  const length = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return typeof length === "number" && Number.isFinite(length) ? String(length) : "";
}

export function EquipmentLengthField({
  id,
  value,
  defaultValue,
  onChange,
  className = "",
  showChips = false,
}: EquipmentLengthFieldProps) {
  const inputValue = normalizedInputValue(value, defaultValue);
  const [draftValue, setDraftValue] = useState(inputValue);
  const numericValue = Number(inputValue);

  useEffect(() => {
    setDraftValue(inputValue);
  }, [inputValue]);

  function updateDraft(nextValue: string) {
    setDraftValue(nextValue);
    if (nextValue.trim() === "") return;
    const parsed = Number.parseInt(nextValue, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    onChange(Math.min(80, Math.max(1, parsed)));
  }

  function normalizeDraft() {
    const parsed = Number.parseInt(draftValue, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setDraftValue(inputValue);
      return;
    }
    const clamped = Math.min(80, Math.max(1, parsed));
    setDraftValue(String(clamped));
    onChange(clamped);
  }

  return (
    <div className={`rounded-md bg-stone-50 px-3 py-2 ring-1 ring-stone-200 transition focus-within:bg-white focus-within:ring-forest-600 ${className}`}>
      <label htmlFor={id} className="mb-0.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-stone-500">
        <Ruler size={12} /> Length
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="number"
          min={1}
          max={80}
          inputMode="numeric"
          list={`${id}-suggestions`}
          className="w-full min-w-0 bg-transparent text-sm font-semibold text-stone-950 outline-none"
          value={draftValue}
          onChange={(event) => updateDraft(event.target.value)}
          onBlur={normalizeDraft}
          aria-label="Equipment length in feet"
        />
        <span className="shrink-0 text-xs font-semibold text-stone-500">ft</span>
      </div>
      <datalist id={`${id}-suggestions`}>
        {EQUIPMENT_LENGTH_OPTIONS.map((length) => (
          <option key={length} value={length} />
        ))}
      </datalist>
      {showChips && (
        <div className="mt-2 flex flex-wrap gap-1">
          {EQUIPMENT_LENGTH_OPTIONS.map((length) => {
            const active = numericValue === length;
            return (
              <button
                key={length}
                type="button"
                onClick={() => onChange(length)}
                className={`h-7 rounded-md px-2 text-xs font-semibold ring-1 transition ${
                  active
                    ? "bg-forest-700 text-white ring-forest-700"
                    : "bg-white text-stone-700 ring-stone-200 hover:bg-stone-100"
                }`}
              >
                {length === 40 ? "40+" : length}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
