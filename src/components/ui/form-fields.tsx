"use client";

import { useId, useState, type ComponentProps, type ReactNode } from "react";

import { inputBaseClass, inputErrorClass } from "@/components/ui/text-field";
import {
  formatDate,
  formatDecimal,
  maskCurrencyInput,
  maskPercentInput,
  parseCurrencyInput,
  parsePercentInput,
} from "@/lib/stores/format";
import { cn } from "@/lib/utils";

/** Rótulo + mensagem de apoio/erro, compartilhado pelos campos abaixo. */
function FieldShell({
  id,
  label,
  optional,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  optional?: boolean;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="flex items-baseline gap-1.5 text-sm font-medium text-graphite-800"
      >
        {label}
        {optional ? (
          <span className="text-xs font-normal text-graphite-400">
            (opcional)
          </span>
        ) : null}
      </label>

      {children}

      {error ? (
        <p id={`${id}-message`} className="text-xs font-medium text-red-600">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-message`} className="text-xs text-graphite-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

type SelectFieldProps = Omit<ComponentProps<"select">, "id"> & {
  label: string;
  optional?: boolean;
  hint?: ReactNode;
  error?: string;
};

export function SelectField({
  label,
  optional,
  hint,
  error,
  className,
  children,
  ...props
}: SelectFieldProps) {
  const id = useId();

  return (
    <FieldShell id={id} label={label} optional={optional} hint={hint} error={error}>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={hint || error ? `${id}-message` : undefined}
        className={cn(
          inputBaseClass,
          "cursor-pointer appearance-none bg-[length:1.1rem] bg-[right_0.75rem_center] bg-no-repeat pr-10",
          // Seta desenhada em SVG para não depender da renderização do sistema.
          "bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20fill%3D%22none%22%20viewBox%3D%220%200%2024%2024%22%20stroke-width%3D%222%22%20stroke%3D%22%239aa3ac%22%3E%3Cpath%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20d%3D%22m6%209%206%206%206-6%22/%3E%3C/svg%3E')]",
          error && inputErrorClass,
          className,
        )}
        {...props}
      >
        {children}
      </select>
    </FieldShell>
  );
}

type TextareaFieldProps = Omit<ComponentProps<"textarea">, "id"> & {
  label: string;
  optional?: boolean;
  hint?: ReactNode;
  error?: string;
};

export function TextareaField({
  label,
  optional,
  hint,
  error,
  className,
  rows = 3,
  ...props
}: TextareaFieldProps) {
  const id = useId();

  return (
    <FieldShell id={id} label={label} optional={optional} hint={hint} error={error}>
      <textarea
        id={id}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={hint || error ? `${id}-message` : undefined}
        className={cn(
          inputBaseClass,
          "h-auto resize-y py-2.5 leading-relaxed",
          error && inputErrorClass,
          className,
        )}
        {...props}
      />
    </FieldShell>
  );
}

type DateFieldProps = {
  name: string;
  label: string;
  defaultValue: string | null;
  error?: string;
};

/**
 * Data no formato ISO (coluna `date`).
 *
 * O `<input type="date">` renderiza no formato do idioma do navegador, não no
 * da página — num Chrome em inglês apareceria mm/dd/yyyy. O eco em dd/mm/aaaa
 * abaixo do campo elimina a ambiguidade sem abrir mão do seletor nativo,
 * que é bem melhor no celular.
 */
export function DateField({
  name,
  label,
  defaultValue,
  error,
}: DateFieldProps) {
  const id = useId();
  const [value, setValue] = useState(defaultValue ?? "");

  return (
    <FieldShell
      id={id}
      label={label}
      optional
      error={error}
      hint={value ? formatDate(value) : "Nenhuma data selecionada."}
    >
      <input
        id={id}
        name={name}
        type="date"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-message`}
        className={cn(inputBaseClass, error && inputErrorClass)}
      />
    </FieldShell>
  );
}

type AdornedInputProps = {
  name: string;
  label: string;
  defaultValue: number | null;
  error?: string;
  hint?: ReactNode;
  placeholder?: string;
};

/**
 * Valor monetário em reais.
 *
 * O usuário digita só dígitos e a máscara os interpreta como centavos.
 * O que é enviado no form é sempre o número normalizado, não o texto.
 */
export function CurrencyField({
  name,
  label,
  defaultValue,
  error,
  hint,
  placeholder = "0,00",
}: AdornedInputProps) {
  const id = useId();
  const [display, setDisplay] = useState(() =>
    defaultValue === null ? "" : formatDecimal(defaultValue),
  );

  const numericValue = parseCurrencyInput(display);

  return (
    <FieldShell id={id} label={label} optional hint={hint} error={error}>
      <div className="relative">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-sm text-graphite-500"
        >
          R$
        </span>
        <input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          value={display}
          placeholder={placeholder}
          onChange={(event) => setDisplay(maskCurrencyInput(event.target.value))}
          aria-invalid={error ? true : undefined}
          aria-describedby={hint || error ? `${id}-message` : undefined}
          className={cn(inputBaseClass, "pl-10", error && inputErrorClass)}
        />
        <input
          type="hidden"
          name={name}
          value={numericValue === null ? "" : String(numericValue)}
        />
      </div>
    </FieldShell>
  );
}

/**
 * Percentual de comissão.
 *
 * O banco guarda o número inteiro do percentual (3 = 3%), então o valor
 * exibido e o persistido são o mesmo — só muda o separador decimal.
 */
export function PercentField({
  name,
  label,
  defaultValue,
  error,
  hint,
  placeholder = "0",
}: AdornedInputProps) {
  const id = useId();
  const [display, setDisplay] = useState(() =>
    defaultValue === null ? "" : String(defaultValue).replace(".", ","),
  );

  const numericValue = parsePercentInput(display);

  return (
    <FieldShell id={id} label={label} optional hint={hint} error={error}>
      <div className="relative">
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          value={display}
          placeholder={placeholder}
          onChange={(event) => setDisplay(maskPercentInput(event.target.value))}
          aria-invalid={error ? true : undefined}
          aria-describedby={hint || error ? `${id}-message` : undefined}
          className={cn(inputBaseClass, "pr-9", error && inputErrorClass)}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-sm text-graphite-500"
        >
          %
        </span>
        <input
          type="hidden"
          name={name}
          value={numericValue === null ? "" : String(numericValue)}
        />
      </div>
    </FieldShell>
  );
}
