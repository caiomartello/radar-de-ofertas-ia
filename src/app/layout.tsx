import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Radar de Ofertas IA",
  description: "Seu espaço de curadoria de ofertas, cupons e publicações.",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
