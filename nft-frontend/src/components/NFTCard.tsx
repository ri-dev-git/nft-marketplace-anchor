import Image from "next/image";
import { DigitalAsset, fetchAllDigitalAssetByUpdateAuthority } from '@metaplex-foundation/mpl-token-metadata';

type NFTCardProps = {
    nft: DigitalAsset;
    onBurn?: () => void;
    onTransfer?: () => void;
};
export const NFTCard = ({ nft, onBurn, onTransfer }: NFTCardProps) => (
    <div className="border rounded-lg p-4 shadow relative group">
        <img src={nft.metadata.uri} alt={nft.metadata.name} className="w-full h-64 object-cover mb-2" />
        <h2 className="text-lg font-bold">{nft.metadata.name}</h2>
        <p className="text-sm text-gray-500">{nft.metadata.symbol}</p>
        <div className="flex justify-between mt-4">
            <button onClick={onTransfer} className="px-4 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700">Transfer</button>
            <button onClick={onBurn} className="px-4 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700">Burn</button>
        </div>
    </div>
);

