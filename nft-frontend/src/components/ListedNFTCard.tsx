// components/ListedNFTCard.tsx
import { useState, useEffect } from "react";

type ListedNFT = {
  name: string;
  symbol: string;
  image_uri: string; // points to metadata JSON
  price?: number; // price in ETH or your token
  currency?: string; // e.g., "ETH", "USDC", etc.
};

type ListedNFTCardProps = {
  nft: ListedNFT;
  onBuy?: () => void;
};

export const ListedNFTCard = ({ nft, onBuy }: ListedNFTCardProps) => {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadImage = async () => {
      try {
      
        let imageUrl = nft.image_uri;
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
    console.log(nft.price)
    loadImage();
  }, [nft.image_uri]);

  // Format price display
  const formatPrice = (price: number, currency: string = "SOL") => {
    if (price < 0.001) {
      return `${(price * 1000).toFixed(3)} m${currency}`;
    }
    return `${price.toFixed(3)} ${currency}`;
  };

  return (
   <div className="border rounded-2xl p-4 shadow-lg bg-[#1e293b] hover:shadow-xl transition-shadow duration-300">
  {loading ? (
    <div className="w-full h-64 bg-gray-700 animate-pulse rounded-xl mb-4"></div>
  ) : (
    <img
      src={imageSrc || "/fallback-image.png"}
      alt={nft.name}
      className="w-full h-64 object-cover rounded-xl mb-4"
    />
  )}

  <div className="flex flex-col gap-1">
    <h2 className="text-xl font-semibold text-white truncate">{nft.name}</h2>
    <p className="text-sm text-gray-400">{nft.symbol}</p>
    
    {/* Price display */}
    {nft.price !== undefined && (
      <div className="mt-2 mb-1">
        <span className="text-lg font-bold text-green-400">
          {formatPrice(nft.price, nft.currency)}
        </span>
      </div>
    )}
  </div>

  <div className="flex justify-end mt-6">
    {onBuy && (
      <button
        onClick={onBuy}
        className="px-5 py-2 text-sm font-medium bg-green-500 text-white rounded-lg transition-all duration-300 hover:bg-green-600 hover:shadow-md hover:-translate-y-0.5"
      >
        Buy
      </button>
    )}
  </div>
</div>

  );
};