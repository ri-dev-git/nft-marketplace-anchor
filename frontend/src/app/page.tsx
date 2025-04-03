"use client";
import { ConnectButton } from "../components/ConnectButton";
import NFTList from "../components/NFTList";

export default function HomePage() {
  return (
    <main>
      <ConnectButton />
      <h1>Solana NFT Marketplace</h1>
      <NFTList />
    </main>
  );
}
