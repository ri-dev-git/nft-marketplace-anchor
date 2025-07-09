import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { NftMarketplace } from "../target/types/nft_marketplace";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
const TOKEN_METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
import { assert } from "chai";

describe("nft_marketplace", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace
    .NftMarketplace as Program<NftMarketplace>;

  it("Mints and burns an NFT", async () => {
    // Generate a new mint keypair
    const mint = Keypair.generate();
    const payer = provider.wallet.publicKey;

    // Airdrop SOL to the payer if needed (for localnet)
    const sig = await provider.connection.requestAirdrop(payer, 1e9);
    await provider.connection.confirmTransaction(sig);

    // Derive Metaplex PDAs
    const [metadataPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("metadata"),
        TOKEN_METADATA_PROGRAM_ID.toBuffer(),
        mint.publicKey.toBuffer(),
      ],
      TOKEN_METADATA_PROGRAM_ID
    );
    const [masterEditionPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("metadata"),
        TOKEN_METADATA_PROGRAM_ID.toBuffer(),
        mint.publicKey.toBuffer(),
        Buffer.from("edition"),
      ],
      TOKEN_METADATA_PROGRAM_ID
    );

    // Compute the associated token account for the payer
    const ata = await getAssociatedTokenAddress(
      mint.publicKey,
      payer,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    // Invoke mint_nft
    await program.methods
      .mintNft("MyNFT", "MNFT", "https://example.com/metadata.json")
      .accounts({
        signer: payer,
        mint: mint.publicKey,
        associated_token_account: ata,
        metadataAccount: metadataPda,
        masterEditionAccount: masterEditionPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      } as any)
      .signers([mint])
      .rpc();

    // Check the token balance is 1
    const balance = await provider.connection.getTokenAccountBalance(ata);
    assert.equal(balance.value.uiAmount, 1);

    // Invoke burn_nft
    await program.methods
      .burnNft(mint.publicKey)
      .accounts({
        owner: payer,
        mint: mint.publicKey,
        metadata: metadataPda,
        token: ata,
        edition: masterEditionPda,
        collectionMetadata: null,
        splToken: TOKEN_PROGRAM_ID,
        metadataProgramId: TOKEN_METADATA_PROGRAM_ID,
      })
      .rpc();

    // Check if ATA is closed after burn
    const postAccount = await provider.connection.getAccountInfo(ata);
    assert.isNull(postAccount, "ATA should be closed after burn");
  });

  it("Buys an NFT (transfers SOL + NFT)", async () => {
  const mint = Keypair.generate();
  const seller = provider.wallet;
  const buyer = Keypair.generate();

  // Airdrop buyer some SOL
  const sig = await provider.connection.requestAirdrop(buyer.publicKey, 2e9);
  await provider.connection.confirmTransaction(sig);

  // Derive metadata and edition PDAs
  const [metadataPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata"),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mint.publicKey.toBuffer(),
    ],
    TOKEN_METADATA_PROGRAM_ID
  );

  const [masterEditionPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata"),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mint.publicKey.toBuffer(),
      Buffer.from("edition"),
    ],
    TOKEN_METADATA_PROGRAM_ID
  );

  // Seller ATA
  const sellerAta = await getAssociatedTokenAddress(
    mint.publicKey,
    seller.publicKey
  );

  // Buyer ATA
  const buyerAta = await getAssociatedTokenAddress(
    mint.publicKey,
    buyer.publicKey
  );

  // Mint NFT to seller
  await program.methods
    .mintNft("BuyNFT", "BNFT", "https://example.com/buy.json")
    .accounts({
      signer: seller.publicKey,
      mint: mint.publicKey,
      associated_token_account: sellerAta,
      metadataAccount: metadataPda,
      masterEditionAccount: masterEditionPda,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    } as any)
    .signers([mint])
    .rpc();

  // Buyer balance before
  const buyerBefore = await provider.connection.getBalance(buyer.publicKey);
  const sellerBefore = await provider.connection.getBalance(seller.publicKey);

  // Execute buy_nft
  const price = 1_000_000_000; // 1 SOL

  await program.methods
    .buyNft(new anchor.BN(price))
    .accounts({
      buyer: buyer.publicKey,
      seller: seller.publicKey,
      mint: mint.publicKey,
      sellerTokenAccount: sellerAta,
      buyerTokenAccount: buyerAta,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    }as any)
    .signers([buyer])
    .rpc();

  // Check balances
  const buyerAfter = await provider.connection.getBalance(buyer.publicKey);
  const sellerAfter = await provider.connection.getBalance(seller.publicKey);

  const sellerBalanceDiff = sellerAfter - sellerBefore;
  const buyerBalanceDiff = buyerBefore - buyerAfter;

  assert(
    sellerBalanceDiff >= price,
    "Seller should receive payment (may be higher due to rent exemption reclaim)"
  );
  assert(
    buyerBalanceDiff >= price,
    "Buyer should pay the price (may be higher due to tx fee)"
  );

  // Check NFT ownership transfer
  const buyerAtaInfo = await provider.connection.getTokenAccountBalance(buyerAta);
  assert.equal(buyerAtaInfo.value.uiAmount, 1, "Buyer should now own the NFT");

  const sellerAtaInfo = await provider.connection.getTokenAccountBalance(sellerAta);
  assert.equal(sellerAtaInfo.value.uiAmount, 0, "Seller should no longer have the NFT");
});
});