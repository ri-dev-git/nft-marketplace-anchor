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
import { PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID } from "@metaplex-foundation/mpl-token-metadata";
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
        associatedTokenAccount: ata,
        metadataAccount: metadataPda,
        masterEditionAccount: masterEditionPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
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

    // After burning, token account should either be closed or balance zero
    const postBalance = await provider.connection.getTokenAccountBalance(ata);
    assert.equal(postBalance.value.uiAmount, 0);
  });
});
