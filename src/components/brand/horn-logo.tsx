import Image from "next/image";

import { cn } from "@/lib/utils";

import hornLogo from "../../../public/brand/horn-logo.png";
import hornMark from "../../../public/brand/horn-mark.png";
import hornWordmark from "../../../public/brand/horn-wordmark.png";

/** Apenas o símbolo (barras + seta). */
export function HornMark({ className }: { className?: string }) {
  return (
    <Image
      src={hornMark}
      alt=""
      priority
      className={cn("h-8 w-auto", className)}
      aria-hidden
    />
  );
}

/** Lockup horizontal: símbolo + palavra HORN. Usado na sidebar e no header. */
export function HornLockup({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <HornMark className="h-7 w-auto" />
      <Image
        src={hornWordmark}
        alt="HORN"
        priority
        className="h-3.5 w-auto translate-y-px"
      />
    </span>
  );
}

/** Lockup vertical completo. Usado nas telas de autenticação. */
export function HornLogo({ className }: { className?: string }) {
  return (
    <Image
      src={hornLogo}
      alt="HORN"
      priority
      className={cn("h-20 w-auto", className)}
    />
  );
}
