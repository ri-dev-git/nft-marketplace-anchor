"use client";
import Navbar from "../../components/Navbar";
import NFTCard from "../../components/NFTCard";
// import useFetchListings from "../../hooks/useFetchListings";

export default function MarketplacePage() {
    // const listings = useFetchListings();

    return (
        <>
            <Navbar />
            <div className="container mx-auto py-8 grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* {listings.map((nft) => (
                    <NFTCard key={nft.mint} nft={nft} />
                ))} */}
            </div>
        </>
    );
}
