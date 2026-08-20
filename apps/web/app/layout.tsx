import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Fillin API",
  description: "Server-side API for the Fillin Chrome extension.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0 }}>
        {children}
      </body>
    </html>
  );
}