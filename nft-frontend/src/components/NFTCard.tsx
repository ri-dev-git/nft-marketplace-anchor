// NFTCard.tsx
import { useState, useEffect } from "react";
import { DigitalAsset } from '@metaplex-foundation/mpl-token-metadata';

type NFTCardProps = {
    nft: DigitalAsset;
    onBurn?: () => void;
    onTransfer?: () => void;
};

export const NFTCard = ({ nft, onBurn, onTransfer }: NFTCardProps) => {
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadImage = async () => {
            try {
                const imageUrl = await fetch(nft.metadata.uri)
                    .then(res => res.json())
                    .then(data => data.image || data.properties?.files?.[0]?.uri);
                setImageSrc(imageUrl);
            } catch (err) {
                console.error("Failed to load image", err);
                setImageSrc("/fallback-image.png");
            } finally {
                setLoading(false);
            }
        };

        loadImage();
    }, [nft.metadata.uri]);

    return (
        <div className="border rounded-lg p-4 shadow relative group">
            {loading ? (
                <div className="w-full h-64 bg-gray-300 animate-pulse mb-2"></div>
            ) : (
                <img src={imageSrc || "/fallback-image.png"} alt={nft.metadata.name} className="w-full h-64 object-cover mb-2" />
            )}
            <h2 className="text-lg font-bold">{nft.metadata.name}</h2>
            <p className="text-sm text-gray-500">{nft.metadata.symbol}</p>
            <div className="flex justify-between mt-4">
                <button onClick={onTransfer} className="px-4 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700">Transfer</button>
                <button onClick={onBurn} className="px-4 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700">Burn</button>
            </div>
        </div>
    );
};