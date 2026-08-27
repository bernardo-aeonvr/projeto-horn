"use client";

import { ImageOff, Loader2, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";

import { useToast } from "@/components/ui/toast";
import { removeStoreLogoAction, setStoreLogoAction } from "@/lib/stores/actions";
import {
  buildStoreLogoPath,
  STORE_LOGO_ACCEPT,
  STORE_LOGO_BUCKET,
  storeLogoUrl,
  validateLogoFile,
} from "@/lib/stores/logo";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/**
 * Campo de logotipo da loja.
 *
 * Fora do envio do formulário, de propósito: a imagem sobe direto do navegador
 * para o bucket, como os PDFs de proposta, porque o corpo de uma Server Action
 * tem 1 MB e passar arquivo por ali é apertado demais. O formulário continua
 * salvando só texto.
 *
 * DOIS MOMENTOS DIFERENTES
 *
 * Editando, a loja já existe: escolher a imagem envia na hora e a troca fica
 * gravada, independente do resto do formulário.
 *
 * Cadastrando, ainda não existe pasta para onde subir — a policy do bucket
 * confere se `{loja}/` é de quem está enviando, e a loja só ganha id depois do
 * insert. Então o arquivo fica esperando em memória, com uma prévia local, e
 * quem o envia é o formulário, assim que o cadastro volta com o id.
 */

type StoreLogoFieldProps = {
  /** Loja em edição, ou null no cadastro. */
  storeId: string | null;
  storeName: string;
  /** Caminho já gravado no banco, quando houver. */
  logoPath: string | null;
  /** Arquivo escolhido antes de a loja existir. Só usado no cadastro. */
  pendingFile: File | null;
  onPendingFileChange: (file: File | null) => void;
  /** Bloqueia o campo enquanto o formulário salva. */
  disabled?: boolean;
};

export function StoreLogoField({
  storeId,
  storeName,
  logoPath,
  pendingFile,
  onPendingFileChange,
  disabled,
}: StoreLogoFieldProps) {
  const { showToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const [savedPath, setSavedPath] = useState(logoPath);
  const [busy, setBusy] = useState(false);
  /* URL local do arquivo em espera, no cadastro. */
  const [preview, setPreview] = useState<string | null>(null);

  const url = preview ?? storeLogoUrl(savedPath);
  const hasLogo = url !== null;

  function pick() {
    inputRef.current?.click();
  }

  async function handleFile(file: File) {
    const validation = validateLogoFile(file);
    if (!validation.ok) {
      showToast("error", validation.message);
      return;
    }

    // Sem loja ainda: guarda o arquivo e mostra a prévia local.
    if (!storeId) {
      setPreview((current) => {
        if (current) URL.revokeObjectURL(current);
        return URL.createObjectURL(file);
      });
      onPendingFileChange(file);
      return;
    }

    setBusy(true);

    const path = buildStoreLogoPath(storeId, file);
    const supabase = createClient();
    const { error } = await supabase.storage
      .from(STORE_LOGO_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });

    if (error) {
      setBusy(false);
      console.error("[lojas] falha no upload do logotipo", error);
      showToast(
        "error",
        "Não foi possível enviar a imagem. Verifique a conexão e tente novamente.",
      );
      return;
    }

    const result = await setStoreLogoAction(storeId, path);
    setBusy(false);

    if (!result.ok) {
      showToast("error", result.message);
      return;
    }

    setSavedPath(path);
    showToast("success", result.message);
  }

  async function handleRemove() {
    // No cadastro é só descartar o que estava em memória.
    if (!storeId) {
      if (preview) URL.revokeObjectURL(preview);
      setPreview(null);
      onPendingFileChange(null);
      return;
    }

    setBusy(true);
    const result = await removeStoreLogoAction(storeId);
    setBusy(false);

    if (!result.ok) {
      showToast("error", result.message);
      return;
    }

    setSavedPath(null);
    showToast("success", result.message);
  }

  return (
    <div className="space-y-1.5">
      <span className="flex items-baseline gap-1.5 text-sm font-medium text-graphite-800">
        Logo da loja
        <span className="text-xs font-normal text-graphite-400">(opcional)</span>
      </span>

      <div className="flex items-center gap-4 rounded-xl border border-graphite-200 bg-graphite-50/60 p-3">
        {/*
          Moldura de tamanho fixo com a imagem contida: logotipo quadrado,
          deitado ou em pé cabe do mesmo jeito, sem esticar nem cortar.
        */}
        <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-graphite-200 bg-white">
          {hasLogo ? (
            /*
              <img> e não next/image: a prévia do cadastro é uma blob: URL, que
              o otimizador não processa. Uma tag só atende a prévia local e a
              imagem já salva no Storage.
            */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={`Logotipo de ${storeName || "loja"}`}
              className="size-full object-contain p-1.5"
            />
          ) : (
            <ImageOff className="size-6 text-graphite-300" aria-hidden />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={pick}
              disabled={disabled || busy}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-lg border border-graphite-200 bg-white px-3 text-sm font-medium text-graphite-700 transition-colors",
                "hover:bg-graphite-50 disabled:cursor-not-allowed disabled:opacity-60",
              )}
            >
              {busy ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <Upload className="size-3.5" aria-hidden />
              )}
              {busy ? "Enviando..." : hasLogo ? "Alterar logo" : "Enviar logo"}
            </button>

            {hasLogo ? (
              <button
                type="button"
                onClick={handleRemove}
                disabled={disabled || busy}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-graphite-200 bg-white px-3 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Trash2 className="size-3.5" aria-hidden />
                Remover
              </button>
            ) : null}
          </div>

          <p className="mt-2 text-xs leading-relaxed text-graphite-500">
            PNG, JPG ou WebP, até 1 MB. Aparece no dashboard desta loja.
            {storeId === null && pendingFile
              ? " A imagem sobe junto com o cadastro."
              : ""}
          </p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={STORE_LOGO_ACCEPT}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Zera o input para reescolher o mesmo arquivo depois de um erro.
          event.target.value = "";
          if (file) void handleFile(file);
        }}
      />
    </div>
  );
}
