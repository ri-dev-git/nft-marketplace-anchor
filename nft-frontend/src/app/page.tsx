"use client"

import Layout from '../components/Layout';
import { ConnectButton } from "../components/ConnectButton";
import { useEffect, useState } from 'react';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { DigitalAsset, fetchAllDigitalAssetByUpdateAuthority } from '@metaplex-foundation/mpl-token-metadata';
import { publicKey } from '@metaplex-foundation/umi';
import { useAppKitAccount, useAppKitProvider, useWalletInfo } from '@reown/appkit/react';

const SkeletonCard = () => (
  <div className="animate-pulse border rounded-lg p-4 shadow">
    <div className="bg-gray-300 h-48 w-full rounded mb-4" />
    <div className="h-4 bg-gray-300 rounded w-3/4 mb-2" />
    <div className="h-4 bg-gray-200 rounded w-1/2" />
  </div>
);



export default function Home() {
  const [isClient, setIsClient] = useState(false);
  const { isConnected } = useAppKitAccount()
  const [nfts, setNfts] = useState<DigitalAsset[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const updateAuthority = publicKey('7oEFwgSPqj1XWYQJ9yEC8PAgP45Ye8pK8uW5e8NqiAdt');

  // Initialize Umi with your preferred RPC endpoint 
  const umi = createUmi('https://api.devnet.solana.com');

  async function getNFTsMintedByYourDapp() {
    try {
      const assets = await fetchAllDigitalAssetByUpdateAuthority(umi, updateAuthority);
      console.log("assests", assets)
      return assets;
    } catch (error) {
      console.error('Error fetching NFTs:', error);
      return [];
    }
  }


  useEffect(() => {
    async function fetchNFTs() {
      setIsLoading(true);
      try {
        const assets = await getNFTsMintedByYourDapp();
        setNfts(assets);
      } catch (error) {
        console.error('Error in fetchNFTs:', error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchNFTs();
    setIsClient(true);
  }, []);

  function handleBuy(nft: DigitalAsset) {
    // Implement your buy logic here 
    console.log('Buying NFT:', nft);
  }

  if (!isClient) return null; // Prevent hydration mismatch 

  // Loading spinner component
  const Loader = () => (
    <div className="flex justify-center content-center items-center h-64">
      <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500"></div>
    </div>
  );

  return (
    <Layout>
      {isConnected ? (
        <div className="flex flex-col h-full w-full p-4">

          <h1 className="text-2xl font-bold mb-4">Available NFTs</h1>
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : nfts.length > 0 ? (
            <div className="flex-grow overflow-y-auto p-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {nfts.map((nft, index) => (
                  <div key={index} className="relative group border rounded-lg overflow-hidden shadow hover:shadow-lg transition-shadow duration-300">
                    <img src={nft.metadata.uri} alt={nft.metadata.name} className="w-full h-64 object-cover" />
                    <div className="p-4">
                      <h2 className="text-lg font-semibold">{nft.metadata.name}</h2>
                      <p className="text-sm text-gray-500">{nft.metadata.symbol}</p>
                    </div>
                    <button
                      className="absolute inset-0 bg-black bg-opacity-50 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                      onClick={() => handleBuy(nft)}
                    >
                      <span className="bg-blue-500 px-4 py-2 rounded">Buy</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex-grow flex justify-center items-center">
              <div className="p-4 text-center border rounded-lg">
                <p className="text-gray-500">No NFTs found. Check back later!</p>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col size-full content-center justify-center p-10">
          <h1 className=" text-center text-2xl font-bold mb-4">Connect Your Wallet</h1>
          <p className="mb-4 text-center text-gray-600">
            Please connect your wallet to access the NFT marketplace.
          </p>
          <ConnectButton />

        </div>
      )}
    </Layout>
  );
}