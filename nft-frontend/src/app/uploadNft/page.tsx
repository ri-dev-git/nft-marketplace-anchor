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
import { pinata } from "../../../utils/config";
import { JsonBody } from "pinata";

const PROGRAM_ID = new PublicKey("7oEFwgSPqj1XWYQJ9yEC8PAgP45Ye8pK8uW5e8NqiAdt");
const TOKEN_METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

// Maximum file size (5MB)
const MAX_FILE_SIZE = 5 * 1024 * 1024;

export default function SellPage() {
    const [price, setPrice] = useState<number>(0.5); // Default price
    const [isClient, setIsClient] = useState(false);
    const { walletProvider } = useAppKitProvider<Provider>("solana");
    const connection: Connection = useAppKitConnection().connection as Connection;
    const { isConnected, address } = useAppKitAccount();
    const publicKey = walletProvider?.publicKey;


    const [file, setFile] = useState<File | null>(null);
    const [filePreview, setFilePreview] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [name, setName] = useState("");
    const [symbol, setSymbol] = useState("");
    const [description, setDescription] = useState("");
    const [status, setStatus] = useState("");
    const [mintedNFT, setMintedNFT] = useState<string | null>(null);
    const [progress, setProgress] = useState(0);

    // Ensure this only runs on the client
    useEffect(() => {
        setIsClient(true);
    }, [address]);

    // File validation and preview
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target?.files?.[0];
        if (!selectedFile) {
            setFile(null);
            setFilePreview(null);
            return;
        }

        // Check file size
        if (selectedFile.size > MAX_FILE_SIZE) {
            setStatus("File size exceeds 5MB limit");
            return;
        }

        // Check file type
        if (!selectedFile.type.startsWith('image/')) {
            setStatus("Only image files are allowed");
            return;
        }

        setFile(selectedFile);

        // Create preview
        const reader = new FileReader();
        reader.onloadend = () => {
            setFilePreview(reader.result as string);
        };
        reader.readAsDataURL(selectedFile);

        // Clear any previous error messages
        setStatus("");
    };

    if (!isClient) return null;


    const confirmTransaction = async (
        connection: Connection,
        signature: string
    ): Promise<boolean> => {
        try {
            const latestBlockhash = await connection.getLatestBlockhash("confirmed");
            const confirmationStrategy = {
                signature,
                ...latestBlockhash,
            };
            await connection.confirmTransaction(confirmationStrategy, "confirmed");
            return true;
        } catch (err) {
            console.error("Transaction confirmation failed:", err);
            return false;
        }
    };

    const listNFTOnMarketplace = async (nftData: {
        mint_address: string;
        name: string;
        symbol: string;
        price: number;
        image_uri: string;
        metadata_uri: string;
    }) => {
        try {
            const response = await fetch("http://127.0.0.1:8080/list_nft", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(nftData),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || "Failed to list NFT");
            }

            console.log("NFT listed successfully:", result);
            return true;
        } catch (error: any) {
            console.error("Error listing NFT:", error.message);
            return false;
        }
    };

    // Mint NFT with improved confirmation handling
    const onMint = async () => {

        if (!publicKey || !file) {
            setStatus("Connect wallet and select file first.");
            return;
        }
        if (uploading) {
            setStatus("Already processing. Please wait.");
            return;
        }

        setUploading(true);
        setProgress(5);
        setStatus("Uploading data to backend...");


        try {
            // Prepare form data
            const formData = new FormData();
            formData.append("name", name);
            formData.append("symbol", symbol);
            formData.append("description", description || "A Solana NFT");
            formData.append("file", file);

            // Send to backend
            const response = await fetch("/api/mint-nft", {
                method: "POST",
                body: formData,
            });

            const result = await response.json();
            console.log("Upload result:", result);
            if (!response.ok || !result.success) {
                throw new Error(result.error || "Failed to upload NFT data");
            }

            const { metadataUri } = result;

            setProgress(70);
            setStatus("Preparing mint transaction...");

            // Now mint using user wallet
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

            const provider = new anchor.AnchorProvider(connection, walletProvider as any, {
                preflightCommitment: "processed",
                commitment: "processed",
                skipPreflight: true,
                maxRetries: 5,
            });

            anchor.setProvider(provider);

            const program = new anchor.Program(idl as any, provider);

            const ata = await getAssociatedTokenAddress(mintKeypair.publicKey, publicKey);

            setStatus("Signing and paying transaction...");
            setProgress(80);

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

            setProgress(90);
            setStatus(`Transaction sent: ${signature.slice(0, 8)}...`);

            const confirmed = await confirmTransaction(connection, signature);

            if (confirmed) {
                setProgress(100);
                setStatus("✅ NFT minted successfully!");
                setMintedNFT(mintKeypair.publicKey.toBase58());
                // Prepare NFT data for listing
                const nftData = {
                    mint_address: mintKeypair.publicKey.toBase58(),
                    name,
                    symbol,
                    price,
                    image_uri: `${result.imageUri}`,
                    metadata_uri: `${result.metadataUri}`,
                    owner: publicKey?.toBase58(),
                };
                // List NFT on marketplace
                const listed = await listNFTOnMarketplace(nftData);
                if (listed) {
                    setStatus("✅ NFT minted and listed successfully!");
                } else {
                    setStatus("⚠️ NFT minted but failed to list.");
                }
            } else {
                setStatus("⚠️ Transaction may not have been confirmed.");
            }

        } catch (error: any) {
            handleError(error);
            setProgress(0);
        } finally {
            setUploading(false);
        }
    };


    const handleError = (error: any) => {
        console.error("Error details:", error);

        if (error instanceof SendTransactionError) {
            // Extract Solana-specific error information
            const errorMessage = error.message;

            if (errorMessage.includes("insufficient funds")) {
                setStatus("Error: Insufficient funds for transaction. Please add more SOL to your wallet.");
            } else if (errorMessage.includes("blockhash")) {
                setStatus("Error: Transaction blockhash expired. Please try again.");
            } else {
                setStatus(`Transaction failed: ${errorMessage}`);
            }
        } else if (error instanceof anchor.AnchorError) {
            setStatus(`Program error: ${error.error.errorMessage || error.message}`);
        } else if (error.message?.includes("upload")) {
            setStatus(`Upload error: ${error.message}. Please check your connection and try again.`);
        } else if (error instanceof Error) {
            setStatus(`Error: ${error.message}`);
        } else {
            setStatus("Unknown error occurred. Please try again.");
        }
    };

    // Reset form
    const resetForm = () => {
        setName("");
        setSymbol("");
        setDescription("");
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
                        Fill out the details below to mint a new NFT. You must provide a name, symbol, and an image file.
                    </p>

                    <div className="flex border-t-2 p-2 w-full flex-col place-content-evenly gap-4">
                        {status && (
                            <div className={`p-3 rounded ${status.includes("Error") || status.includes("error") || status.includes("failed") ? "bg-red-100 text-red-600" : status.includes("✅") ? "bg-green-100 text-green-600" : "bg-blue-100 text-blue-600"}`}>
                                {status}
                            </div>
                        )}

                        {mintedNFT && (
                            <div className="bg-green-100 text-green-700 p-4 rounded mb-4">
                                <h3 className="font-bold">NFT Minted Successfully!</h3>
                                <p>Mint Address: <span className="font-mono">{mintedNFT}</span></p>
                                <p className="mt-2">
                                    <a
                                        href={`https://explorer.solana.com/address/${mintedNFT}?cluster=devnet`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-600 underline"
                                    >
                                        View on Solana Explorer
                                    </a>
                                </p>
                            </div>
                        )}

                        {progress > 0 && progress < 100 && (
                            <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4">
                                <div
                                    className="bg-blue-600 h-2.5 rounded-full"
                                    style={{ width: `${progress}%` }}
                                ></div>
                            </div>
                        )}

                        <div className="flex flex-col">
                            <span className="font-medium mb-1">Name:<span className="text-red-500">*</span></span>
                            <input
                                type="text"
                                placeholder="Enter NFT name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="border p-2 w-full rounded"
                                disabled={uploading}
                            />
                        </div>
                        <div className="flex flex-col">
                            <span className="font-medium mb-1">Price (in SOL):<span className="text-red-500">*</span></span>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder="e.g., 0.5"
                                value={price}
                                onChange={(e) => setPrice(parseFloat(e.target.value))}
                                className="border p-2 w-full rounded"
                                disabled={uploading}
                            />
                        </div>
                        <div className="flex flex-col">
                            <span className="font-medium mb-1">Symbol:<span className="text-red-500">*</span></span>
                            <input
                                type="text"
                                placeholder="Enter NFT symbol (e.g., NFT)"
                                value={symbol}
                                onChange={(e) => setSymbol(e.target.value)}
                                className="border p-2 w-full rounded"
                                disabled={uploading}
                            />
                        </div>

                        <div className="flex flex-col">
                            <span className="font-medium mb-1">Description:</span>
                            <textarea
                                placeholder="Enter NFT description"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                className="border p-2 w-full rounded"
                                rows={3}
                                disabled={uploading}
                            />
                        </div>

                        <div className="flex flex-col">
                            <span className="font-medium mb-1">Upload Image:<span className="text-red-500">*</span></span>
                            <input
                                type="file"
                                accept="image/*"
                                onChange={handleFileChange}
                                className="p-2 border-2 border-dotted rounded"
                                disabled={uploading}
                            />
                            <p className="text-sm text-gray-500 mt-1">Maximum file size: 5MB</p>

                            {filePreview && (
                                <div className="mt-2 border rounded p-2 max-w-xs">
                                    <p className="font-medium mb-1">Preview:</p>
                                    <img
                                        src={filePreview}
                                        alt="Preview"
                                        className="max-h-40 max-w-full object-contain"
                                    />
                                </div>
                            )}
                        </div>

                        <div className="flex justify-center mt-4 gap-4">
                            {mintedNFT ? (
                                <button
                                    onClick={resetForm}
                                    className="px-6 py-3 rounded text-white font-bold bg-green-600 hover:bg-green-700"
                                >
                                    Mint Another NFT
                                </button>
                            ) : (
                                <button
                                    onClick={onMint}
                                    disabled={!publicKey || !file || uploading || !name || !symbol}
                                    className={`px-6 py-3 rounded text-white font-bold ${!publicKey || !file || uploading || !name || !symbol
                                        ? "bg-blue-400 cursor-not-allowed opacity-50"
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
                                    ) : "Mint NFT"}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </Layout>
    );
}
