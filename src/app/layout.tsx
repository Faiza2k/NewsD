import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "@/components/providers/query-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { DashboardShell } from "@/components/layout/dashboard-shell";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NewsDash — AI & Crypto Intelligence Terminal",
  description: "Real-time intelligence hub for AI, Crypto, Trading, Technology, Research & Innovation. Monitor 35+ trusted sources in one premium dashboard.",
  keywords: ["AI news", "crypto dashboard", "trading intelligence", "tech news", "research papers", "GitHub trending"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html suppressHydrationWarning
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      data-scroll-behavior="smooth"
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                if (localStorage.getItem('theme') === 'light') {
                  document.documentElement.classList.remove('dark');
                  document.documentElement.classList.add('light');
                }
              } catch (_) {}
            `,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <QueryProvider>
            <DashboardShell>
              {children}
            </DashboardShell>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
