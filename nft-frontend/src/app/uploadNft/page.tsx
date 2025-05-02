"use client";
import Layout from '../../components/Layout'
import { useState } from "react";
import * as anchor from "@coral-xyz/anchor";
import {
    Keypair,
    PublicKey,
    SendTransactionError,
    SystemProgram,
    SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
    TOKEN_PROGRAM_ID,
    getAssociatedTokenAddress,
    ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import idl from "../../idl/nft_marketplace.json";
import { useAppKitAccount, useAppKitProvider, useWalletInfo } from '@reown/appkit/react'
import { Connection, useAppKitConnection, type Provider } from '@reown/appkit-adapter-solana/react'

import { pinata } from "../../../utils/config";
import { useCallback } from "react";
import { json } from "stream/consumers";
import { JsonBody } from "pinata";
import { Wallet } from "@coral-xyz/anchor/dist/cjs/provider";

const PROGRAM_ID = new PublicKey("7oEFwgSPqj1XWYQJ9yEC8PAgP45Ye8pK8uW5e8NqiAdt");

const TOKEN_METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");




export default function SellPage() {
    const { walletProvider } = useAppKitProvider<Provider>('solana')
    const connection: Connection = useAppKitConnection().connection as Connection
    const { isConnected } = useAppKitAccount()
    const publicKey = walletProvider?.publicKey
    console.log("publicKey", publicKey?.toBase58())
    const signTransaction = walletProvider?.signTransaction
    const [file, setFile] = useState<File>();
    const [uploading, setUploading] = useState(false);
    const [name, setName] = useState("");
    const [symbol, setSymbol] = useState("");
    const [status, setStatus] = useState("");



    const uploadFile = async (file: File) => {
        if (!file) {
            alert("No file selected");
            return;
        }

        try {
            setUploading(true);
            const urlRequest = await fetch("/api/url"); // Fetches the temporary upload URL
            const urlResponse = await urlRequest.json(); // Parse response
            const upload = await pinata.upload.public
                .file(file)
                .url(urlResponse.url); // Upload the file with the signed URL
            console.log("image", upload);
            setUploading(false);
        } catch (e) {
            console.log(e);
            setUploading(false);
            alert("Trouble uploading file");
        }
    };


    const uploadJson = async (jsonData: JsonBody) => {
        if (!jsonData) {
            alert("No JSON data provided");
            return;
        }

        try {
            setUploading(true);

            // Create a file from the JSON data
            const jsonString = JSON.stringify(jsonData);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const jsonFile = new File([blob], 'data.json', { type: 'application/json' });

            // Get the temporary upload URL
            const urlRequest = await fetch("/api/url");
            const urlResponse = await urlRequest.json();

            // Upload the JSON file with the signed URL
            const upload = await pinata.upload.public
                .file(jsonFile)
                .url(urlResponse.url);

            console.log("metadata", upload);
            setUploading(false);
            return upload;
        } catch (e) {
            console.log(e);
            setUploading(false);
            alert("Trouble uploading JSON data");
        }
    };


    const onMint = async () => {
        if (!publicKey || !file) {
            setStatus("Connect wallet and select file first.");
            return;
        }

        setUploading(true);
        const mintKeypair = anchor.web3.Keypair.generate();

        try {
            // Check wallet connection first
            if (!walletProvider || !isConnected) {
                throw new Error("Wallet not properly connected");
            }

            // Derive Metaplex PDAs
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

            // 1. Pin image
            setStatus("Uploading image...");
            const imageUri = await uploadFile(file);
            console.log("imageUri", imageUri);
            // 2. Pin metadata
            setStatus("Uploading metadata...");
            const metadata = {
                name,
                symbol,
                uri: { imageUri },
                seller_fee_basis_points: 500,
                creators: [{ address: publicKey.toBase58(), verified: true, share: 100 }],
            };
            console.log("metadata", metadata);
            // Upload metadata to Pinata
            const metadataUri = await uploadJson(metadata).toString();

            // 3. Prepare Anchor program
            const provider = new anchor.AnchorProvider(
                connection as Connection,
                walletProvider as Wallet,
                {

                    preflightCommitment: "confirmed",
                    commitment: "confirmed",
                    skipPreflight: false,
                    maxRetries: 100,

                }
            );
            anchor.setProvider(provider);

            // Initialize program with the proper IDL and Program ID
            const program = new anchor.Program(idl, provider);
            // Get ATA for the user
            const ata = await getAssociatedTokenAddress(
                mintKeypair.publicKey,
                publicKey
            );

            setStatus("Sending mint transaction...");

            // Create a simple dummy instruction to make the transaction unique
            // Use the Anchor method to mint the NFT
            // Let the program handle the account creation

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
                } as any)
                .signers([mintKeypair])
                .rpc({ commitment: 'confirmed', skipPreflight: false, maxRetries: 100 });

            // Function to check transaction status
            const checkTransactionStatus = async (signature: any, maxAttempts = 10) => {
                let attempts = 0;

                while (attempts < maxAttempts) {
                    try {
                        setStatus(`Checking transaction status (attempt ${attempts + 1}/${maxAttempts})...`);

                        // Get transaction status
                        const status = await connection.getSignatureStatus(signature);

                        // If confirmed
                        if (status && status.value && status.value.confirmationStatus === 'confirmed') {
                            setStatus(`Transaction confirmed! Mint address: ${mintKeypair.publicKey.toBase58()}`);
                            return true;
                        }

                        // If finalized (even better)
                        if (status && status.value && status.value.confirmationStatus === 'finalized') {
                            setStatus(`Transaction finalized! Mint address: ${mintKeypair.publicKey.toBase58()}`);
                            return true;
                        }

                        // Wait before checking again
                        await new Promise(resolve => setTimeout(resolve, 5000)); // 5 second interval
                        attempts++;
                    } catch (error) {
                        console.error("Error checking transaction status:", error);
                        attempts++;
                        await new Promise(resolve => setTimeout(resolve, 5000));
                    }
                }

                // After max attempts, suggest manual check
                setStatus(`Transaction sent but confirmation timed out. Check manually: https://explorer.solana.com/tx/${signature}?cluster=devnet`);
                return false;
            }


            setStatus(`Transaction sent with signature: ${signature}. Waiting for confirmation...`);
            checkTransactionStatus(signature);


            // await connection.confirmTransaction(tx, 'confirmed');
            // setStatus(`Minted! Mint address: ${mintKeypair.publicKey.toBase58()}`);
            // console.log("Transaction signature:", tx);
            // console.log(`https://explorer.solana.com/tx/${tx}?cluster=devnet`);
        } catch (e: any) {
            if (e instanceof SendTransactionError) {
                console.error("Transaction error:", e);
                try {
                    const logs = (await e.getLogs(connection)) || [];
                    console.error("Transaction logs:", logs);
                    setStatus(`Transaction error: ${e.message}`);
                } catch (logError) {
                    setStatus(`Transaction error: ${e.message}`);
                }
            } else if (e instanceof anchor.AnchorError) {
                console.error("Anchor error:", e);
                setStatus(`Anchor error: ${e.message}`);
            } else if (e instanceof Error) {
                console.error("General error:", e);
                setStatus(`Error: ${e.message}`);
            } else {
                console.error("Unknown error:", e);
                setStatus("Unknown error occurred");
            }
            console.error("Error details:", e);
        } finally {
            setUploading(false);
        }
    };
    return (
        <Layout>
            <div className="flex flex-col w-full min-h-full  overflow-y-auto">
                {/* Header - Fixed position at top */}
                <div className="sticky  top-0 bg-base-100 z-10 m-6 pt-1.5 pb-2 border-b">
                    <h2 className="text-2xl font-bold">Create & Mint NFT</h2>
                </div>

                {/* Scrollable content area */}
                <div className="flex-1 p-6 pt-2">
                    <p className="text-white-100 mb-6">
                        Fill out the details below to mint a new NFT. You must provide a name, symbol, and an image file.
                        <br /><br />
                        Upon submission:
                        <br />
                        - The metadata and image will be uploaded.
                        <br />
                        - A minting transaction will be sent to the Solana blockchain.
                        <br />
                        - You'll receive confirmation once the NFT is minted.
                    </p>

                    <div className="flex border-t-2 p-2 w-full flex-col place-content-evenly gap-4">
                        {status && (
                            <div className={`p-3 rounded ${status.includes('Error') ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                                {status}
                            </div>
                        )}

                        <div className="flex flex-col">
                            <span className="font-medium mb-1">Name:</span>
                            <input
                                type="text"
                                placeholder="Enter NFT name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="border p-2 w-full rounded"
                            />
                        </div>

                        <div className="flex flex-col">
                            <span className="font-medium mb-1">Symbol:</span>
                            <input
                                type="text"
                                placeholder="Enter NFT symbol"
                                value={symbol}
                                onChange={(e) => setSymbol(e.target.value)}
                                className="border p-2 w-full rounded"
                            />
                        </div>

                        <div className="flex flex-col">
                            <span className="font-medium mb-1">Upload Image:</span>
                            <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => setFile(e.target?.files?.[0])}
                                className="p-2 border-2 border-dotted rounded"
                            />
                        </div>

                        <div className="flex justify-center mt-4">
                            <button
                                onClick={onMint}
                                disabled={!publicKey || !file || uploading || !name || !symbol}
                                className={`px-6 py-3 rounded text-white font-bold ${uploading ? "bg-blue-400 cursor-not-allowed opacity-50" : "bg-blue-600 hover:bg-blue-700"
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
                        </div>
                    </div>
                </div>
            </div>
        </Layout>

    );

}