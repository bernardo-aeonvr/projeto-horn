import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { AuthHeading } from "@/components/auth/auth-heading";

import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Recuperar senha" };

export default function ForgotPasswordPage() {
  return (
    <>
      <AuthHeading
        title="Recuperar senha"
        description="Informe o e-mail do seu acesso. Enviaremos um link para você criar uma nova senha."
      />

      <ForgotPasswordForm />

      <Link
        href="/login"
        className="mt-8 inline-flex items-center gap-1.5 rounded text-sm font-medium text-graphite-600 transition-colors hover:text-graphite-900"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Voltar para o login
      </Link>
    </>
  );
}
