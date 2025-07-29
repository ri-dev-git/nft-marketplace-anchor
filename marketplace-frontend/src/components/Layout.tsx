"use client";

import Link from 'next/link';
import { ConnectButton } from "./ConnectButton";
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';

export default function Layout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const [isTabletMenuOpen, setIsTabletMenuOpen] = useState(false);
    const [screenSize, setScreenSize] = useState<'mobile' | 'tablet' | 'desktop'>('desktop');

    // Check screen size and categorize
    useEffect(() => {
        const checkScreenSize = () => {
            const width = window.innerWidth;
            if (width < 640) {
                setScreenSize('mobile');
            } else if (width < 1024) {
                setScreenSize('tablet');
            } else {
                setScreenSize('desktop');
            }

            // Close tablet menu when switching to desktop or mobile
            if (width < 640 || width >= 1024) {
                setIsTabletMenuOpen(false);
            }
        };

        checkScreenSize();
        window.addEventListener('resize', checkScreenSize);
        return () => window.removeEventListener('resize', checkScreenSize);
    }, []);

    // Close tablet menu when route changes
    useEffect(() => {
        setIsTabletMenuOpen(false);
    }, [pathname]);

    // Prevent body scroll when tablet menu is open
    useEffect(() => {
        if (isTabletMenuOpen && screenSize === 'tablet') {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }

        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isTabletMenuOpen, screenSize]);

    const toggleTabletMenu = () => {
        setIsTabletMenuOpen(!isTabletMenuOpen);
    };

    const handleNavigation = (path: string) => {
        router.push(path);
    };

    const navigationItems = [
        { href: '/', label: 'Buy NFTs', icon: '🛒' },
        { href: '/uploadNft', label: 'Upload NFT', icon: '📤' },
        { href: '/myNfts', label: 'My NFTs', icon: '🎨' }
    ];

    return (
        <div className="flex flex-col h-screen w-screen bg-base-100 text-base-content">
            {/* Top Navbar */}
            <nav className="w-full h-16 lg:h-20 border-base-300 px-4 lg:pr-10 flex items-center justify-between bg-base-200 relative z-50">
                <div className="flex items-center gap-3">
                    {/* Tablet Menu Toggle Button */}
                    {screenSize === 'tablet' && (
                        <button
                            onClick={toggleTabletMenu}
                            className="p-2 rounded-md hover:bg-base-300 transition-colors"
                            aria-label="Toggle navigation menu"
                        >
                            <div className="w-6 h-6 flex flex-col justify-center items-center">
                                <span
                                    className={`bg-current block transition-all duration-300 ease-out h-0.5 w-6 rounded-sm ${isTabletMenuOpen ? 'rotate-45 translate-y-1' : '-translate-y-0.5'
                                        }`}
                                ></span>
                                <span
                                    className={`bg-current block transition-all duration-300 ease-out h-0.5 w-6 rounded-sm my-0.5 ${isTabletMenuOpen ? 'opacity-0' : 'opacity-100'
                                        }`}
                                ></span>
                                <span
                                    className={`bg-current block transition-all duration-300 ease-out h-0.5 w-6 rounded-sm ${isTabletMenuOpen ? '-rotate-45 -translate-y-1' : 'translate-y-0.5'
                                        }`}
                                ></span>
                            </div>
                        </button>
                    )}

                    <h1 
                        onClick={() => handleNavigation('/')}
                        className="text-lg sm:text-xl lg:text-2xl font-bold hover:opacity-80 transition-opacity cursor-pointer"
                    >
                        NFT Market
                    </h1>
                </div>

                <div className="flex items-center gap-4">
                    <ConnectButton />
                </div>
            </nav>

            {/* Mobile Horizontal Navigation (below navbar on mobile screens only) */}
            {screenSize === 'mobile' && (
                <nav className="w-full bg-base-200 border-b border-base-300 px-4 py-2">
                    <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                        {navigationItems.map((item) => (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`flex items-center px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${pathname === item.href
                                        ? 'bg-primary text-primary-content'
                                        : 'hover:bg-base-300'
                                    }`}
                            >
                                <span className="mr-2">{item.icon}</span>
                                {item.label}
                            </Link>
                        ))}
                    </div>
                </nav>
            )}

            {/* Tablet Menu Overlay */}
            {isTabletMenuOpen && screenSize === 'tablet' && (
                <div
                    className="fixed inset-0 bg-black bg-opacity-50 z-40"
                    onClick={toggleTabletMenu}
                />
            )}

            {/* Mobile Horizontal Navigation (below navbar on mobile screens only) */}
            {screenSize === 'mobile' && (
                <nav className="w-full bg-base-200 border-b border-base-300 px-4 py-2">
                    <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                        {navigationItems.map((item) => (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`flex items-center px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${pathname === item.href
                                        ? 'bg-primary text-primary-content'
                                        : 'hover:bg-base-300'
                                    }`}
                            >
                                <span className="mr-2">{item.icon}</span>
                                {item.label}
                            </Link>
                        ))}
                    </div>
                </nav>
            )}

            {/* Tablet Menu Overlay */}
            {isTabletMenuOpen && screenSize === 'tablet' && (
                <div
                    className="fixed inset-0 bg-black bg-opacity-50 z-40"
                    onClick={toggleTabletMenu}
                />
            )}

            {/* Body with Sidebar and Main Content */}
            <div className="flex flex-1 overflow-hidden relative">
                {/* Desktop Sidebar (visible only on desktop) */}
                {screenSize === 'desktop' && (
                    <aside className="flex justify-center w-1/4 border-white-300 bg-base-200">
                        <nav className="flex flex-col place-content-evenly w-80 h-30">
                            <div
                                onClick={() => handleNavigation('/')}
                                className={`block px-4 py-2 rounded text-lg font-medium hover:bg-base-300 transition-colors cursor-pointer ${
                                    pathname === '/' ? 'bg-primary text-primary-content' : ''
                                }`}
                            >
                                Buy NFTs
                            </div>
                            <div
                                onClick={() => handleNavigation('/uploadNft')}
                                className={`block px-4 py-2 rounded text-lg font-medium hover:bg-base-300 transition-colors cursor-pointer ${
                                    pathname === '/uploadNft' ? 'bg-primary text-primary-content' : ''
                                }`}
                            >
                                Upload NFT
                            </div>
                            <div
                                onClick={() => handleNavigation('/myNfts')}
                                className={`block px-4 py-2 rounded text-lg font-medium hover:bg-base-300 transition-colors cursor-pointer ${
                                    pathname === '/myNfts' ? 'bg-primary text-primary-content' : ''
                                }`}
                            >
                                My NFTs
                            </div>
                        </nav>
                    </aside>
                )}

                {/* Tablet Toggle Sidebar */}
                {screenSize === 'tablet' && (
                    <aside
                        className={`fixed top-16 left-0 h-[calc(100vh-4rem)] w-80 max-w-[70vw] bg-base-200 z-40 transform transition-transform duration-300 ease-in-out shadow-xl ${isTabletMenuOpen ? 'translate-x-0' : '-translate-x-full'
                            }`}
                    >
                        <nav className="flex flex-col p-6 h-full">
                            <div className="space-y-3">
                                {navigationItems.map((item) => (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        className={`flex items-center px-4 py-3 rounded-lg text-base font-medium hover:bg-base-300 transition-colors ${pathname === item.href ? 'bg-primary text-primary-content' : ''
                                            }`}
                                        onClick={() => setIsTabletMenuOpen(false)}
                                    >
                                        <span className="mr-3 text-xl">{item.icon}</span>
                                        {item.label}
                                    </Link>
                                ))}
                            </div>

                            {/* Tablet menu footer */}
                            <div className="mt-auto pt-6 border-t border-base-300">
                                <div className="text-sm text-base-content/60 text-center">
                                    NFT Marketplace
                                </div>
                                <div className="text-xs text-base-content/40 text-center mt-1">
                                    Tablet View
                                </div>
                            </div>
                        </nav>
                    </aside>
                )}

                {/* Main Content */}
                <main className={`flex h-full w-full bg-base-100 overflow-hidden ${screenSize === 'desktop' ? 'w-3/4' : 'w-full'
                    }`}>
                    {children}
                </main>
            </div>

            {/* Custom scrollbar hiding styles */}
            <style jsx global>{`
                .scrollbar-hide {
                    -ms-overflow-style: none;
                    scrollbar-width: none;
                }
                .scrollbar-hide::-webkit-scrollbar {
                    display: none;
                }
            `}</style>

            {/* Custom scrollbar hiding styles */}
            <style jsx global>{`
                .scrollbar-hide {
                    -ms-overflow-style: none;
                    scrollbar-width: none;
                }
                .scrollbar-hide::-webkit-scrollbar {
                    display: none;
                }
            `}</style>
        </div>
    );
}