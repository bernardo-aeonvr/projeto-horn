import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";

import "./globals.css";

const poppins = Poppins({
  subsets: ["latin", "latin-ext"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
  variable: "--font-poppins",
});

export const metadata: Metadata = {
  title: {
    default: "HORN",
    template: "%s · HORN",
  },
  description:
    "Sistema interno da HORN para gestão da carteira de profissionais, contatos, projetos e propostas das lojas representadas.",
  applicationName: "HORN",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#282c30",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={poppins.variable}>
      <body>{children}</body>
    </html>
  );
}
