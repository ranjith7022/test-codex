import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Azul 2P Rooms",
  description: "Create and join a two-player Azul room"
};

export default function RootLayout({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
