"use client";

import Layout from "../../components/Layout";
import { useState, useEffect } from "react";
import * as anchor from "@coral-xyz/anchor";
import {
    Keypair,
    PublicKey,
    SendTransactionError,
    SystemProgram,
    SYSVAR_RENT_PUBKEY,
    Transaction,
} from "@solana/web3.js";
import {
    TOKEN_PROGRAM_ID,
    getAssociatedTokenAddress,
    ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import idl from "../../idl/nft_marketplace.json";
import {
    useAppKitAccount,
    useAppKitProvider,
} from "@reown/appkit/react";
import { useAppKitConnection } from "@reown/appkit-adapter-solana/react";
import type { Provider } from "@reown/appkit-adapter-solana/react";

const PROGRAM_ID = new PublicKey(process.env.program_id || "8kU8YRPEr9SYYfr37iEb7PDLTARq2yuWr2kL7emyzYAk");
const TOKEN_METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
const AUTHORITY_SEED = "authority";
const LISTING_SEED = "listing";

// Maximum file size (5MB)
const MAX_FILE_SIZE = 5 * 1024 * 1024;

export default function UploadNFTPage() {
    const [isClient, setIsClient] = useState(false);
    
    // Wallet connections
    const { walletProvider } = useAppKitProvider<Provider>("solana");
    const { connection } = useAppKitConnection();
    const { isConnected, address } = useAppKitAccount();

    // Form state
    const [file, setFile] = useState<File | null>(null);
    const [filePreview, setFilePreview] = useState<string | null>(null);
    const [name, setName] = useState("");
    const [symbol, setSymbol] = useState("");
    const [description, setDescription] = useState("");
    const [price, setPrice] = useState<number>(0.5);
    const [autoList, setAutoList] = useState(true);
    
    // Process state
    const [processing, setProcessing] = useState(false);
    const [status, setStatus] = useState("");
    const [mintedNFT, setMintedNFT] = useState<string | null>(null);
    const [isComplete, setIsComplete] = useState(false);

    useEffect(() => {
        setIsClient(true);
    }, [address]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target?.files?.[0];
        if (!selectedFile) {
            setFile(null);
            setFilePreview(null);
            return;
        }

        if (selectedFile.size > MAX_FILE_SIZE) {
            setStatus("❌ File size exceeds 5MB limit");
            return;
        }

        if (!selectedFile.type.startsWith('image/')) {
            setStatus("❌ Only image files are allowed");
            return;
        }

        setFile(selectedFile);
        const reader = new FileReader();
        reader.onloadend = () => {
            setFilePreview(reader.result as string);
        };
        reader.readAsDataURL(selectedFile);
        setStatus("");
    };

    const handleCreateNFT = async () => {
        if (!file || !name || !symbol || !address || !connection || !walletProvider) {
            setStatus("❌ Please fill in all required fields and connect your wallet");
            return;
        }

        if (autoList && price <= 0) {
            setStatus("❌ Please set a valid price for listing");
            return;
        }

        setProcessing(true);
        setStatus("🚀 Starting NFT creation process...");

        try {
            // Step 1: Upload metadata
            setStatus("📤 Uploading image and metadata...");
            
            const formData = new FormData();
            formData.append("name", name);
            formData.append("symbol", symbol);
            formData.append("description", description || "A unique Solana NFT");
            formData.append("file", file);

            const uploadResponse = await fetch("/api/mint-nft", {
                method: "POST",
                body: formData,
            });

            const uploadResult = await uploadResponse.json();
            
            if (!uploadResponse.ok || !uploadResult.success) {
                throw new Error(uploadResult.error || "Failed to upload NFT data");
            }

            // Step 2: Mint NFT
            setStatus("⚡ Minting NFT on Solana blockchain...");
            
            const wallet = new PublicKey(address);
            const mintKeypair = Keypair.generate();

            // Get PDAs
            const [metadataPda] = PublicKey.findProgramAddressSync(
                [
                    Buffer.from("metadata"),
                    TOKEN_METADATA_PROGRAM_ID.toBuffer(),
                    mintKeypair.publicKey.toBuffer(),
                ],
                TOKEN_METADATA_PROGRAM_ID
            );

            const [masterEditionPda] = PublicKey.findProgramAddressSync(
                [
                    Buffer.from("metadata"),
                    TOKEN_METADATA_PROGRAM_ID.toBuffer(),
                    mintKeypair.publicKey.toBuffer(),
                    Buffer.from("edition"),
                ],
                TOKEN_METADATA_PROGRAM_ID
            );

            const [pda, bump] = PublicKey.findProgramAddressSync(
                [Buffer.from(AUTHORITY_SEED)],
                PROGRAM_ID
            );

            const ata = await getAssociatedTokenAddress(mintKeypair.publicKey, wallet);
            const latestBlockhash = await connection.getLatestBlockhash();

            const transaction = new Transaction({
                feePayer: wallet,
                recentBlockhash: latestBlockhash.blockhash,
            });

            const provider = new anchor.AnchorProvider(
                connection, 
                walletProvider as any, 
                {
                    preflightCommitment: "processed",
                    commitment: "processed",
                    skipPreflight: true,
                    maxRetries: 5,
                }
            );

            const program = new anchor.Program(idl as any, provider);

            const mintInstruction = await program.methods
                .mintNft(name, symbol, uploadResult.metadataUri, bump)
                .accounts({
                    signer: wallet,
                    mint: mintKeypair.publicKey,
                    pda: pda,
                    associatedTokenAccount: ata,
                    metadataAccount: metadataPda,
                    masterEditionAccount: masterEditionPda,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                    tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
                    systemProgram: SystemProgram.programId,
                    rent: SYSVAR_RENT_PUBKEY,
                })
                .instruction();

            transaction.add(mintInstruction);
            transaction.partialSign(mintKeypair);

            const mintSignature = await walletProvider.sendTransaction(transaction, connection);
            setMintedNFT(mintKeypair.publicKey.toBase58());

            // Step 3: List on marketplace (if enabled)
            if (autoList) {
                setStatus("🏪 Listing NFT on marketplace...");
                
                const mint = mintKeypair.publicKey;
                const [listingPda, listingBump] = PublicKey.findProgramAddressSync(
                    [Buffer.from(LISTING_SEED), mint.toBuffer()],
                    PROGRAM_ID
                );

                const sellerTokenAccount = await getAssociatedTokenAddress(mint, wallet);
                const escrowTokenAccount = await getAssociatedTokenAddress(mint, pda, true);

                const listingTransaction = new Transaction({
                    feePayer: wallet,
                    recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
                });

                const priceInLamports = Math.floor(price * 1_000_000_000);

                const listingInstruction = await program.methods
                    .listNft(new anchor.BN(priceInLamports), listingBump)
                    .accounts({
                        seller: wallet,
                        mint: mint,
                        pda: pda,
                        sellerTokenAccount: sellerTokenAccount,
                        escrowTokenAccount: escrowTokenAccount,
                        listing: listingPda,
                        tokenProgram: TOKEN_PROGRAM_ID,
                        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                        systemProgram: SystemProgram.programId,
                        rent: SYSVAR_RENT_PUBKEY,
                    })
                    .instruction();

                listingTransaction.add(listingInstruction);
                await walletProvider.sendTransaction(listingTransaction, connection);

                // Update backend database
                const nftData = {
                    mint_address: mintKeypair.publicKey.toBase58(),
                    name,
                    symbol,
                    price,
                    image_uri: uploadResult.imageUri,
                    metadata_uri: uploadResult.metadataUri,
                    owner: address,
                };

                await fetch("http://127.0.0.1:8000/list_nft", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(nftData),
                });

                setStatus("✅ NFT created and listed successfully!");
            } else {
                setStatus("✅ NFT minted successfully!");
            }

            setIsComplete(true);

        } catch (error: any) {
            handleError(error);
        } finally {
            setProcessing(false);
        }
    };

    const handleError = (error: any) => {
        console.error("Error details:", error);

        if (error instanceof SendTransactionError) {
            const errorMessage = error.message;
            if (errorMessage.includes("insufficient funds")) {
                setStatus("❌ Error: Insufficient SOL for transaction fees. Please add more SOL to your wallet.");
            } else if (errorMessage.includes("blockhash")) {
                setStatus("❌ Error: Transaction expired. Please try again.");
            } else if (errorMessage.includes("timeout") || errorMessage.includes("confirmed")) {
                setStatus("❌ Transaction confirmation timeout. Check Solana Explorer for transaction status.");
            } else {
                setStatus(`❌ Transaction failed: ${errorMessage}`);
            }
        } else if (error instanceof anchor.AnchorError) {
            setStatus(`❌ Program error: ${error.error.errorMessage || error.message}`);
        } else if (error instanceof Error) {
            setStatus(`❌ Error: ${error.message}`);
        } else {
            setStatus("❌ Unknown error occurred. Please try again or check Solana Explorer.");
        }
    };

    const resetForm = () => {
        setName("");
        setSymbol("");
        setDescription("");
        setPrice(0.5);
        setFile(null);
        setFilePreview(null);
        setStatus("");
        setMintedNFT(null);
        setIsComplete(false);
        setAutoList(true);
    };

    if (!isClient) return null;

    return (
        <Layout>
            <div className="flex flex-col w-full min-h-full overflow-y-auto">
                {/* Header */}
                <div className="sticky top-0 bg-base-100 z-10 m-6 pt-1.5 pb-2 border-b">
                    <h2 className="text-2xl font-bold">Create NFT</h2>
                    <p className="text-sm text-gray-600 mt-1">
                        Upload your image, set details, and mint your NFT in one simple form
                    </p>
                </div>

                {/* Content */}
                <div className="flex-1 p-6 pt-2">
                    {!isConnected && (
                        <div className="bg-yellow-100 text-yellow-800 p-4 rounded mb-6">
                            <p className="font-medium">Please connect your wallet to create NFTs</p>
                        </div>
                    )}

                    {status && (
                        <div className={`p-4 rounded mb-6 ${
                            status.includes("❌") ? 
                            "bg-red-100 text-red-600" : 
                            status.includes("✅") ? 
                            "bg-green-100 text-green-600" : 
                            "bg-blue-100 text-blue-600"
                        }`}>
                            {status}
                        </div>
                    )}

                    {!isComplete ? (
                        <div className="max-w-4xl mx-auto">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                {/* Left Column - Form Fields */}
                                <div className="space-y-6">
                                    <h3 className="text-xl font-semibold">NFT Details</h3>
                                    
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block font-medium mb-2">
                                                Name <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                placeholder="Enter NFT name"
                                                value={name}
                                                onChange={(e) => setName(e.target.value)}
                                                className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                disabled={processing}
                                            />
                                        </div>
                                        
                                        <div>
                                            <label className="block font-medium mb-2">
                                                Symbol <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                placeholder="Enter symbol (e.g., NFT)"
                                                value={symbol}
                                                onChange={(e) => setSymbol(e.target.value)}
                                                className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                disabled={processing}
                                            />
                                        </div>

                                        <div>
                                            <label className="block font-medium mb-2">Description</label>
                                            <textarea
                                                placeholder="Describe your NFT"
                                                value={description}
                                                onChange={(e) => setDescription(e.target.value)}
                                                className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                rows={4}
                                                disabled={processing}
                                            />
                                        </div>

                                        <div className="flex items-center space-x-3">
                                            <input
                                                type="checkbox"
                                                id="autoList"
                                                checked={autoList}
                                                onChange={(e) => setAutoList(e.target.checked)}
                                                className="w-4 h-4 text-blue-600"
                                                disabled={processing}
                                            />
                                            <label htmlFor="autoList" className="font-medium">
                                                List on marketplace after minting
                                            </label>
                                        </div>

                                        {autoList && (
                                            <div>
                                                <label className="block font-medium mb-2">
                                                    Price (SOL) <span className="text-red-500">*</span>
                                                </label>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    min="0.01"
                                                    placeholder="e.g., 0.5"
                                                    value={price}
                                                    onChange={(e) => setPrice(parseFloat(e.target.value))}
                                                    className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                    disabled={processing}
                                                />
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Right Column - Image Upload */}
                                <div className="space-y-6">
                                    <h3 className="text-xl font-semibold">Upload Image</h3>
                                    
                                    <div>
                                        <label className="block font-medium mb-2">
                                            Choose Image <span className="text-red-500">*</span>
                                        </label>
                                        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-400 transition-colors">
                                            <input
                                                type="file"
                                                accept="image/*"
                                                onChange={handleFileChange}
                                                className="hidden"
                                                id="fileInput"
                                                disabled={processing}
                                            />
                                            <label htmlFor="fileInput" className="cursor-pointer">
                                                {filePreview ? (
                                                    <div className="space-y-2">
                                                        <img
                                                            src={filePreview}
                                                            alt="Preview"
                                                            className="max-h-64 max-w-full object-contain mx-auto rounded"
                                                        />
                                                        <p className="text-sm text-gray-600">
                                                            Click to change image
                                                        </p>
                                                    </div>
                                                ) : (
                                                    <div className="space-y-2">
                                                        <div className="text-6xl text-gray-400">📁</div>
                                                        <p className="text-lg font-medium">Click to upload image</p>
                                                        <p className="text-sm text-gray-500">
                                                            PNG, JPG, GIF up to 5MB
                                                        </p>
                                                    </div>
                                                )}
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Submit Button */}
                            <div className="flex justify-center mt-8">
                                <button
                                    onClick={handleCreateNFT}
                                    disabled={!file || !name || !symbol || !isConnected || processing || (autoList && price <= 0)}
                                    className={`px-8 py-4 rounded-lg text-white font-bold text-lg transition-all ${
                                        !file || !name || !symbol || !isConnected || processing || (autoList && price <= 0)
                                            ? "bg-gray-400 cursor-not-allowed"
                                            : "bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                                    }`}
                                >
                                    {processing ? (
                                        <span className="flex items-center">
                                            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                            Creating...
                                        </span>
                                    ) : (
                                        autoList ? "Create & List NFT" : "Mint NFT"
                                    )}
                                </button>
                            </div>
                        </div>
                    ) : (
                        /* Success State */
                        <div className="max-w-2xl mx-auto text-center space-y-6">
                            <div className="text-6xl mb-4">🎉</div>
                            <h3 className="text-3xl font-bold text-green-600">Success!</h3>
                            <p className="text-xl text-gray-700">
                                Your NFT has been {autoList ? "created and listed" : "minted"} successfully!
                            </p>
                            
                            {mintedNFT && (
                                <div className="bg-green-50 border border-green-200 p-6 rounded-lg">
                                    <h4 className="font-semibold text-lg mb-4">NFT Details</h4>
                                    <div className="text-left space-y-2 max-w-md mx-auto">
                                        <p><strong>Name:</strong> {name}</p>
                                        <p><strong>Symbol:</strong> {symbol}</p>
                                        {autoList && <p><strong>Price:</strong> {price} SOL</p>}
                                        <p><strong>Mint Address:</strong></p>
                                        <p className="font-mono text-sm bg-white p-2 rounded border break-all">
                                            {mintedNFT}
                                        </p>
                                        <div className="pt-2">
                                            <a
                                                href={`https://explorer.solana.com/address/${mintedNFT}?cluster=devnet`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-blue-600 hover:text-blue-800 underline"
                                            >
                                                View on Solana Explorer →
                                            </a>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-6">
                                <button
                                    onClick={() => window.location.href = '/'}
                                    className="px-6 py-3 rounded-lg text-white font-bold bg-blue-600 hover:bg-blue-700 transition-colors"
                                >
                                    View Marketplace
                                </button>
                                <button
                                    onClick={resetForm}
                                    className="px-6 py-3 rounded-lg text-white font-bold bg-green-600 hover:bg-green-700 transition-colors"
                                >
                                    Create Another NFT
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </Layout>
    );
}