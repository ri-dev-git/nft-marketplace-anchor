"use client";

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
import { useAppKitAccount, useAppKitProvider } from '@reown/appkit/react'
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
    const { connection } = useAppKitConnection()
    const publicKey = walletProvider?.publicKey
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

            // 2. Pin metadata
            setStatus("Uploading metadata...");
            const metadata = {
                name,
                symbol,
                uri: imageUri,
                seller_fee_basis_points: 500,
                creators: [{ address: publicKey.toBase58(), verified: true, share: 100 }],
            };
            const metadataUri = await uploadJson(metadata).toString();

            // 3. Prepare Anchor program
            const provider = new anchor.AnchorProvider(connection as Connection, walletProvider as Wallet, { preflightCommitment: "processed" });
            const program = new anchor.Program(idl, provider);

            const ata = await getAssociatedTokenAddress(mintKeypair.publicKey, publicKey);

            setStatus("Sending mint transaction...");

            await program.methods
                .mintNft(name, symbol, metadataUri)
                .accounts({
                    signer: publicKey,
                    mint: mintKeypair.publicKey,
                    associatedTokenAccount: ata,
                    metadataAccount: metadataPda,
                    masterEditionAccount: masterEditionPda,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                    tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
                    systemProgram: SystemProgram.programId,
                    rent: SYSVAR_RENT_PUBKEY,
                })
                .signers([mintKeypair])
                .rpc({ commitment: 'confirmed', skipPreflight: false, maxRetries: 5 });

            setStatus(`Minted! Mint address: ${mintKeypair.publicKey.toBase58()}`);
        } catch (e) {

            console.error(e);
            setStatus("Mint failed");
        } finally {
            setUploading(false);
        }
    };


    return (
        <div className="max-w-lg mx-auto p-6">
            <h1 className="text-2xl font-bold mb-4">Create & Mint NFT</h1>
            <input
                type="text"
                placeholder="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="border p-2 w-full mb-2"
            />
            <input
                type="text"
                placeholder="Symbol"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className="border p-2 w-full mb-2"
            />
            <input
                type="file"
                accept="image/*"
                onChange={(e) => setFile(e.target?.files?.[0])}
                className="mb-4"
            />
            <button
                onClick={onMint}
                disabled={!publicKey || !file || uploading}
                className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
            >
                {uploading ? "Processing..." : "Mint NFT"}
            </button>
            {status && <p className="mt-4">{status}</p>}
        </div>
    );

}