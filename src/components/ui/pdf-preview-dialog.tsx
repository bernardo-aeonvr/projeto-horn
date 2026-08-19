"use client";

import { Download, ExternalLink, Loader2, X } from "lucide-react";
import { useEffect, useRef } from "react";

type PdfPreviewDialogProps = {
  open: boolean;
  /** Nome do arquivo, exibido no cabeçalho. */
  fileName: string;
  /**
   * URL assinada para leitura no navegador. `null` enquanto a assinatura está
   * sendo criada — o diálogo abre antes dela chegar, para o clique ter resposta
   * imediata.
   */
  url: string | null;
  onClose: () => void;
  onDownload?: () => void;
  downloading?: boolean;
};

/**
 * Visualização de PDF sem sair da página.
 *
 * Sobre o `<dialog>` nativo, igual ao resto dos modais do sistema: foco preso,
 * Esc e inércia do fundo já vêm prontos.
 *
 * O PDF é exibido pelo próprio visualizador do navegador, dentro de um
 * `<iframe>`. Alguns navegadores de celular ignoram PDF em iframe e mostram
 * área vazia, então "Abrir em nova aba" fica sempre visível — é a saída para
 * esse caso, não um extra escondido num menu.
 */
export function PdfPreviewDialog({
  open,
  fileName,
  url,
  onClose,
  onDownload,
  downloading,
}: PdfPreviewDialogProps) {
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
      aria-labelledby="pdf-preview-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // Cliques no backdrop têm o próprio dialog como target.
        if (event.target === dialogRef.current) onClose();
      }}
      className="m-auto h-[calc(100dvh-2rem)] max-h-none w-[calc(100vw-2rem)] max-w-5xl rounded-xl bg-white p-0 text-graphite-900 shadow-popover backdrop:bg-graphite-950/50"
    >
      {open ? (
        <div className="flex h-full flex-col">
          <header className="flex shrink-0 items-center gap-2 border-b border-graphite-200/70 px-4 py-3 sm:px-5">
            <h2
              id="pdf-preview-title"
              className="min-w-0 flex-1 truncate text-sm font-semibold text-graphite-900"
              title={fileName}
            >
              {fileName}
            </h2>

            {url ? (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-graphite-600 transition-colors hover:bg-graphite-100 hover:text-graphite-900"
              >
                <ExternalLink className="size-4" aria-hidden />
                <span className="hidden sm:inline">Abrir em nova aba</span>
              </a>
            ) : null}

            {onDownload ? (
              <button
                type="button"
                onClick={onDownload}
                disabled={downloading}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-graphite-600 transition-colors hover:bg-graphite-100 hover:text-graphite-900 disabled:opacity-60"
              >
                {downloading ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Download className="size-4" aria-hidden />
                )}
                <span className="hidden sm:inline">Baixar</span>
              </button>
            ) : null}

            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="flex size-9 shrink-0 items-center justify-center rounded-lg text-graphite-500 transition-colors hover:bg-graphite-100 hover:text-graphite-900"
            >
              <X className="size-5" aria-hidden />
            </button>
          </header>

          <div className="min-h-0 flex-1 bg-graphite-100">
            {url ? (
              <iframe
                src={url}
                title={`Visualização de ${fileName}`}
                className="size-full border-0"
              />
            ) : (
              <p className="flex h-full items-center justify-center gap-2 text-sm text-graphite-500">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Abrindo o arquivo...
              </p>
            )}
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
