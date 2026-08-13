"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

type DropdownProps = {
  /** Conteúdo do botão que abre o painel. */
  trigger: ReactNode;
  triggerLabel: string;
  triggerClassName?: string;
  panelClassName?: string;
  align?: "start" | "end";
  children: ReactNode | ((helpers: { close: () => void }) => ReactNode);
};

/**
 * Menu suspenso acessível e sem dependências externas.
 * Fecha ao clicar fora, ao pressionar Esc e ao trocar de rota.
 */
export function Dropdown({
  trigger,
  triggerLabel,
  triggerClassName,
  panelClassName,
  align = "end",
  children,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();

  // Fecha o painel ao navegar, ajustando o estado durante a renderização
  // em vez de num efeito — evita um segundo passe de render.
  const [renderedPathname, setRenderedPathname] = useState(pathname);
  if (pathname !== renderedPathname) {
    setRenderedPathname(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={triggerLabel}
        onClick={() => setOpen((current) => !current)}
        className={cn("group", triggerClassName)}
      >
        {trigger}
      </button>

      {open ? (
        <div
          role="menu"
          aria-label={triggerLabel}
          className={cn(
            "absolute top-[calc(100%+0.5rem)] z-50 origin-top rounded-xl border border-graphite-200 bg-white shadow-popover animate-pop-in",
            align === "end" ? "right-0" : "left-0",
            panelClassName,
          )}
        >
          {typeof children === "function"
            ? children({ close: () => setOpen(false) })
            : children}
        </div>
      ) : null}
    </div>
  );
}
