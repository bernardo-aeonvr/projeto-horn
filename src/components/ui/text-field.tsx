"use client";

import { Eye, EyeOff } from "lucide-react";
import { useId, useState, type ComponentProps, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Aparência compartilhada por todos os controles de formulário do sistema. */
export const inputBaseClass = cn(
  "h-11 w-full rounded-lg border border-graphite-200 bg-white px-3.5 text-sm text-graphite-900",
  "placeholder:text-graphite-400",
  "transition-colors hover:border-graphite-300",
  "focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/20",
  "disabled:cursor-not-allowed disabled:bg-graphite-50 disabled:text-graphite-500",
);

/** Sobreposição aplicada quando o campo tem erro de validação. */
export const inputErrorClass =
  "border-red-300 hover:border-red-400 focus:border-red-500 focus:ring-red-500/20";

type TextFieldProps = Omit<ComponentProps<"input">, "id"> & {
  label: string;
  /** Texto de apoio abaixo do campo. */
  hint?: ReactNode;
  /** Mensagem de validação. Quando presente, substitui o hint. */
  error?: string;
  /** Conteúdo alinhado à direita do rótulo (ex.: link "Esqueci minha senha"). */
  labelAction?: ReactNode;
};

export function TextField({
  label,
  hint,
  error,
  labelAction,
  className,
  type = "text",
  ...props
}: TextFieldProps) {
  const id = useId();
  const messageId = `${id}-message`;
  const [revealed, setRevealed] = useState(false);

  const isPassword = type === "password";
  const inputType = isPassword && revealed ? "text" : type;

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-graphite-800">
          {label}
        </label>
        {labelAction}
      </div>

      <div className="relative">
        <input
          id={id}
          type={inputType}
          aria-invalid={error ? true : undefined}
          aria-describedby={hint || error ? messageId : undefined}
          className={cn(
            inputBaseClass,
            isPassword && "pr-11",
            error && inputErrorClass,
            className,
          )}
          {...props}
        />

        {isPassword ? (
          <button
            type="button"
            onClick={() => setRevealed((current) => !current)}
            aria-label={revealed ? "Ocultar senha" : "Mostrar senha"}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-graphite-400 transition-colors hover:text-graphite-700"
          >
            {revealed ? (
              <EyeOff className="size-4.5" aria-hidden />
            ) : (
              <Eye className="size-4.5" aria-hidden />
            )}
          </button>
        ) : null}
      </div>

      {error ? (
        <p id={messageId} className="text-xs font-medium text-red-600">
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className="text-xs text-graphite-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
