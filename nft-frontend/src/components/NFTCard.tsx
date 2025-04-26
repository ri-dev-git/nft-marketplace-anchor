"use client";
import Image from "next/image";

export default function NFTCard({ nft }: { nft: any }) {
    return (
        <div className="bg-white rounded shadow p-4 hover:shadow-lg transition">
            <Image src={nft.image} alt={nft.name} width={300} height={300} className="rounded" />
            <h2 className="mt-2 font-semibold">{nft.name}</h2>
            <p className="text-gray-600">{nft.price} SOL</p>
            <button className="mt-2 w-full py-1 bg-blue-600 text-white rounded hover:bg-blue-700">
                Buy Now
            </button>
        </div>
    );
}
