"use client";
import useListedNFTs from "../hooks/useListedNFTs";

const NFTList = () => {
    const nfts = useListedNFTs();

    return (
        <div>
            {nfts.length > 0 ? (
                nfts.map((nft, index) => (
                    <div key={index}>
                        <img src={nft.image} alt={nft.name} width={150} height={150} />
                        <h3>{nft.name}</h3>
                        <p>Price: {nft.price} SOL</p>
                        <button>Buy</button>
                    </div>
                ))
            ) : (
                <p>No NFTs listed yet.</p>
            )}
        </div>
    );
};

export default NFTList;
