import { useState, useEffect } from "react";
import { DigitalAsset } from '@metaplex-foundation/mpl-token-metadata';

type NFTCardProps = {
    nft: DigitalAsset;
    onBurn?: () => void;
    onTransfer?: () => void;
    onList?: () => void; // 👈 new prop
};

export const NFTCard = ({ nft, onBurn, onTransfer, onList }: NFTCardProps) => {
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadImage = async () => {
            try {
                // Convert metadata URI from Pinata to IPFS gateway
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

                setImageSrc(imageUrl || "/fallback-image.png");
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
        <img
            src={imageSrc || "/fallback-image.png"}
            alt={nft.metadata.name}
            className="w-full h-64 object-cover mb-2"
        />
    )}
    <h2 className="text-lg font-bold">{nft.metadata.name}</h2>
    <p className="text-sm text-gray-500">{nft.metadata.symbol}</p>
    <div className="flex flex-wrap gap-2 mt-1">
        <button onClick={onTransfer} className="w-full px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700">
            Transfer
        </button>
        <button onClick={onBurn} className="w-full px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700">
            Burn
        </button>
        {onList && (
            <button onClick={onList} className="w-full px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700">
                List
            </button>
        )}
    </div>
</div>
    );
};
