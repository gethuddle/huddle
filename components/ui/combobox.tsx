"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type ComboboxOption = Readonly<{
  value: string;
  label: string;
  description?: string;
  keywords?: string;
  disabled?: boolean;
}>;

type ComboboxProps = Readonly<{
  label: string;
  options: readonly ComboboxOption[];
  value: string;
  onValueChange: (value: string) => void;
  onQueryChange?: (query: string) => void;
  className?: string;
  description?: string;
  disabled?: boolean;
  emptyText?: string;
  id?: string;
  name?: string;
  placeholder?: string;
  required?: boolean;
}>;

function normalized(value: string) {
  return value.trim().toLocaleLowerCase("en");
}

export function Combobox({
  className,
  description,
  disabled = false,
  emptyText = "No matching options.",
  id,
  label,
  name,
  onValueChange,
  onQueryChange,
  options,
  placeholder = "Search",
  required = false,
  value,
}: ComboboxProps) {
  const generatedId = useId();
  const inputId = id ?? `${generatedId}-input`;
  const listboxId = `${generatedId}-listbox`;
  const wrapper = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value) ?? null;
  const [editedQuery, setEditedQuery] = useState<string | null>(null);
  const query = editedQuery ?? selected?.label ?? "";
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const visibleOptions = useMemo(() => {
    const search = normalized(query);
    if (search.length === 0 || selected?.label === query) return options;
    return options.filter((option) =>
      normalized(`${option.label} ${option.description ?? ""} ${option.keywords ?? ""}`).includes(
        search,
      ),
    );
  }, [options, query, selected?.label]);

  const safeActiveIndex =
    visibleOptions.length === 0 ? -1 : Math.min(activeIndex, visibleOptions.length - 1);

  function select(option: ComboboxOption) {
    if (option.disabled) return;
    onValueChange(option.value);
    setEditedQuery(null);
    setOpen(false);
    setActiveIndex(-1);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setEditedQuery(null);
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((current) => {
        if (visibleOptions.length === 0) return -1;
        const currentVisibleIndex = Math.min(current, visibleOptions.length - 1);
        if (currentVisibleIndex < 0) return direction === 1 ? 0 : visibleOptions.length - 1;
        return (currentVisibleIndex + direction + visibleOptions.length) % visibleOptions.length;
      });
      return;
    }
    if (event.key === "Enter" && open && safeActiveIndex >= 0) {
      event.preventDefault();
      const option = visibleOptions[safeActiveIndex];
      if (option !== undefined) select(option);
    }
  }

  const activeOption = safeActiveIndex >= 0 ? visibleOptions[safeActiveIndex] : undefined;
  const activeId =
    activeOption === undefined ? undefined : `${listboxId}-option-${safeActiveIndex}`;

  return (
    <div
      className={cn("relative", className)}
      onBlur={(event) => {
        if (!wrapper.current?.contains(event.relatedTarget)) {
          setEditedQuery(null);
          setOpen(false);
          setActiveIndex(-1);
        }
      }}
      ref={wrapper}
    >
      <Label htmlFor={inputId}>{label}</Label>
      {description === undefined ? null : (
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      )}
      <Input
        aria-activedescendant={open ? activeId : undefined}
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-expanded={open}
        autoComplete="off"
        className="mt-2"
        disabled={disabled}
        id={inputId}
        onChange={(event) => {
          setEditedQuery(event.currentTarget.value);
          onQueryChange?.(event.currentTarget.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        required={required}
        role="combobox"
        value={query}
      />
      {name === undefined ? null : <input name={name} type="hidden" value={value} />}

      {open ? (
        <div
          aria-label={`${label} results`}
          className="absolute z-40 mt-2 max-h-72 w-full overflow-y-auto rounded-2xl border border-border bg-popover p-2 shadow-2xl"
          id={listboxId}
          role="listbox"
        >
          {visibleOptions.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground" role="status">
              {emptyText}
            </p>
          ) : (
            visibleOptions.map((option, index) => (
              <button
                aria-selected={option.value === value}
                className="block min-h-11 w-full rounded-xl px-3 py-2 text-left text-sm text-foreground outline-none hover:bg-muted focus-visible:bg-muted disabled:opacity-50 data-[active=true]:bg-muted"
                data-active={index === safeActiveIndex}
                disabled={option.disabled}
                id={`${listboxId}-option-${index}`}
                key={option.value}
                onClick={() => select(option)}
                onMouseDown={(event) => event.preventDefault()}
                role="option"
                type="button"
              >
                <span className="block font-semibold">{option.label}</span>
                {option.description === undefined ? null : (
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {option.description}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
