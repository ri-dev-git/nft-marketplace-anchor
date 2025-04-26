import type { Metadata } from "next";

import '../styles/globals.css';
import ContextProvider from '../context/WalletProvider';

export const metadata: Metadata = {
  title: "Solana NFT Marketplace",

};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <ContextProvider>{children}</ContextProvider>
      </body>
    </html>
  );
}