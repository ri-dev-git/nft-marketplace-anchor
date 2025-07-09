"use client";
import { AnchorProvider, Program, web3, BN } from "@coral-xyz/anchor";
import Layout from '../components/Layout';
import { ConnectButton } from "../components/ConnectButton";
import { useEffect, useState } from 'react';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { DigitalAsset, transferV1, TokenStandard ,fetchAllDigitalAssetByUpdateAuthority, mplTokenMetadata } from '@metaplex-foundation/mpl-token-metadata';
import { publicKey } from '@metaplex-foundation/umi';
import { useAppKitAccount, useAppKitProvider, useWalletInfo } from '@reown/appkit/react';
import { PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL, Connection } from '@solana/web3.js';
import { ListedNFTCard } from "@/src/components/ListedNFTCard";
import type { Provider } from "@reown/appkit-adapter-solana/react";
import { walletAdapterIdentity } from '@metaplex-foundation/umi-signer-wallet-adapters';
import {
    Keypair,
   
    SendTransactionError,
   
    SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import idl from "../idl/nft_marketplace.json";
import {
    TOKEN_PROGRAM_ID,
    getAssociatedTokenAddress,
    ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

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
  token_standard: string;
}

const SkeletonCard: React.FC = () => (
  <div className="animate-pulse border rounded-lg p-4 shadow">
    <div className="bg-gray-300 h-48 w-full rounded mb-4" />
    <div className="h-4 bg-gray-300 rounded w-3/4 mb-2" />
    <div className="h-4 bg-gray-200 rounded w-1/2" />
  </div>
);
const PROGRAM_ID = new PublicKey(process.env.program_id || "8kU8YRPEr9SYYfr37iEb7PDLTARq2yuWr2kL7emyzYAk");

export default function Home() {
const { walletProvider } = useAppKitProvider<Provider>("solana");
    
  const [isClient, setIsClient] = useState(false);
  const { isConnected, address } = useAppKitAccount();
  const [nfts, setNfts] = useState<DigitalAsset[]>([]);
  const [listedNFTs, setListedNFTs] = useState<ListedNFT[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingFromServer, setLoadingFromServer] = useState(true);


  // Initialize Umi with your preferred RPC endpoint
  const umi = createUmi('https://api.devnet.solana.com');



  async function getNFTsFromMarketplaceAPI() {
    try {
      const res = await fetch('http://127.0.0.1:8000/get_listed_nfts');
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
        console.log(serverNFTs)
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

    try {
        const connection = new Connection("https://api.devnet.solana.com");
        const buyer = new PublicKey(address);
        const seller = new PublicKey(nft.owner);
        const mint = new PublicKey(nft.mint_address);
        const priceLamports = nft.price * web3.LAMPORTS_PER_SOL;

        // Get PDA for escrow authority
        const [pda, bump] = PublicKey.findProgramAddressSync(
            [Buffer.from("authority")],
            PROGRAM_ID
        );

        // Derive token accounts
        const buyerTokenAccount = await getAssociatedTokenAddress(mint, buyer);
        const escrowTokenAccount = await getAssociatedTokenAddress(mint, pda, true); // true: PDA ATA
        const sellerTokenAccount = await getAssociatedTokenAddress(mint, seller);

        // Get latest blockhash
        const latestBlockhash = await connection.getLatestBlockhash();

        // Prepare transaction
        const transaction = new Transaction({
            feePayer: buyer,
            recentBlockhash: latestBlockhash.blockhash,
        });

        // Create Anchor provider & program
        const provider = new AnchorProvider(
            connection,
            walletProvider as any,
            {
                preflightCommitment: "processed",
                commitment: "processed",
                skipPreflight: true,
                maxRetries: 5,
            }
        );

        const program = new Program(idl as any, provider);

        // Build buy_nft instruction
        const buyInstruction = await program.methods
            .buyNft(bump)
            .accounts({
                buyer,
                seller,
                mint,
                buyerTokenAccount,
                escrowTokenAccount,
                pda,
                listing: PublicKey.findProgramAddressSync(
                    [Buffer.from("listing"), mint.toBuffer()],
                    PROGRAM_ID
                )[0],
                tokenProgram: TOKEN_PROGRAM_ID,
                associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
                rent: SYSVAR_RENT_PUBKEY,
            })
            .instruction();

        transaction.add(buyInstruction);

        // Sign and send transaction
        const txSig = await walletProvider.sendTransaction(transaction, connection);
        console.log("✅ buy_nft tx confirmed:", txSig);

        // Update backend
        const res = await fetch("http://127.0.0.1:8000/update_nft_listing_status", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                mint_address: nft.mint_address,
                is_listed: false,
                new_owner: address,
            }),
        });

        if (!res.ok) throw new Error("Failed to update NFT listing status");

        // Update UI
        setListedNFTs((prev) =>
            prev.filter((listedNft) => listedNft.mint_address !== nft.mint_address)
        );

        alert(`✅ Successfully bought "${nft.name}" for ${nft.price} SOL`);
    } catch (error: any) {
        console.error("Buy error:", error);
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
                
              {listedNFTs.map((nft, idx) => (
                <ListedNFTCard
                  key={idx}
                  nft={nft}
                  onBuy={() => handleBuy(nft)}
                />
              ))}
              </div>
            </div>
          ) : (
            <div className="p-4 text-center  rounded-lg">
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


function mplToolbox(): import("@metaplex-foundation/umi").UmiPlugin {
  throw new Error('Function not implemented.');
}

