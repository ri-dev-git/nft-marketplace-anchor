"use client";


import Link from 'next/link';
import { ConnectButton } from "./ConnectButton";
import { usePathname, useRouter } from 'next/navigation';

export default function Layout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    return (
        <div className="flex flex-col h-screen w-screen bg-base-100 text-base-content">
            {/* Top Navbar */}
            <nav className="w-full h-20 border-base-300 pr-10 flex items-center justify-between bg-base-200">
                <Link
                    href="/"><h1 className="text-2xl  font-bold">NFT Market</h1></Link>
                <div className="flex items-center gap-4">

                    <ConnectButton />
                </div>
            </nav>

            {/* Body with Sidebar and Main Content */}
            <div className="flex flex-1  overflow-hidden">
                {/* Sidebar */}
                <aside className="flex justify-center w-1/4  border-white-300 bg-base-200">
                    <nav className="flex flex-col place-content-evenly w-80 h-30 ">
                        <Link
                            href="/"
                            className={`block  px-4 py-2 rounded text-lg font-medium hover:bg-base-300 ${pathname === '/' ? 'bg-primary text-primary-content' : ''
                                }`}
                        >
                            Buy NFTs
                        </Link>
                        <Link
                            href="/uploadNft"
                            className={`block px-4 py-2 rounded text-lg font-medium hover:bg-base-300 ${pathname === '/uploadNft' ? 'bg-primary text-primary-content' : ''
                                }`}
                        >
                            Upload NFT
                        </Link>
                        <Link
                            href="/myNfts"
                            className={`block px-4 py-2 rounded text-lg font-medium hover:bg-base-300 ${pathname === '/myNfts' ? 'bg-primary text-primary-content' : ''
                                }`}
                        >
                            My NFTs
                        </Link>
                    </nav>
                </aside>

                {/* Main Content */}
                <main className="flex w-3/4 h-full w-full bg-base-100">
                    {children}
                </main>
            </div>
        </div>

    );
}
