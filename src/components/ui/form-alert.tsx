import { CircleAlert, CircleCheck } from "lucide-react";

import { cn } from "@/lib/utils";

type FormAlertProps = {
  tone: "error" | "success";
  children: React.ReactNode;
  className?: string;
};

const TONES = {
  error: {
    box: "border-red-200 bg-red-50 text-red-800",
    icon: "text-red-500",
    Icon: CircleAlert,
  },
  success: {
    box: "border-emerald-200 bg-emerald-50 text-emerald-800",
    icon: "text-emerald-600",
    Icon: CircleCheck,
  },
} as const;

export function FormAlert({ tone, children, className }: FormAlertProps) {
  const { box, icon, Icon } = TONES[tone];

  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm",
        box,
        className,
      )}
    >
      <Icon className={cn("mt-px size-4.5 shrink-0", icon)} aria-hidden />
      <p className="leading-relaxed">{children}</p>
    </div>
  );
}
