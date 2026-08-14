"use client";

import { Loader2, TriangleAlert } from "lucide-react";
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/** Confirmação para ações destrutivas, sobre o `<dialog>` nativo. */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  pending,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="confirm-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onCancel();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current && !pending) onCancel();
      }}
      className="m-auto w-[calc(100vw-2rem)] max-w-md rounded-xl bg-white p-0 text-graphite-900 shadow-popover backdrop:bg-graphite-950/40"
    >
      {open ? (
        <div className="p-5 sm:p-6">
          <div className="flex gap-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-red-50">
              <TriangleAlert className="size-5 text-red-600" aria-hidden />
            </span>

            <div className="min-w-0">
              <h2
                id="confirm-dialog-title"
                className="text-base font-semibold text-graphite-900"
              >
                {title}
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-graphite-600">
                {description}
              </p>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={onCancel}
              disabled={pending}
            >
              Cancelar
            </Button>

            <Button
              type="button"
              onClick={onConfirm}
              disabled={pending}
              className="bg-red-600 hover:bg-red-700 active:bg-red-800 disabled:bg-red-300"
            >
              {pending ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Removendo...
                </>
              ) : (
                confirmLabel
              )}
            </Button>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
