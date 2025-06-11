"use client";

import Layout from '../components/Layout';
import { ConnectButton } from "../components/ConnectButton";
import { useEffect, useState } from 'react';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { DigitalAsset, fetchAllDigitalAssetByUpdateAuthority } from '@metaplex-foundation/mpl-token-metadata';
import { publicKey } from '@metaplex-foundation/umi';
import { useAppKitAccount, useAppKitProvider, useWalletInfo } from '@reown/appkit/react';
import { PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL, Connection } from '@solana/web3.js';

// Define a type for your MongoDB-listed NFT
interface ListedNFT {
  mint_address: string;
  name: string;
  symbol: string;
  price: number;
  image_uri: string;
  metadata_uri: string;
  is_listed: boolean;
  owner: string;
}

const SkeletonCard: React.FC = () => (
  <div className="animate-pulse border rounded-lg p-3 sm:p-4 shadow">
    <div className="bg-gray-300 h-40 sm:h-48 w-full rounded mb-3 sm:mb-4" />
    <div className="h-3 sm:h-4 bg-gray-300 rounded w-3/4 mb-2" />
    <div className="h-3 sm:h-4 bg-gray-200 rounded w-1/2" />
  </div>
);

export default function Home() {
  const { walletProvider } = useAppKitProvider("solana");
  const [isClient, setIsClient] = useState(false);
  const { isConnected, address } = useAppKitAccount();
  const [nfts, setNfts] = useState<DigitalAsset[]>([]);
  const [listedNFTs, setListedNFTs] = useState<ListedNFT[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingFromServer, setLoadingFromServer] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [touchDevice, setTouchDevice] = useState(false);

  // Update authority (your program ID)
  const updateAuthority = publicKey('7oEFwgSPqj1XWYQJ9yEC8PAgP45Ye8pK8uW5e8NqiAdt');

  // Initialize Umi with your preferred RPC endpoint
  const umi = createUmi('https://api.devnet.solana.com');




  async function getNFTsFromMarketplaceAPI() {
    try {
      const res = await fetch('http://127.0.0.1:8080/get_listed_nfts');
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      console.log("MongoDB Listed NFTs:", data);
      return data;
    } catch (error) {
      console.error('Error fetching MongoDB NFTs:', error);
      return [];
    }
  }


  useEffect(() => {
    // const checkDevice = () => {
    //   setIsMobile(window.innerWidth < 768);
    //   setTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
    // };

    // checkDevice();
    // // window.addEventListener('resize', checkDevice);

    // return () => window.removeEventListener('resize', checkDevice);
    async function fetchNFTs() {
      setIsLoading(true);
      setLoadingFromServer(true);

      try {
        // Fetch MongoDB-listed NFTs
        const serverNFTs = await getNFTsFromMarketplaceAPI();
        setListedNFTs(serverNFTs);
      } catch (error) {
        console.error('Error in fetchNFTs:', error);
      } finally {
        setIsLoading(false);
        setLoadingFromServer(false);
      }
    }

    fetchNFTs();
    setIsClient(true);
  }, []);

  async function handleBuy(nft: ListedNFT) {
    if (!isConnected || !walletProvider || !address) {
      alert("Please connect your wallet.");
      return;
    }

    // Show loading state for better UX
    const originalButtonText = document.querySelector(`[data-nft="${nft.mint_address}"] .buy-button-text`)?.textContent;
    const buyButton = document.querySelector(`[data-nft="${nft.mint_address}"] .buy-button-text`);
    if (buyButton) buyButton.textContent = "Processing...";

    const buyerPublicKey = new PublicKey(address);
    const sellerPublicKey = new PublicKey(nft.owner);
    const priceInSol = nft.price;

    try {
      // Create transaction
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: buyerPublicKey,
          toPubkey: sellerPublicKey,
          lamports: priceInSol * LAMPORTS_PER_SOL,
        })
      );

      // Get blockhash
      const connection = new Connection('https://api.devnet.solana.com');
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = buyerPublicKey;

      // Sign the transaction using the wallet provider
      // @ts-ignore
      const signedTx = await walletProvider.signTransaction(transaction);
      const signature = await connection.sendRawTransaction(signedTx.serialize());

      // Confirm transaction
      await connection.confirmTransaction(signature);

      // After successful transfer, update backend
      const apiUrl = process.env.NODE_ENV === 'production'
        ? '/api/update_nft_listing_status'
        : 'http://127.0.0.1:8080/update_nft_listing_status';

      const res = await fetch(apiUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          mint_address: nft.mint_address,
          is_listed: false
        }),
      });

      if (!res.ok) throw new Error('Failed to update NFT listing status');

      // Update local state
      setListedNFTs((prev) =>
        prev.filter((listedNft) => listedNft.mint_address !== nft.mint_address)
      );

      alert(`✅ Successfully bought "${nft.name}" for ${priceInSol} SOL`);
    } catch (error: any) {
      console.error('Buy error:', error.message);
      alert(`❌ Failed to buy NFT: ${error.message}`);
    } finally {
      // Reset button text
      if (buyButton && originalButtonText) {
        buyButton.textContent = originalButtonText;
      }
    }
  }

  if (!isClient) return null;

  const Loader = () => (
    <div className="flex justify-center items-center h-32 sm:h-64">
      <div className="animate-spin rounded-full h-12 w-12 sm:h-16 sm:w-16 border-t-2 border-b-2 border-blue-500"></div>
    </div>
  );

  return (
    <Layout>
      {isConnected ? (
        <div className="flex flex-col h-full w-full p-2 sm:p-4">
          <h1 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 text-center sm:text-left">
            Available NFTs
          </h1>
          {loadingFromServer ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
              {[...Array(6)].map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : listedNFTs.length > 0 ? (
            <div className="flex-grow overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 pb-4">
                {listedNFTs.map((nft, index) => (
                  <div
                    key={`marketplace-${index}`}
                    data-nft={nft.mint_address}
                    className={`
                      relative group border rounded-lg overflow-hidden shadow 
                      hover:shadow-lg transition-all duration-300 transform
                      ${touchDevice ? 'active:scale-95' : 'hover:scale-102'}
                      bg-white
                    `}
                  >
                    {/* Image with better loading states */}
                    <div className="relative w-full h-40 sm:h-48 lg:h-56 overflow-hidden bg-gray-100">
                      <img
                        src={nft.image_uri || "/fallback-image.png"}
                        alt={nft.name}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                        loading="lazy"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.src = "/fallback-image.png";
                        }}
                      />

                      {/* Mobile-friendly overlay - always visible on touch devices */}
                      {touchDevice ? (
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                          <button
                            className="w-full bg-green-500 hover:bg-green-600 active:bg-green-700 text-white py-2 px-4 rounded transition-colors duration-200 font-medium text-sm sm:text-base"
                            onClick={() => handleBuy(nft)}
                          >
                            <span className="buy-button-text">Buy for {nft.price} SOL</span>
                          </button>
                        </div>
                      ) : (
                        /* Desktop hover overlay */
                        <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-70 transition-all duration-300 flex items-center justify-center opacity-0 group-hover:opacity-100">
                          <button
                            className="bg-green-500 hover:bg-green-600 text-white px-4 sm:px-6 py-2 sm:py-3 rounded-lg font-medium text-sm sm:text-base transition-colors duration-200 transform scale-90 group-hover:scale-100"
                            onClick={() => handleBuy(nft)}
                          >
                            <span className="buy-button-text">Buy Now</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* NFT Details */}
                    <div className="p-3 sm:p-4">
                      <h2 className="text-base sm:text-lg font-semibold truncate" title={nft.name}>
                        {nft.name}
                      </h2>
                      <p className="text-xs sm:text-sm text-gray-500 truncate" title={nft.symbol}>
                        {nft.symbol}
                      </p>
                      <div className="mt-2 flex justify-between items-center">
                        <p className="text-sm sm:text-base font-medium text-gray-900">
                          {nft.price} SOL
                        </p>
                        <span className="text-xs text-gray-400">
                          #{index + 1}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex-grow flex items-center justify-center">
              <div className="text-center p-6 sm:p-8 border rounded-lg max-w-md mx-auto">
                <div className="text-4xl sm:text-6xl mb-4">🎨</div>
                <h3 className="text-lg sm:text-xl font-semibold mb-2">No NFTs Available</h3>
                <p className="text-gray-500 text-sm sm:text-base">
                  No NFTs are currently listed on the marketplace. Check back later!
                </p>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col h-full w-full items-center justify-center p-4 sm:p-10 text-center">
          <div className="max-w-md mx-auto">
            <div className="text-4xl sm:text-6xl mb-4 sm:mb-6">🔗</div>
            <h1 className="text-xl sm:text-2xl font-bold mb-3 sm:mb-4">
              Connect Your Wallet
            </h1>
            <p className="mb-6 sm:mb-8 text-gray-600 text-sm sm:text-base leading-relaxed">
              Please connect your wallet to access the NFT marketplace and start browsing available collections.
            </p>
            <div className="w-full max-w-xs mx-auto">
              <ConnectButton />
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}