"use client";

import { FileText, Loader2, Paperclip, Trash2 } from "lucide-react";
import { useRef, useState, useTransition } from "react";

import { useToast } from "@/components/ui/toast";
import { formatContactedAt } from "@/lib/contacts/period";
import {
  createAttachmentUrlAction,
  registerProposalAttachmentAction,
  removeProposalAttachmentAction,
} from "@/lib/opportunities/actions";
import type {
  Opportunity,
  ProposalAttachment,
} from "@/lib/opportunities/types";
import { MAX_PDF_BYTES, toStorageFileName } from "@/lib/opportunities/validation";
import { createClient } from "@/lib/supabase/client";

const BUCKET = "proposal-pdfs";

type OpportunityAttachmentsProps = {
  opportunity: Opportunity;
  attachments: ProposalAttachment[] | null;
  onChanged: () => void;
};

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;

  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;

  return `${(kb / 1024).toFixed(1).replace(".", ",")} MB`;
}

/**
 * PDFs da proposta.
 *
 * O arquivo sobe direto do navegador para o bucket privado `proposal-pdfs`,
 * com a sessão do próprio usuário — quem autoriza é a policy do Storage, não
 * a aplicação. Passar o PDF por uma Server Action esbarraria no limite de 1 MB
 * do corpo da requisição.
 *
 * Cada envio cria um arquivo novo: as versões anteriores continuam listadas,
 * porque é assim que a revisão de uma proposta fica registrada (spec, 13.2).
 */
export function OpportunityAttachments({
  opportunity,
  attachments,
  onChanged,
}: OpportunityAttachmentsProps) {
  const { showToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function handleUpload(file: File) {
    if (!opportunity.store) {
      showToast("error", "Loja do projeto não identificada. Recarregue a página.");
      return;
    }

    // O bucket também recusa outros tipos, mas o aviso aqui é imediato.
    const isPdf =
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf");

    if (!isPdf) {
      showToast("error", "Só é possível anexar arquivos PDF.");
      return;
    }

    if (file.size > MAX_PDF_BYTES) {
      showToast(
        "error",
        "O arquivo passa de 10 MB. Anexe apenas o PDF da proposta.",
      );
      return;
    }

    setUploading(true);

    // Convenção de caminho do schema: {loja}/{projeto}/{arquivo}.pdf — é ela
    // que permite à policy da loja liberar só os PDFs das próprias propostas.
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const path = `${opportunity.store.id}/${opportunity.id}/${unique}-${toStorageFileName(file.name)}.pdf`;

    const supabase = createClient();
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: "application/pdf", upsert: false });

    if (error) {
      setUploading(false);
      console.error("[projetos] falha no upload", error);
      showToast(
        "error",
        "Não foi possível enviar o arquivo. Verifique a conexão e tente novamente.",
      );
      return;
    }

    const result = await registerProposalAttachmentAction({
      opportunityId: opportunity.id,
      storagePath: path,
      fileName: file.name,
      sizeBytes: file.size,
    });

    setUploading(false);
    showToast(result.ok ? "success" : "error", result.message);
    if (result.ok) onChanged();
  }

  async function handleOpen(attachment: ProposalAttachment) {
    setOpeningId(attachment.id);
    const result = await createAttachmentUrlAction(attachment.id);
    setOpeningId(null);

    if (!result.ok || !result.url) {
      showToast("error", result.message ?? "Não foi possível abrir o arquivo.");
      return;
    }

    window.open(result.url, "_blank", "noopener,noreferrer");
  }

  function handleRemove(attachment: ProposalAttachment) {
    setRemovingId(attachment.id);

    startTransition(async () => {
      const result = await removeProposalAttachmentAction(attachment.id);
      setRemovingId(null);
      showToast(result.ok ? "success" : "error", result.message);
      if (result.ok) onChanged();
    });
  }

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-3 border-b border-graphite-100 pb-2">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-graphite-500">
          <Paperclip className="size-3.5" aria-hidden />
          PDFs da proposta
          {attachments && attachments.length > 0 ? (
            <span className="rounded-full bg-graphite-100 px-1.5 py-0.5 text-[10px] font-medium normal-case tracking-normal text-graphite-600">
              {attachments.length}
            </span>
          ) : null}
        </h3>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="inline-flex shrink-0 items-center gap-1 rounded text-xs font-medium text-gold-700 transition-colors hover:text-gold-800 disabled:opacity-60"
        >
          {uploading ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <Paperclip className="size-3.5" aria-hidden />
          )}
          {uploading ? "Enviando..." : "Anexar PDF"}
        </button>

        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Zera o input para permitir reenviar o mesmo arquivo depois.
            event.target.value = "";
            if (file) void handleUpload(file);
          }}
        />
      </div>

      {attachments === null ? (
        <p className="flex items-center gap-2 py-4 text-sm text-graphite-500">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Carregando arquivos...
        </p>
      ) : attachments.length === 0 ? (
        <p className="py-4 text-sm leading-relaxed text-graphite-500">
          Nenhum PDF anexado. Guarde aqui a proposta que a loja devolveu —
          apenas o PDF, não o projeto completo.
        </p>
      ) : (
        <ul className="divide-y divide-graphite-100">
          {attachments.map((attachment) => (
            <li
              key={attachment.id}
              className="flex items-center gap-3 py-2.5"
            >
              <FileText
                className="size-4 shrink-0 text-graphite-400"
                aria-hidden
              />

              <button
                type="button"
                onClick={() => void handleOpen(attachment)}
                disabled={openingId === attachment.id}
                className="min-w-0 flex-1 text-left"
              >
                <span className="block truncate text-sm font-medium text-graphite-800 underline-offset-2 hover:underline">
                  {attachment.file_name}
                </span>
                <span className="mt-0.5 block text-xs text-graphite-500 tabular-nums">
                  {formatContactedAt(attachment.created_at)}
                  {attachment.size_bytes !== null
                    ? ` · ${formatBytes(attachment.size_bytes)}`
                    : ""}
                </span>
              </button>

              {openingId === attachment.id ? (
                <Loader2
                  className="size-4 shrink-0 animate-spin text-graphite-400"
                  aria-hidden
                />
              ) : null}

              <button
                type="button"
                onClick={() => handleRemove(attachment)}
                disabled={removingId === attachment.id}
                title="Remover"
                aria-label={`Remover ${attachment.file_name}`}
                className="flex size-8 shrink-0 items-center justify-center rounded-lg text-graphite-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-60"
              >
                {removingId === attachment.id ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                ) : (
                  <Trash2 className="size-3.5" aria-hidden />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
