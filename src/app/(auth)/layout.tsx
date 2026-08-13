import Image from "next/image";

import hornWordmark from "../../../public/brand/horn-wordmark.png";

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-svh flex-col lg:flex-row">
      {/* Painel da marca — o grafite fica contido aqui, fora da área de trabalho. */}
      <div className="relative hidden w-[42%] max-w-xl shrink-0 flex-col justify-between overflow-hidden bg-graphite-900 p-12 lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-28 -top-28 size-96 rounded-full bg-gold-500/10 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-36 -left-20 size-80 rounded-full bg-gold-500/[0.07] blur-3xl"
        />

        {/* self-start: sem isso o flex-col do painel estica a imagem na horizontal. */}
        <Image
          src={hornWordmark}
          alt="HORN"
          priority
          className="relative h-6 w-auto self-start"
        />

        <div className="relative max-w-sm">
          <span aria-hidden className="mb-7 block h-px w-12 bg-gold-500" />
          <p className="text-[26px] font-light leading-snug text-white">
            Representação comercial{" "}
            <span className="font-medium text-gold-400">organizada</span>, do
            primeiro contato ao negócio fechado.
          </p>
        </div>

        <p className="relative text-xs text-graphite-400">
          Sistema interno · acesso restrito
        </p>
      </div>

      <div className="flex flex-1 items-center justify-center bg-white px-5 py-12 sm:px-8">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
