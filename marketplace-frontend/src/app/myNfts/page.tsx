"use client";
import Layout from "@/src/components/Layout";
import { useEffect, useState } from "react";
import { useAppKitAccount, useAppKitProvider } from "@reown/appkit/react";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { fetchAllDigitalAssetByOwner, TokenStandard } from "@metaplex-foundation/mpl-token-metadata";
import { publicKey, Umi } from "@metaplex-foundation/umi";
import { NFTCard } from "@/src/components/NFTCard";
import { DigitalAsset } from '@metaplex-foundation/mpl-token-metadata';
import { useAppKitConnection, WalletAdapter, type Provider } from '@reown/appkit-adapter-solana/react';
import { burnV1, transferV1 } from '@metaplex-foundation/mpl-token-metadata';
import { findMetadataPda } from '@metaplex-foundation/mpl-token-metadata';
import { walletAdapterIdentity } from '@metaplex-foundation/umi-signer-wallet-adapters';
import { mplTokenMetadata } from '@metaplex-foundation/mpl-token-metadata';
import { mplToolbox } from '@metaplex-foundation/mpl-toolbox';
import { AnchorProvider, Program, web3, BN } from "@coral-xyz/anchor";
import idl from "../../idl/nft_marketplace.json";
import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";


const SkeletonCard = () => (
    <div className="animate-pulse border rounded-lg p-4 shadow">
        <div className="bg-gray-300 h-48 w-full rounded mb-4" />
        <div className="h-4 bg-gray-300 rounded w-3/4 mb-2" />
        <div className="h-4 bg-gray-200 rounded w-1/2" />
    </div>
);

export default function MarketplacePage() {
    const { walletProvider } = useAppKitProvider<Provider>('solana');
    const walletPublicKey = walletProvider?.publicKey;
    const [myNFTs, setMyNFTs] = useState<DigitalAsset[]>([]);
    const [loading, setLoading] = useState(true);
    const [transferring, setTransferring] = useState(false);
    const [burning, setBurning] = useState(false);
    const [listing, setListing] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [showListModal, setShowListModal] = useState(false);
    const [selectedNFT, setSelectedNFT] = useState<DigitalAsset | null>(null);
    const [recipientAddress, setRecipientAddress] = useState('');
    const [listingPrice, setListingPrice] = useState('');
    const [transactionStatus, setTransactionStatus] = useState<{
        type: 'success' | 'error';
        message: string;
    } | null>(null);

    const { connection } = useAppKitConnection();
    
    const [umiInstance, setUmiInstance] = useState(() =>
        createUmi('https://api.devnet.solana.com')
            .use(mplTokenMetadata())
            .use(mplToolbox())
    );

    const fetchNFTs = async (call: String) => {
        if (!walletPublicKey) return;
        try {
            const assets = await fetchAllDigitalAssetByOwner(umiInstance, publicKey(walletPublicKey.toString()));
            setMyNFTs(assets);
        } catch (error) {
            console.error("Failed to fetch NFTs:", error);
            setMyNFTs([]);
        } finally {
            setLoading(false);
        }
    };

   async function handleListNFT(nft: DigitalAsset, priceSol: number) {
    if (!walletProvider || !walletPublicKey) {
        setTransactionStatus({
            type: 'error',
            message: 'Wallet not connected.'
        });
        return;
    }

    setListing(true);

    try {
        const provider = new AnchorProvider(connection as any, walletProvider as any, {
            commitment: "processed",
        });

        const program = new Program(idl as any, provider);

        const mint = new PublicKey(nft.mint.publicKey.toString());
        const [pda, bump] = PublicKey.findProgramAddressSync([Buffer.from("authority")], program.programId);
        const [listingPDA] = PublicKey.findProgramAddressSync([Buffer.from("listing"), mint.toBuffer()], program.programId);

        const sellerTokenAccount = await getAssociatedTokenAddress(mint, walletPublicKey);
        const escrowTokenAccount = await getAssociatedTokenAddress(mint, pda, true);

        console.log("Listing NFT with price:", priceSol, "SOL");

        const tx = await program.methods
            .listNft(new BN(priceSol * web3.LAMPORTS_PER_SOL), bump)
            .accounts({
                seller: walletPublicKey,
                mint,
                pda,
                sellerTokenAccount,
                escrowTokenAccount,
                listing: listingPDA,
                tokenProgram: TOKEN_PROGRAM_ID,
                associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
                rent: SYSVAR_RENT_PUBKEY,
            })
            .instruction();

        console.log("✅ NFT listed on-chain:", tx);

        // Update backend after successful list
        await updateBackendAfterListing(nft, priceSol);

        setMyNFTs(prev => prev.filter(item =>
            item.mint.publicKey.toString() !== nft.mint.publicKey.toString()
        ));

        setTransactionStatus({
            type: 'success',
            message: `NFT "${nft.metadata.name}" listed successfully for ${priceSol} SOL!`
        });

    } catch (err: any) {
        console.error("Failed to list NFT:", err);
        setTransactionStatus({
            type: 'error',
            message: `Listing failed: ${err.message}`
        });
    } finally {
        setListing(false);
    }
}

    async function updateBackendAfterListing(nft: DigitalAsset, price: number) {
        try {
            // First, fetch the metadata to get image URI
            let metadataUri = nft.metadata.uri;
            if (metadataUri.includes("white-swift-boar-963.mypinata.cloud")) {
                metadataUri = metadataUri.replace(
                    "https://white-swift-boar-963.mypinata.cloud/ipfs/",
                    "https://ipfs.io/ipfs/"
                );
            }

            const metadataRes = await fetch(metadataUri);
            const metadata = await metadataRes.json();
            
            let imageUrl = metadata.image || metadata?.properties?.files?.[0]?.uri;
            if (imageUrl?.includes("white-swift-boar-963.mypinata.cloud")) {
                imageUrl = imageUrl.replace(
                    "https://white-swift-boar-963.mypinata.cloud/ipfs/",
                    "https://ipfs.io/ipfs/"
                );
            }

            // Update backend with listing information
            const response = await fetch("https://nft-marketplace-anchor.onrender.com/update_nft_listing_status", {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    mint_address: nft.mint.publicKey.toString(),
                    name: nft.metadata.name,
                    symbol: nft.metadata.symbol,
                    price: price,
                    image_uri: imageUrl || "",
                    metadata_uri: metadataUri,
                    is_listed: true,
                    owner: walletPublicKey?.toString(),
                    token_standard: nft.metadata.tokenStandard || "NonFungible",
                }),
            });

            if (!response.ok) {
                throw new Error(`Backend update failed: ${response.status}`);
            }

            const result = await response.json();
            console.log("✅ Backend updated successfully:", result);

        } catch (error) {
            console.error("❌ Failed to update backend:", error);
            throw error; // Re-throw to be caught by the main function
        }
    }

    useEffect(() => {
        if (walletProvider) {
            const updatedUmi = umiInstance.use(walletAdapterIdentity(walletProvider as unknown as WalletAdapter));
            setUmiInstance(updatedUmi);
        }

        fetchNFTs("");
        setLoading(false);

        if (transactionStatus) {
            const timer = setTimeout(() => {
                setTransactionStatus(null);
            }, 5000);
            return () => clearTimeout(timer);
        }
    }, [walletPublicKey?.toString(), walletProvider]);

    async function handleTransfer(umi: Umi, nft: DigitalAsset, recipient: string) {
        if (!recipient || !nft) {
            setTransactionStatus({
                type: 'error',
                message: 'Invalid recipient address or NFT.'
            });
            return;
        }

        if (!walletProvider || !walletPublicKey) {
            setTransactionStatus({
                type: 'error',
                message: 'Wallet not connected.'
            });
            return;
        }

        setTransferring(true);

        try {
            let recipientPublicKey;
            try {
                recipientPublicKey = publicKey(recipient);
            } catch (err: any) {
                throw new Error(`Invalid recipient address: ${err.message}`);
            }

            const assets = await fetchAllDigitalAssetByOwner(
                umiInstance,
                publicKey(walletPublicKey.toString())
            );
            const stillOwned = assets.some(
                asset => asset.mint.publicKey.toString() === nft.mint.publicKey.toString()
            );

            if (!stillOwned) {
                throw new Error("You no longer own this NFT");
            }

            console.log("Starting transfer with parameters:", {
                mint: nft.mint.publicKey.toString(),
                authority: umiInstance.identity.publicKey.toString(),
                tokenOwner: walletPublicKey.toString(),
                destinationOwner: recipientPublicKey.toString(),
                tokenStandard: nft.metadata.tokenStandard
            });

            const builder = transferV1(umiInstance, {
                mint: nft.mint.publicKey,
                authority: umiInstance.identity,
                tokenOwner: publicKey(walletPublicKey.toString()),
                destinationOwner: recipientPublicKey,
                tokenStandard: nft.metadata.tokenStandard as unknown as TokenStandard,
            });

            const { signature } = await builder.sendAndConfirm(umiInstance);

            console.log("Transfer successful:", signature);

            setMyNFTs(prev => prev.filter(item =>
                item.mint.publicKey.toString() !== nft.mint.publicKey.toString()
            ));

            try {
                await fetch("https://nft-marketplace-anchor.onrender.com/update_nft_listing_status", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        mint_address: nft.mint.publicKey.toString(),
                        is_listed: false,
                        new_owner: recipientPublicKey.toString(),
                    }),
                });
            } catch (err) {
                console.error("Failed to update backend owner after transfer:", err);
            }

            setTransactionStatus({
                type: 'success',
                message: 'NFT transferred successfully!'
            });
        } catch (error) {
            console.error("Transfer failed:", error);

            let errorMessage = 'Unknown error';
            if (error instanceof Error) {
                if (error.message.includes("User rejected")) {
                    errorMessage = "Transaction was rejected by the wallet";
                } else if (error.message.includes("insufficient funds")) {
                    errorMessage = "Insufficient SOL to pay for transaction fees";
                } else {
                    errorMessage = error.message;
                }
            }

            setTransactionStatus({
                type: 'error',
                message: `Transfer failed: ${errorMessage}`
            });
        } finally {
            setTransferring(false);
        }
    }

    async function handleBurn(umi: Umi, nft: DigitalAsset) {
        if (!nft) return;

        if (!walletProvider || !walletPublicKey) {
            setTransactionStatus({
                type: 'error',
                message: 'Wallet not connected.'
            });
            return;
        }

        setLoading(true);
        setBurning(true);

        try {
            const builder = burnV1(umiInstance, {
                mint: nft.mint.publicKey,
                authority: umiInstance.identity,
                tokenOwner: publicKey(walletPublicKey.toString()),
                tokenStandard: nft.metadata.tokenStandard as unknown as TokenStandard,
            });

            const { signature } = await builder.sendAndConfirm(umiInstance);

            console.log("Burn successful:", signature);
            console.log("Burning NFT:", nft.mint.publicKey.toString());

            try {
                await fetch(`https://nft-marketplace-anchor.onrender.com/delete_nft/${nft.mint.publicKey.toString()}`, {
                    method: "DELETE",
                });
            } catch (err) {
                console.error("Failed to notify backend about burn:", err);
            }

            setTimeout(() => { fetchNFTs("burn"); }, 2000);

            setLoading(false);

            setTransactionStatus({
                type: 'success',
                message: 'NFT burned successfully!'
            });

            setLoading(false);
        } catch (error) {
            console.error("Burn failed:", error);
            setTransactionStatus({
                type: 'error',
                message: `Burn failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            });
        } finally {
            setBurning(false);
        }
    }

    const handleListButtonClick = (nft: DigitalAsset) => {
        setSelectedNFT(nft);
        setShowListModal(true);
    };

    const handleListSubmit = async () => {
        if (!selectedNFT || !listingPrice) return;

        const price = parseFloat(listingPrice);
        if (isNaN(price) || price <= 0) {
            setTransactionStatus({
                type: 'error',
                message: 'Please enter a valid price greater than 0'
            });
            return;
        }

        await handleListNFT(selectedNFT, price);
        setShowListModal(false);
        setListingPrice('');
        setSelectedNFT(null);
    };



    return (
        <Layout>
            <div className="flex flex-col h-full w-full p-4">
                <h1 className="text-2xl font-bold mb-4">My NFTs</h1>

                {/* Status Banner */}
                {transactionStatus && (
                    <div className={`p-3 mb-4 rounded ${transactionStatus.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {transactionStatus.message}
                    </div>
                )}

                {loading ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {[...Array(6)].map((_, i) => (
                            <SkeletonCard key={i} />
                        ))}
                    </div>
                ) : myNFTs.length > 0 ? (
                    <div className="flex-grow overflow-y-auto p-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {myNFTs.map((nft, idx) => (
                                <NFTCard
                                    key={idx}
                                    nft={nft}
                                    onTransfer={() => {
                                        setSelectedNFT(nft);
                                        setShowModal(true);
                                    }}
                                    onBurn={() => handleBurn(umiInstance, nft)}
                                    onList={() => handleListButtonClick(nft)}
                                />
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="p-4 text-center rounded-lg">
                        <p className="text-gray-500">No NFTs found in your wallet.</p>
                    </div>
                )}
            </div>

            {/* Transfer Modal */}
            {showModal && selectedNFT && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded shadow-md max-w-md w-full mx-4">
                        <h2 className="text-lg font-semibold mb-2">Transfer NFT</h2>
                        <p className="text-sm mb-4">Mint: {selectedNFT.mint.publicKey.toString().substring(0, 8)}...</p>
                        <input
                            type="text"
                            placeholder="Recipient address"
                            value={recipientAddress}
                            onChange={(e) => setRecipientAddress(e.target.value)}
                            className="w-full p-2 border rounded mb-4"
                        />
                        <div className="flex justify-end space-x-2">
                            <button
                                onClick={() => {
                                    setShowModal(false);
                                    setRecipientAddress('');
                                }}
                                className="bg-gray-300 px-4 py-2 rounded"
                                disabled={transferring}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={async () => {
                                    await handleTransfer(umiInstance, selectedNFT, recipientAddress);
                                    setShowModal(false);
                                    setRecipientAddress('');
                                }}
                                className="bg-blue-600 text-white px-4 py-2 rounded"
                                disabled={transferring}
                            >
                                {transferring ? 'Processing...' : 'Transfer'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* List Modal */}
            {showListModal && selectedNFT && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div className="bg-gray-900 p-6 rounded shadow-md max-w-md w-full mx-4">
        <h2 className="text-lg font-semibold mb-2 text-white">List NFT for Sale</h2>
        <p className="text-sm mb-4 text-gray-300">
            NFT: {selectedNFT.metadata.name}
        </p>
        <p className="text-sm mb-4 text-gray-300">
            Mint: {selectedNFT.mint.publicKey.toString().substring(0, 8)}...
        </p>
        <input
            type="number"
            placeholder="Price in SOL (e.g., 0.5)"
            value={listingPrice}
            onChange={(e) => setListingPrice(e.target.value)}
            className="w-full p-2 border border-gray-600 rounded mb-4 bg-gray-800 text-white placeholder-gray-400"
            min="0"
            step="0.01"
        />
        <div className="flex justify-end space-x-2">
            <button
                onClick={() => {
                    setShowListModal(false);
                    setListingPrice('');
                    setSelectedNFT(null);
                }}
                className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded"
                disabled={listing}
            >
                Cancel
            </button>
            <button
                onClick={handleListSubmit}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded"
                disabled={listing || !listingPrice}
            >
                {listing ? 'Listing...' : 'List NFT'}
            </button>
        </div>
    </div>
                </div>
            )}
        </Layout>
    );
}