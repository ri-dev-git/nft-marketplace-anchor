"use client";
import Link from "next/link";
import { ConnectButton } from "./ConnectButton";

export default function Navbar() {
    return (
        <nav className="flex justify-between p-4 bg-white shadow">
            <Link href="/" className="text-xl font-bold">NFT Market</Link>
            <div className="flex items-center gap-4">
                <Link href="/marketplace">Marketplace</Link>
                <Link href="/sell">Sell</Link>
                <ConnectButton />
            </div>
        </nav>
    );
}
