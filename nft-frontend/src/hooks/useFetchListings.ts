// // src/hooks/useFetchListings.ts
// "use client";
// import { useEffect, useState } from "react";
// import { PublicKey } from "@solana/web3.js";
// import { AnchorProvider, Program, Idl } from "@coral-xyz/anchor";
// import idl from "@/idl/nft_marketplace.json"; // adjust path to your IDL json
// import { useWallet, useConnection } from "@reown/appkit-adapter-solana";

// const PROGRAM_ID = new PublicKey("7oEFwgSPqj1XWYQJ9yEC8PAgP45Ye8pK8uW5e8NqiAdt");

// export type Listing = {
//     seller: string;
//     mint: string;
//     price: number;
//     isActive: boolean;
//     metadata: string;
// };

// export default function useFetchListings() {
//     const { connection } = useConnection();
//     const { publicKey, signTransaction } = useWallet();
//     const [listings, setListings] = useState<Listing[]>([]);

//     useEffect(() => {
//         if (!publicKey) return;

//         const fetch = async () => {
//             // 1. Build Anchor provider
//             const provider = new AnchorProvider(connection, { publicKey, signTransaction } as any, {
//                 preflightCommitment: "processed",
//             });
//             // 2. Instantiate program
//             const program = new Program(idl as Idl, provider);
//             // 3. Fetch all listing accounts
//             const accounts = await program.account.listing.all();
//             // 4. Map to our Listing type
//             const items = accounts.map(({ account }) => ({
//                 seller: account.seller.toBase58(),
//                 mint: account.mint.toBase58(),
//                 price: account.price.toNumber(),
//                 isActive: account.isActive,
//                 metadata: account.metadata.toBase58(),
//             }));
//             setListings(items);
//         };

//         fetch().catch(console.error);
//     }, [publicKey, connection]);

//     return listings;
// }
