"use client";
import { SetStateAction, useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";

const LISTINGS_PROGRAM_ID = new PublicKey("CfPFcbSj3P3SXcCBuqQMxytKhxFWntsUJmDKAJgTdeYf");

const useListedNFTs = () => {
    const [nfts, setNfts] = useState<any[]>([]);

    useEffect(() => {
        const fetchNFTs = async () => {
            try {
                // Fetch data from Solana blockchain (You might need to customize this)
                // Use anchor or a GraphQL service like Helius
                const listedNFTs: SetStateAction<any[]> = []; // Replace with actual fetch call
                setNfts(listedNFTs);
            } catch (error) {
                console.error("Failed to fetch NFTs:", error);
            }
        };

        fetchNFTs();
    }, []);

    return nfts;
};

export default useListedNFTs;
