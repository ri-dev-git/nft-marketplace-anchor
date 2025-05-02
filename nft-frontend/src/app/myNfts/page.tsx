"use client";
import Layout from "@/src/components/Layout";
import { useEffect, useState } from "react";
import { useAppKitAccount, useAppKitProvider } from "@reown/appkit/react";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { fetchAllDigitalAssetByOwner, TokenStandard } from "@metaplex-foundation/mpl-token-metadata";
import { publicKey, Umi } from "@metaplex-foundation/umi";
import { NFTCard } from "@/src/components/NFTCard";
import { DigitalAsset } from '@metaplex-foundation/mpl-token-metadata';
import { Connection, useAppKitConnection, type Provider } from '@reown/appkit-adapter-solana/react';
import { burnV1, transferV1 } from '@metaplex-foundation/mpl-token-metadata';
import { findMetadataPda } from '@metaplex-foundation/mpl-token-metadata';
import { walletAdapterIdentity } from '@metaplex-foundation/umi-signer-wallet-adapters';
import { mplTokenMetadata } from '@metaplex-foundation/mpl-token-metadata';
import { mplToolbox } from '@metaplex-foundation/mpl-toolbox';

import { WalletConnectWalletAdapter } from "@walletconnect/solana-adapter";
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
    const [showModal, setShowModal] = useState(false);
    const [selectedNFT, setSelectedNFT] = useState<DigitalAsset | null>(null);
    const [recipientAddress, setRecipientAddress] = useState('');
    const [transactionStatus, setTransactionStatus] = useState<{
        type: 'success' | 'error';
        message: string;
    } | null>(null);

    // Create a reference to hold the Umi instance with signer
    const [umiInstance, setUmiInstance] = useState(() =>
        createUmi('https://api.devnet.solana.com')
            .use(mplTokenMetadata())
            .use(mplToolbox())
    );

    // Update Umi with wallet when provider changes
    useEffect(() => {
        if (walletProvider) {
            const updatedUmi = umiInstance.use(walletAdapterIdentity(walletProvider as any));
            setUmiInstance(updatedUmi);
        }
    }, [walletProvider]);

    useEffect(() => {
        const fetchNFTs = async () => {
            if (!walletPublicKey) return;
            setLoading(true);
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

        fetchNFTs();
    }, [walletPublicKey?.toString(), umiInstance]);

    // Clear transaction status after 5 seconds
    useEffect(() => {
        if (transactionStatus) {
            const timer = setTimeout(() => {
                setTransactionStatus(null);
            }, 5000);

            return () => clearTimeout(timer);
        }
    }, [transactionStatus]);
    async function handleTransfer(umi: Umi, nft: DigitalAsset, recipient: string) {
        if (!recipient || !nft) {
            setTransactionStatus({
                type: 'error',
                message: 'Invalid recipient address or NFT.'
            });
            return;
        }

        // Make sure wallet is connected
        if (!walletProvider || !walletPublicKey) {
            setTransactionStatus({
                type: 'error',
                message: 'Wallet not connected.'
            });
            return;
        }

        setTransferring(true);

        try {
            // Validate recipient address with explicit error handling
            let recipientPublicKey;
            try {
                recipientPublicKey = publicKey(recipient);
            } catch (err: any) {
                throw new Error(`Invalid recipient address: ${err.message}`);
            }

            // Verify NFT ownership before transfer
            try {
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
            } catch (err: any) {
                if (err.message === "You no longer own this NFT") {
                    throw err;
                }
                console.warn("Could not verify ownership:", err);
                // Continue anyway as this might just be a network issue
            }

            console.log("Starting transfer with parameters:", {
                mint: nft.mint.publicKey.toString(),
                authority: umiInstance.identity.publicKey.toString(),
                tokenOwner: walletPublicKey.toString(),
                destinationOwner: recipientPublicKey.toString(),
                tokenStandard: nft.metadata.tokenStandard
            });

            // Execute the transfer transaction
            const builder = transferV1(umiInstance, {
                mint: nft.mint.publicKey,
                authority: umiInstance.identity,
                tokenOwner: publicKey(walletPublicKey.toString()),
                destinationOwner: recipientPublicKey,
                tokenStandard: nft.metadata.tokenStandard as unknown as TokenStandard,
            });

            const { signature } = await builder.sendAndConfirm(umiInstance);

            console.log("Transfer successful:", signature);

            // Update local state - remove the transferred NFT
            setMyNFTs(prev => prev.filter(item =>
                item.mint.publicKey.toString() !== nft.mint.publicKey.toString()
            ));

            setTransactionStatus({
                type: 'success',
                message: 'NFT transferred successfully!'
            });
        } catch (error) {
            console.error("Transfer failed:", error);

            // Provide more specific error messages based on error types
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

        // Make sure wallet is connected
        if (!walletProvider || !walletPublicKey) {
            setTransactionStatus({
                type: 'error',
                message: 'Wallet not connected.'
            });
            return;
        }

        setBurning(true);

        try {
            // Execute the burn transaction
            const builder = burnV1(umiInstance, {
                mint: nft.mint.publicKey,
                authority: umiInstance.identity,
                tokenOwner: publicKey(walletPublicKey.toString()),
                // Safely unwrap the Option<TokenStandard>
                tokenStandard: nft.metadata.tokenStandard as unknown as TokenStandard,
            });

            const { signature } = await builder.sendAndConfirm(umiInstance);
            console.log("Burn successful:", signature);

            // Update local state - remove the burned NFT
            setMyNFTs(prev => prev.filter(item => item.mint.publicKey.toString() !== nft.mint.publicKey.toString()));

            setTransactionStatus({
                type: 'success',
                message: 'NFT burned successfully!'
            });
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
                                />
                            ))}
                        </div>
                    </div>
                ) : (
                    <p>No NFTs found in your wallet.</p>
                )}
            </div>

            {showModal && selectedNFT && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-base-100 p-6 rounded shadow-md">
                        <h2 className="text-lg font-semibold mb-2">Transfer NFT</h2>
                        <p className="text-sm mb-4">Mint: {selectedNFT.mint.publicKey.toString().substring(0, 8)}...</p>
                        <input
                            type="text"
                            placeholder="Recipient address"
                            value={recipientAddress}
                            onChange={(e) => setRecipientAddress(e.target.value)}
                            className="w-full p-2 border mb-4"
                        />
                        <div className="flex justify-end space-x-2">
                            <button
                                onClick={() => setShowModal(false)}
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
        </Layout>
    );
}