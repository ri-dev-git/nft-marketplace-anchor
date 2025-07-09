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

// NFT creation steps
const STEPS = [
    { id: 1, title: "Upload & Validate", description: "Upload your image and fill out NFT details" },
    { id: 2, title: "Mint NFT", description: "Create your NFT on the Solana blockchain" },
    { id: 3, title: "List for Sale", description: "Set your price and list on the marketplace" },
    { id: 4, title: "Complete", description: "Your NFT is now live on the marketplace!" }
];

export default function UploadNFTPage() {
    const [currentStep, setCurrentStep] = useState(1);
    const [price, setPrice] = useState<number>(0.5);
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
    
    // Process state
    const [processing, setProcessing] = useState(false);
    const [status, setStatus] = useState("");
    const [progress, setProgress] = useState(0);
    const [mintedNFT, setMintedNFT] = useState<string | null>(null);
    const [uploadedData, setUploadedData] = useState<any>(null);
    const [isListed, setIsListed] = useState(false);

    useEffect(() => {
        setIsClient(true);
    }, []);

    // File validation and preview
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

    // Step 1: Upload and validate data
    const handleUploadData = async () => {
        if (!file || !name || !symbol) {
            setStatus("Please fill in all required fields and select an image");
            return;
        }

        setProcessing(true);
        setStatus("Uploading image and metadata...");
        setProgress(20);

        try {
            const formData = new FormData();
            formData.append("name", name);
            formData.append("symbol", symbol);
            formData.append("description", description || "A unique Solana NFT");
            formData.append("file", file);

            const response = await fetch("/api/mint-nft", {
                method: "POST",
                body: formData,
            });

            const result = await response.json();
            
            if (!response.ok || !result.success) {
                throw new Error(result.error || "Failed to upload NFT data");
            }

            setUploadedData(result);
            setProgress(100);
            setStatus("✅ Data uploaded successfully!");
            setCurrentStep(2);
        } catch (error: any) {
            setStatus(`Upload failed: ${error.message}`);
        } finally {
            setProcessing(false);
        }
    };

    // Step 2: Mint NFT
    const handleMintNFT = async () => {
        if (!address || !connection || !walletProvider || !uploadedData) {
            setStatus("Missing required data for minting");
            return;
        }

        setProcessing(true);
        setStatus("Preparing mint transaction...");
        setProgress(20);

        try {
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

            setProgress(50);
            setStatus("Building mint instruction...");

            const instruction = await program.methods
                .mintNft(name, symbol, uploadedData.metadataUri, bump)
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

            transaction.add(instruction);
            transaction.partialSign(mintKeypair);

            setProgress(80);
            setStatus("Signing and sending transaction...");

            const signature = await walletProvider.sendTransaction(transaction, connection);
            
            setProgress(100);
            setStatus("✅ NFT minted successfully!");
            setMintedNFT(mintKeypair.publicKey.toBase58());
            setCurrentStep(3);

        } catch (error: any) {
            handleError(error);
        } finally {
            setProcessing(false);
        }
    };

    // Step 3: List NFT on marketplace
    const handleListNFT = async () => {
        if (!address || !connection || !walletProvider || !mintedNFT) {
            setStatus("Missing required data for listing");
            return;
        }

        if (price <= 0) {
            setStatus("Please set a valid price");
            return;
        }

        setProcessing(true);
        setStatus("Preparing listing transaction...");
        setProgress(20);

        try {
            const wallet = new PublicKey(address);
            const mint = new PublicKey(mintedNFT);
            
            const [pda, bump] = PublicKey.findProgramAddressSync(
                [Buffer.from(AUTHORITY_SEED)],
                PROGRAM_ID
            );

            const [listingPda, listingBump] = PublicKey.findProgramAddressSync(
                [Buffer.from(LISTING_SEED), mint.toBuffer()],
                PROGRAM_ID
            );

            const sellerTokenAccount = await getAssociatedTokenAddress(mint, wallet);
            const escrowTokenAccount = await getAssociatedTokenAddress(mint, pda, true);

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

            setProgress(50);
            setStatus("Building listing instruction...");

            const priceInLamports = Math.floor(price * 1_000_000_000); // Convert SOL to lamports

            const instruction = await program.methods
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

            transaction.add(instruction);

            setProgress(80);
            setStatus("Signing and sending listing transaction...");

            const signature = await walletProvider.sendTransaction(transaction, connection);

            // Also update backend database
            const nftData = {
                mint_address: mintedNFT,
                name,
                symbol,
                price,
                image_uri: uploadedData.imageUri,
                metadata_uri: uploadedData.metadataUri,
                owner: address,
            };

            await fetch("http://127.0.0.1:8000/list_nft", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(nftData),
            });

            setProgress(100);
            setStatus("✅ NFT listed successfully!");
            setIsListed(true);
            setCurrentStep(4);

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
                setStatus("Error: Insufficient funds for transaction. Please add more SOL to your wallet.");
            } else if (errorMessage.includes("blockhash")) {
                setStatus("Error: Transaction blockhash expired. Please try again.");
            } else {
                setStatus(`Transaction failed: ${errorMessage}`);
            }
        } else if (error instanceof anchor.AnchorError) {
            setStatus(`Program error: ${error.error.errorMessage || error.message}`);
        } else if (error instanceof Error) {
            setStatus(`Error: ${error.message}`);
        } else {
            setStatus("Unknown error occurred. Please try again.");
        }
    };

    // Reset form
    const resetForm = () => {
        setCurrentStep(1);
        setName("");
        setSymbol("");
        setDescription("");
        setPrice(0.5);
        setFile(null);
        setFilePreview(null);
        setStatus("");
        setProgress(0);
        setMintedNFT(null);
        setUploadedData(null);
        setIsListed(false);
    };

    if (!isClient) return null;

    return (
        <Layout>
            <div className="flex flex-col w-full min-h-full overflow-y-auto">
                {/* Header */}
                <div className="sticky top-0 bg-base-100 z-10 m-6 pt-1.5 pb-2 border-b">
                    <h2 className="text-2xl font-bold">Create & List NFT</h2>
                    <p className="text-sm text-gray-600 mt-1">
                        Create your NFT and list it on the marketplace in a few simple steps
                    </p>
                </div>

                {/* Progress Steps */}
                <div className="px-6 mb-4">
                    <div className="flex items-center justify-between mb-8">
                        {STEPS.map((step, index) => (
                            <div key={step.id} className="flex items-center">
                                <div className={`flex flex-col items-center ${index < STEPS.length - 1 ? 'flex-1' : ''}`}>
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                                        currentStep > step.id ? 'bg-green-500 text-white' :
                                        currentStep === step.id ? 'bg-blue-500 text-white' :
                                        'bg-gray-300 text-gray-600'
                                    }`}>
                                        {currentStep > step.id ? '✓' : step.id}
                                    </div>
                                    <div className="text-center mt-2">
                                        <div className="text-sm font-medium">{step.title}</div>
                                        <div className="text-xs text-gray-500">{step.description}</div>
                                    </div>
                                </div>
                                {index < STEPS.length - 1 && (
                                    <div className={`flex-1 h-0.5 mx-4 ${
                                        currentStep > step.id ? 'bg-green-500' : 'bg-gray-300'
                                    }`} />
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 p-6 pt-2">
                    {status && (
                        <div className={`p-3 rounded mb-4 ${
                            status.includes("Error") || status.includes("error") || status.includes("failed") ? 
                            "bg-red-100 text-red-600" : 
                            status.includes("✅") ? 
                            "bg-green-100 text-green-600" : 
                            "bg-blue-100 text-blue-600"
                        }`}>
                            {status}
                        </div>
                    )}

                    {progress > 0 && progress < 100 && (
                        <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4">
                            <div
                                className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                    )}

                    {/* Step 1: Upload & Validate */}
                    {currentStep === 1 && (
                        <div className="space-y-4">
                            <h3 className="text-lg font-semibold">NFT Details</h3>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-4">
                                    <div className="flex flex-col">
                                        <label className="font-medium mb-1">Name <span className="text-red-500">*</span></label>
                                        <input
                                            type="text"
                                            placeholder="Enter NFT name"
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            className="border p-2 rounded"
                                            disabled={processing}
                                        />
                                    </div>
                                    
                                    <div className="flex flex-col">
                                        <label className="font-medium mb-1">Symbol <span className="text-red-500">*</span></label>
                                        <input
                                            type="text"
                                            placeholder="Enter symbol (e.g., NFT)"
                                            value={symbol}
                                            onChange={(e) => setSymbol(e.target.value)}
                                            className="border p-2 rounded"
                                            disabled={processing}
                                        />
                                    </div>

                                    <div className="flex flex-col">
                                        <label className="font-medium mb-1">Description</label>
                                        <textarea
                                            placeholder="Describe your NFT"
                                            value={description}
                                            onChange={(e) => setDescription(e.target.value)}
                                            className="border p-2 rounded"
                                            rows={3}
                                            disabled={processing}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="flex flex-col">
                                        <label className="font-medium mb-1">Upload Image <span className="text-red-500">*</span></label>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            onChange={handleFileChange}
                                            className="p-2 border-2 border-dotted rounded"
                                            disabled={processing}
                                        />
                                        <p className="text-sm text-gray-500 mt-1">Maximum file size: 5MB</p>
                                    </div>

                                    {filePreview && (
                                        <div className="border rounded p-2">
                                            <p className="font-medium mb-2">Preview:</p>
                                            <img
                                                src={filePreview}
                                                alt="Preview"
                                                className="max-h-48 max-w-full object-contain rounded"
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="flex justify-center pt-4">
                                <button
                                    onClick={handleUploadData}
                                    disabled={!file || !name || !symbol || processing}
                                    className={`px-6 py-3 rounded text-white font-bold ${
                                        !file || !name || !symbol || processing
                                            ? "bg-gray-400 cursor-not-allowed"
                                            : "bg-blue-600 hover:bg-blue-700"
                                    }`}
                                >
                                    {processing ? "Uploading..." : "Upload & Continue"}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Step 2: Mint NFT */}
                    {currentStep === 2 && (
                        <div className="space-y-4">
                            <h3 className="text-lg font-semibold">Mint Your NFT</h3>
                            <div className="bg-gray-50 p-4 rounded">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <strong>Name:</strong> {name}
                                    </div>
                                    <div>
                                        <strong>Symbol:</strong> {symbol}
                                    </div>
                                    <div className="col-span-2">
                                        <strong>Description:</strong> {description || "No description provided"}
                                    </div>
                                </div>
                            </div>
                            
                            <div className="flex justify-center pt-4">
                                <button
                                    onClick={handleMintNFT}
                                    disabled={!address || processing}
                                    className={`px-6 py-3 rounded text-white font-bold ${
                                        !address || processing
                                            ? "bg-gray-400 cursor-not-allowed"
                                            : "bg-green-600 hover:bg-green-700"
                                    }`}
                                >
                                    {processing ? "Minting..." : "Mint NFT"}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Step 3: List NFT */}
                    {currentStep === 3 && (
                        <div className="space-y-4">
                            <h3 className="text-lg font-semibold">List Your NFT</h3>
                            
                            {mintedNFT && (
                                <div className="bg-green-50 p-4 rounded">
                                    <h4 className="font-semibold text-green-800">NFT Minted Successfully!</h4>
                                    <p className="text-sm text-green-600 mt-1">
                                        Mint Address: <span className="font-mono">{mintedNFT}</span>
                                    </p>
                                    <a
                                        href={`https://explorer.solana.com/address/${mintedNFT}?cluster=devnet`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-600 underline text-sm"
                                    >
                                        View on Solana Explorer
                                    </a>
                                </div>
                            )}

                            <div className="flex flex-col max-w-md">
                                <label className="font-medium mb-1">Price (SOL) <span className="text-red-500">*</span></label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0.01"
                                    placeholder="e.g., 0.5"
                                    value={price}
                                    onChange={(e) => setPrice(parseFloat(e.target.value))}
                                    className="border p-2 rounded"
                                    disabled={processing}
                                />
                                <p className="text-sm text-gray-500 mt-1">
                                    This will be the listing price on the marketplace
                                </p>
                            </div>

                            <div className="flex justify-center pt-4">
                                <button
                                    onClick={handleListNFT}
                                    disabled={!address || processing || price <= 0}
                                    className={`px-6 py-3 rounded text-white font-bold ${
                                        !address || processing || price <= 0
                                            ? "bg-gray-400 cursor-not-allowed"
                                            : "bg-purple-600 hover:bg-purple-700"
                                    }`}
                                >
                                    {processing ? "Listing..." : "List on Marketplace"}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Step 4: Complete */}
                    {currentStep === 4 && (
                        <div className="space-y-4 text-center">
                            <div className="text-6xl mb-4">🎉</div>
                            <h3 className="text-2xl font-bold text-green-600">Congratulations!</h3>
                            <p className="text-lg">Your NFT has been successfully created and listed on the marketplace!</p>
                            
                            {mintedNFT && (
                                <div className="bg-green-50 p-4 rounded max-w-md mx-auto">
                                    <h4 className="font-semibold mb-2">NFT Details:</h4>
                                    <div className="text-left space-y-1">
                                        <p><strong>Name:</strong> {name}</p>
                                        <p><strong>Symbol:</strong> {symbol}</p>
                                        <p><strong>Price:</strong> {price} SOL</p>
                                        <p><strong>Mint Address:</strong> 
                                            <span className="font-mono text-sm block">{mintedNFT}</span>
                                        </p>
                                    </div>
                                </div>
                            )}

                            <div className="flex justify-center gap-4 pt-4">
                                <button
                                    onClick={() => window.location.href = '/'}
                                    className="px-6 py-3 rounded text-white font-bold bg-blue-600 hover:bg-blue-700"
                                >
                                    View Marketplace
                                </button>
                                <button
                                    onClick={resetForm}
                                    className="px-6 py-3 rounded text-white font-bold bg-green-600 hover:bg-green-700"
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