"use client";

import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

type SubmitButtonProps = {
  pending: boolean;
  children: React.ReactNode;
  pendingLabel: string;
};

export function SubmitButton({
  pending,
  children,
  pendingLabel,
}: SubmitButtonProps) {
  return (
    <Button type="submit" size="lg" disabled={pending} className="w-full">
      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
