import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const mono = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "apiHub", template: "%s · apiHub" },
  description: "API specs from GitHub: docs, versions and partner sharing.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${mono.variable} h-full antialiased`}>
      <body className="min-h-full bg-bg font-sans text-sm text-fg">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
