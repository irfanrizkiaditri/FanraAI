import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Fanra Mouse — Remote Touchpad",
  description: "Touchpad dan keyboard remote minimalis serba hitam",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="id"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark bg-black`}
      style={{ backgroundColor: '#000000', colorScheme: 'dark' }}
    >
      <body className="min-h-full flex flex-col bg-black text-zinc-300 antialiased overflow-x-hidden" style={{ backgroundColor: '#000000' }}>
        {children}
      </body>
    </html>
  );
}
