"use client";

import { Loader2, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/form-fields";
import { inputBaseClass, inputErrorClass } from "@/components/ui/text-field";
import { createProfessionalOptionAction } from "@/lib/professionals/actions";
import { mergeOptionNames } from "@/lib/professionals/format";
import type { ProfessionalOptionKind } from "@/lib/professionals/types";
import { cn } from "@/lib/utils";

type ProfessionalOptionFieldProps = {
  kind: ProfessionalOptionKind;
  /** Rótulo do campo, ex.: "Empresa". */
  label: string;
  /** Nome no FormData: a coluna do profissional. */
  name: string;
  options: string[];
  defaultValue: string;
  error?: string;
  /** Título do diálogo, ex.: "Nova empresa". */
  dialogTitle: string;
  /** Rótulo acessível do botão +, ex.: "Adicionar empresa". */
  addLabel: string;
  placeholder: string;
  /** Avisa a lista de cima, para a opção nova valer nos outros formulários. */
  onCreated: (kind: ProfessionalOptionKind, name: string) => void;
};

/**
 * Seletor de empresa ou cargo, com criação de opção ao lado.
 *
 * Os dois campos são a mesma coisa com rótulos diferentes — uma lista de textos
 * reutilizáveis, opcional, do próprio admin —, então são um componente só. O
 * valor gravado no profissional continua sendo o TEXTO escolhido, e é por isso
 * que o `<select>` nativo basta: não há id para resolver, e ele traz de graça o
 * seletor do celular e o conserto de reset do React 19 que já vive em
 * SelectField.
 *
 * O valor atual entra na lista mesmo que não esteja no catálogo. É o que faz um
 * profissional gravado antes desta tela — ou por chamada direta da API — abrir
 * com a empresa dele selecionada, em vez de aparecer em branco e ser apagado
 * sem querer no primeiro "Salvar".
 */
export function ProfessionalOptionField({
  kind,
  label,
  name,
  options,
  defaultValue,
  error,
  dialogTitle,
  addLabel,
  placeholder,
  onCreated,
}: ProfessionalOptionFieldProps) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);

  const available = useMemo(
    () => mergeOptionNames(options, value ? [value] : []),
    [options, value],
  );

  return (
    <>
      <SelectField
        label={label}
        name={name}
        optional
        value={value}
        onChange={(event) => setValue(event.target.value)}
        error={error}
        trailing={
          <Button
            variant="secondary"
            size="lg"
            onClick={() => setOpen(true)}
            title={addLabel}
            aria-label={addLabel}
            className="w-11 shrink-0 px-0"
          >
            <Plus className="size-4" aria-hidden />
          </Button>
        }
      >
        <option value="">—</option>
        {available.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </SelectField>

      <NewOptionDialog
        open={open}
        kind={kind}
        title={dialogTitle}
        label={label}
        placeholder={placeholder}
        onClose={() => setOpen(false)}
        onCreated={(created) => {
          // Já selecionado: quem cadastrou a empresa aqui é porque é a dela.
          setValue(created);
          onCreated(kind, created);
          setOpen(false);
        }}
      />
    </>
  );
}

/**
 * Diálogo de "nova empresa" / "novo cargo".
 *
 * Sobre o `<dialog>` nativo, como o ConfirmDialog — é o que empilha
 * corretamente sobre o painel lateral (que também é um `<dialog>`) e faz o Esc
 * fechar só a caixa de cima.
 */
function NewOptionDialog({
  open,
  kind,
  title,
  label,
  placeholder,
  onClose,
  onCreated,
}: {
  open: boolean;
  kind: ProfessionalOptionKind;
  title: string;
  label: string;
  placeholder: string;
  onClose: () => void;
  onCreated: (name: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();

    // Só efeito de DOM: o campo é limpo ao FECHAR, não ao abrir, para o
    // diálogo não depender de setState dentro de um efeito.
    if (open) inputRef.current?.focus();
  }, [open]);

  /** Zera o rascunho e sai. Todo caminho de saída passa por aqui. */
  const leave = (report: () => void) => {
    setDraft("");
    setMessage(null);
    report();
  };

  const submit = () => {
    const name = draft.trim();
    if (!name) {
      setMessage("Informe um nome.");
      return;
    }

    startTransition(async () => {
      const result = await createProfessionalOptionAction(kind, name);

      if (!result.ok) {
        setMessage(result.message);
        return;
      }

      /*
        `result.name` e não `name`: quando a opção já existia com outra caixa
        — "aliás arquitetura" para uma "Aliás Arquitetura" já cadastrada —, o
        que volta é a grafia original. A lista não ganha uma variação, e o
        profissional fica com a empresa que já existe.
      */
      leave(() => onCreated(result.name));
    });
  };

  const close = () => {
    if (!pending) leave(onClose);
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={`new-option-${kind}-title`}
      onCancel={(event) => {
        /*
          O painel lateral por baixo também é um <dialog> com onCancel, e este
          diálogo é filho dele na árvore de componentes — o React entrega o
          evento aos dois. Sem o stopPropagation, o Esc aqui fecharia o
          cadastro inteiro junto, levando embora o que já tinha sido digitado.
          O preventDefault sozinho não resolve: ele só impede o navegador de
          fechar, não o handler de cima de rodar.
        */
        event.preventDefault();
        event.stopPropagation();
        close();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) close();
      }}
      className="m-auto w-[calc(100vw-2rem)] max-w-sm rounded-xl bg-white p-0 text-graphite-900 shadow-popover backdrop:bg-graphite-950/40"
    >
      {open ? (
        <div className="p-5 sm:p-6">
          <h2
            id={`new-option-${kind}-title`}
            className="text-base font-semibold text-graphite-900"
          >
            {title}
          </h2>

          <div className="mt-4 space-y-1.5">
            <label
              htmlFor={`new-option-${kind}-input`}
              className="text-sm font-medium text-graphite-800"
            >
              {label}
            </label>
            <input
              ref={inputRef}
              id={`new-option-${kind}-input`}
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                if (message) setMessage(null);
              }}
              /*
                O diálogo vive dentro do formulário do profissional. Sem isto, o
                Enter aqui submeteria o cadastro inteiro pela metade.
              */
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                if (!pending) submit();
              }}
              placeholder={placeholder}
              maxLength={160}
              autoComplete="off"
              aria-invalid={message ? true : undefined}
              aria-describedby={message ? `new-option-${kind}-error` : undefined}
              className={cn(inputBaseClass, message && inputErrorClass)}
            />
            {message ? (
              <p
                id={`new-option-${kind}-error`}
                className="text-xs font-medium text-red-600"
              >
                {message}
              </p>
            ) : null}
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" onClick={close} disabled={pending}>
              Cancelar
            </Button>

            <Button onClick={submit} disabled={pending}>
              {pending ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Adicionando...
                </>
              ) : (
                "Adicionar"
              )}
            </Button>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
