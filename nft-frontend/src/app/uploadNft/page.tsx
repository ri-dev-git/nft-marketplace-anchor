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
import { Connection, Provider, useAppKitConnection } from "@reown/appkit-adapter-solana/react";

const PROGRAM_ID = new PublicKey("7oEFwgSPqj1XWYQJ9yEC8PAgP45Ye8pK8uW5e8NqiAdt");
const TOKEN_METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

// Maximum file size (5MB)
const MAX_FILE_SIZE = 5 * 1024 * 1024;

interface NFTData {
    mint_address: string;
    name: string;
    symbol: string;
    price: number;
    image_uri: string;
    metadata_uri: string;
    owner: string;
}

interface UploadResult {
    success: boolean;
    metadataUri: string;
    imageUri: string;
    error?: string;
}

export default function SellPage() {
    const [price, setPrice] = useState<number>(0.5);
    const [isClient, setIsClient] = useState(false);
    const { walletProvider } = useAppKitProvider<Provider>("solana");
    const connection: Connection = useAppKitConnection().connection as Connection;
    const { isConnected, address } = useAppKitAccount();
    const publicKey = walletProvider?.publicKey;
    console.log(connection, "connection");
    const [file, setFile] = useState<File | null>(null);
    const [filePreview, setFilePreview] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [name, setName] = useState("");
    const [symbol, setSymbol] = useState("");
    const [description, setDescription] = useState("");
    const [status, setStatus] = useState("");
    const [mintedNFT, setMintedNFT] = useState<string | null>(null);
    const [progress, setProgress] = useState(0);

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
            setStatus("File size exceeds 5MB limit");
            return;
        }

        if (!selectedFile.type.startsWith('image/')) {
            setStatus("Only image files are allowed");
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

    if (!isClient) return null;

    // Improved transaction confirmation with retries and better error handling
    const confirmTransaction = async (
        connection: Connection,
        signature: string,
        maxRetries: number = 3
    ): Promise<boolean> => {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`Confirmation attempt ${attempt}/${maxRetries} for signature: ${signature}`);
                setStatus(`Confirming transaction (attempt ${attempt}/${maxRetries})...`);

                // Use a more reliable confirmation method
                const confirmation = await connection.confirmTransaction(
                    signature,
                    'confirmed' // Use 'confirmed' for better reliability
                );

                if (confirmation.value.err) {
                    console.error('Transaction failed:', confirmation.value.err);
                    setStatus(`Transaction failed: ${confirmation.value.err}`);
                    return false;
                }

                console.log('Transaction confirmed successfully');
                setStatus("Transaction confirmed successfully!");
                return true;

            } catch (err: any) {
                console.error(`Confirmation attempt ${attempt} failed:`, err.message);

                if (attempt < maxRetries) {
                    const waitTime = attempt * 3000; // Progressive wait: 3s, 6s, 9s
                    setStatus(`Confirmation attempt ${attempt} failed, retrying in ${waitTime / 1000}s...`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                } else {
                    setStatus("Transaction confirmation timed out, checking final status...");
                }
            }
        }

        // Final check - sometimes the transaction succeeds but confirmation times out
        try {
            console.log("Performing final transaction status check...");
            const status = await connection.getSignatureStatus(signature);

            if (status.value?.confirmationStatus === 'confirmed' ||
                status.value?.confirmationStatus === 'finalized') {
                console.log('Transaction was actually confirmed in final check');
                setStatus("Transaction confirmed (verified in final check)!");
                return true;
            }

            if (status.value?.err) {
                console.error('Transaction failed in final check:', status.value.err);
                setStatus(`Transaction failed: ${status.value.err}`);
                return false;
            }

        } catch (err) {
            console.error('Failed to check final transaction status:', err);
        }

        setStatus("⚠️ Transaction status unclear - please check Solana Explorer");
        return false;
    };

    // Upload metadata and image to your backend
    const uploadNFTData = async (): Promise<UploadResult> => {
        if (!file) {
            throw new Error("No file selected");
        }

        const formData = new FormData();
        formData.append("name", name);
        formData.append("symbol", symbol);
        formData.append("description", description || "A Solana NFT");
        formData.append("file", file);

        const response = await fetch("/api/mint-nft", {
            method: "POST",
            body: formData,
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.error || "Failed to upload NFT data");
        }

        return result;
    };

    // Mint NFT on-chain with improved error handling and simulation
    const mintNFTOnChain = async (metadataUri: string): Promise<string> => {
        if (!publicKey || !walletProvider) {
            throw new Error("Wallet not connected");
        }

        const mintKeypair = anchor.web3.Keypair.generate();

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

        // Improved provider configuration
        const provider = new anchor.AnchorProvider(
            connection,
            walletProvider as any,
            {
                preflightCommitment: "confirmed", // Changed from "processed"
                commitment: "confirmed",
                skipPreflight: true, // Enable preflight for better error detection
                maxRetries: 3,
            }
        );

        anchor.setProvider(provider);
        const program = new anchor.Program(idl as any, provider);

        const ata = await getAssociatedTokenAddress(mintKeypair.publicKey, publicKey);

        setStatus("Preparing transaction...");


        // Send the actual transaction
        setStatus("Signing and sending transaction...");

        const signature = await program.methods
            .mintNft(name, symbol, metadataUri)
            .accounts({
                signer: publicKey,
                mint: mintKeypair.publicKey,
                associated_token_account: ata,
                metadataAccount: metadataPda,
                masterEditionAccount: masterEditionPda,
                tokenProgram: TOKEN_PROGRAM_ID,
                associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
                rent: SYSVAR_RENT_PUBKEY,
            })
            .signers([mintKeypair])
            .rpc();

        setStatus(`Transaction sent: ${signature.slice(0, 8)}...`);
        console.log('Transaction signature:', signature);

        const confirmed = await confirmTransaction(connection, signature);

        if (!confirmed) {
            throw new Error(`Transaction confirmation failed. Check signature: ${signature} on Solana Explorer`);
        }

        return mintKeypair.publicKey.toBase58();
    };

    // Send NFT data to backend marketplace
    const listNFTOnMarketplace = async (nftData: NFTData): Promise<boolean> => {
        try {
            setStatus("Listing NFT on marketplace...");

            const response = await fetch("http://127.0.0.1:8080/list_nft", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(nftData),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || "Failed to list NFT on marketplace");
            }

            console.log("NFT listed successfully:", result);
            return true;
        } catch (error: any) {
            console.error("Error listing NFT:", error.message);
            throw error;
        }
    };

    // Main minting function with proper error handling and flow
    const onMint = async () => {
        if (!publicKey || !file || !name || !symbol) {
            setStatus("Please fill all required fields and connect wallet.");
            return;
        }

        if (uploading) {
            setStatus("Already processing. Please wait.");
            return;
        }

        setUploading(true);
        setProgress(0);
        setStatus("Starting NFT creation process...");

        try {
            // Step 1: Upload image and metadata to backend
            setProgress(20);
            setStatus("Uploading image and metadata...");

            const uploadResult = await uploadNFTData();

            // Step 2: Mint NFT on-chain
            setProgress(50);
            setStatus("Minting NFT on blockchain...");

            const mintAddress = await mintNFTOnChain(uploadResult.metadataUri);

            setProgress(80);
            setStatus("NFT minted successfully! Listing on marketplace...");

            // Step 3: List NFT on marketplace backend
            const nftData: NFTData = {
                mint_address: mintAddress,
                name,
                symbol,
                price,
                image_uri: uploadResult.imageUri,
                metadata_uri: uploadResult.metadataUri,
                owner: publicKey.toBase58(),
            };

            await listNFTOnMarketplace(nftData);

            // Success!
            setProgress(100);
            setStatus("✅ NFT minted and listed successfully!");
            setMintedNFT(mintAddress);

        } catch (error: any) {
            console.error("Minting process failed:", error);
            handleError(error);
            setProgress(0);
        } finally {
            setUploading(false);
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
            setStatus(`❌ Program error: ${error.error?.errorMessage || error.message}`);
        } else if (error.message?.includes("simulation")) {
            setStatus(`❌ Transaction simulation failed: ${error.message}. Please check your wallet balance and try again.`);
        } else if (error.message?.includes("upload") || error.message?.includes("fetch")) {
            setStatus(`❌ Upload error: ${error.message}. Please check your connection and try again.`);
        } else if (error.message?.includes("marketplace") || error.message?.includes("list")) {
            setStatus(`❌ Marketplace error: ${error.message}. NFT was minted but failed to list.`);
        } else if (error.message?.includes("confirmation")) {
            setStatus(`❌ ${error.message}`);
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
        setProgress(0);
        setMintedNFT(null);
    };

    return (
        <Layout>
            <div className="flex flex-col w-full min-h-full overflow-y-auto">
                {/* Header */}
                <div className="sticky top-0 bg-base-100 z-10 m-6 pt-1.5 pb-2 border-b">
                    <h2 className="text-2xl font-bold">Create & Mint NFT</h2>
                </div>

                {/* Content */}
                <div className="flex-1 p-6 pt-2">
                    <p className="text-white-100 mb-6">
                        Fill out the details below to mint a new NFT and list it on the marketplace.
                    </p>

                    <div className="flex border-t-2 p-2 w-full flex-col place-content-evenly gap-4">
                        {/* Status Messages */}
                        {status && (
                            <div className={`p-3 rounded ${status.includes("❌") || status.includes("Error") || status.includes("error") || status.includes("failed")
                                ? "bg-red-100 text-red-600"
                                : status.includes("✅")
                                    ? "bg-green-100 text-green-600"
                                    : status.includes("⚠️")
                                        ? "bg-yellow-100 text-yellow-600"
                                        : "bg-blue-100 text-blue-600"
                                }`}>
                                {status}
                            </div>
                        )}

                        {/* Success Message */}
                        {mintedNFT && (
                            <div className="bg-green-100 text-green-700 p-4 rounded mb-4">
                                <h3 className="font-bold">🎉 NFT Created Successfully!</h3>
                                <p className="mt-2">
                                    <strong>Mint Address:</strong>
                                    <span className="font-mono text-sm block mt-1">{mintedNFT}</span>
                                </p>
                                <div className="mt-3 flex gap-2">
                                    <a
                                        href={`https://explorer.solana.com/address/${mintedNFT}?cluster=devnet`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-600 underline text-sm"
                                    >
                                        View on Solana Explorer
                                    </a>
                                </div>
                            </div>
                        )}

                        {/* Progress Bar */}
                        {progress > 0 && progress < 100 && (
                            <div className="w-full bg-gray-200 rounded-full h-3 mb-4">
                                <div
                                    className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                                    style={{ width: `${progress}%` }}
                                ></div>
                            </div>
                        )}

                        {/* Form Fields */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="flex flex-col">
                                <label className="font-medium mb-1">
                                    Name: <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    placeholder="Enter NFT name"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="border p-2 w-full rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    disabled={uploading}
                                    maxLength={50}
                                />
                            </div>

                            <div className="flex flex-col">
                                <label className="font-medium mb-1">
                                    Symbol: <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    placeholder="e.g., NFT, ART"
                                    value={symbol}
                                    onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                                    className="border p-2 w-full rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    disabled={uploading}
                                    maxLength={10}
                                />
                            </div>

                            <div className="flex flex-col">
                                <label className="font-medium mb-1">
                                    Price (SOL): <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0.01"
                                    placeholder="e.g., 0.5"
                                    value={price}
                                    onChange={(e) => setPrice(Math.max(0.01, parseFloat(e.target.value) || 0))}
                                    className="border p-2 w-full rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    disabled={uploading}
                                />
                            </div>
                        </div>

                        <div className="flex flex-col">
                            <label className="font-medium mb-1">Description:</label>
                            <textarea
                                placeholder="Describe your NFT (optional)"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                className="border p-2 w-full rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                rows={3}
                                disabled={uploading}
                                maxLength={500}
                            />
                            <span className="text-sm text-gray-500 mt-1">
                                {description.length}/500 characters
                            </span>
                        </div>

                        <div className="flex flex-col">
                            <label className="font-medium mb-1">
                                Upload Image: <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="file"
                                accept="image/*"
                                onChange={handleFileChange}
                                className="p-2 border-2 border-dotted rounded hover:border-blue-400 focus:border-blue-500"
                                disabled={uploading}
                            />
                            <p className="text-sm text-gray-500 mt-1">
                                Supported: JPG, PNG, GIF. Maximum: 5MB
                            </p>

                            {filePreview && (
                                <div className="mt-3 border rounded p-3 bg-gray-50">
                                    <p className="font-medium mb-2">Preview:</p>
                                    <img
                                        src={filePreview}
                                        alt="NFT Preview"
                                        className="max-h-48 max-w-full object-contain rounded shadow-sm"
                                    />
                                </div>
                            )}
                        </div>

                        {/* Action Buttons */}
                        <div className="flex justify-center mt-6 gap-4">
                            {mintedNFT ? (
                                <button
                                    onClick={resetForm}
                                    className="px-8 py-3 rounded-lg text-white font-bold bg-green-600 hover:bg-green-700 transition-colors shadow-lg"
                                >
                                    Create Another NFT
                                </button>
                            ) : (
                                <button
                                    onClick={onMint}
                                    disabled={!publicKey || !file || uploading || !name || !symbol || price <= 0}
                                    className={`px-8 py-3 rounded-lg text-white font-bold transition-colors shadow-lg ${!publicKey || !file || uploading || !name || !symbol || price <= 0
                                        ? "bg-gray-400 cursor-not-allowed"
                                        : "bg-blue-600 hover:bg-blue-700"
                                        }`}
                                >
                                    {uploading ? (
                                        <span className="flex items-center">
                                            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                            Processing...
                                        </span>
                                    ) : "Mint & List NFT"}
                                </button>
                            )}
                        </div>

                        {/* Connection Status */}
                        {!publicKey && (
                            <div className="text-center p-4 bg-yellow-100 text-yellow-700 rounded">
                                Please connect your wallet to mint NFTs
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </Layout>
    );
}