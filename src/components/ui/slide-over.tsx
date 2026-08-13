"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

type SlideOverProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
};

/**
 * Painel lateral construído sobre o `<dialog>` nativo, que já entrega
 * foco preso, fechamento por Esc e inércia do conteúdo de fundo.
 */
export function SlideOver({
  open,
  onClose,
  title,
  description,
  children,
}: SlideOverProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // O `<dialog>` modal não bloqueia a rolagem da página por padrão.
  useEffect(() => {
    if (!open) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="slide-over-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // Cliques no backdrop têm o próprio dialog como target.
        if (event.target === dialogRef.current) onClose();
      }}
      className="slide-over m-0 ml-auto h-dvh max-h-dvh w-full max-w-[36rem] bg-white p-0 text-graphite-900 shadow-popover backdrop:bg-graphite-950/40"
    >
      {open ? (
        <div className="flex h-full flex-col">
          <header className="flex shrink-0 items-start gap-4 border-b border-graphite-200/70 px-5 py-4 sm:px-6">
            <div className="min-w-0 flex-1">
              <h2
                id="slide-over-title"
                className="text-base font-semibold text-graphite-900"
              >
                {title}
              </h2>
              {description ? (
                <p className="mt-0.5 text-sm text-graphite-500">{description}</p>
              ) : null}
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="-mr-1.5 flex size-9 shrink-0 items-center justify-center rounded-lg text-graphite-500 transition-colors hover:bg-graphite-100 hover:text-graphite-900"
            >
              <X className="size-5" aria-hidden />
            </button>
          </header>

          {children}
        </div>
      ) : null}
    </dialog>
  );
}
