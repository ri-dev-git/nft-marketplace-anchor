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
  <div className="animate-pulse border rounded-lg p-4 shadow">
    <div className="bg-gray-300 h-48 w-full rounded mb-4" />
    <div className="h-4 bg-gray-300 rounded w-3/4 mb-2" />
    <div className="h-4 bg-gray-200 rounded w-1/2" />
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

    const buyerPublicKey = new PublicKey(address);
    const sellerPublicKey = new PublicKey(nft.owner); // Make sure `owner` field exists in NFT
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
      const connection = new Connection('https://api.devnet.solana.com ');
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
      const res = await fetch('http://127.0.0.1:8080/update_nft_listing_status', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
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
    }
  }

  if (!isClient) return null;

  const Loader = () => (
    <div className="flex justify-center items-center h-64">
      <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500"></div>
    </div>
  );

  return (
    <Layout>
      {isConnected ? (
        <div className="flex flex-col h-full w-full p-4">
          <h1 className="text-2xl font-bold mb-6">Available NFTs</h1>
          {loadingFromServer ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : listedNFTs.length > 0 ? (
            <div className="flex-grow overflow-y-auto p-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {listedNFTs.map((nft, index) => (
                  <div
                    key={`marketplace-${index}`}
                    className="relative group border rounded-lg overflow-hidden shadow hover:shadow-lg transition-shadow duration-300"
                  >
                    <img
                      src={nft.image_uri || "/fallback-image.png"}
                      alt={nft.name}
                      className="w-full h-64 object-cover"
                    />
                    <div className="p-4">
                      <h2 className="text-lg font-semibold">{nft.name}</h2>
                      <p className="text-sm text-gray-500">{nft.symbol}</p>
                      <p className="text-sm mt-1">
                        <strong>Price:</strong> {nft.price} SOL
                      </p>
                    </div>
                    <button
                      className="absolute h-60 inset-0 bg-black bg-opacity-100 text-white opacity-0 group-hover:opacity-50 transition-opacity flex items-center justify-center"
                      onClick={() => handleBuy(nft)}
                    >
                      <span className="bg-green-500 px-4 py-2 rounded">Buy Now</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-4 text-center border rounded-lg">
              <p className="text-gray-500">No NFTs are currently listed on the marketplace.</p>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col size-full content-center justify-center p-10">
          <h1 className="text-center text-2xl font-bold mb-4">Connect Your Wallet</h1>
          <p className="mb-4 text-center text-gray-600">
            Please connect your wallet to access the NFT marketplace.
          </p>
          <ConnectButton />
        </div>
      )
      }
    </Layout >
  );
}


