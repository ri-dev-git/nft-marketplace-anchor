import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { NftMarketplace } from "../target/types/nft_marketplace";
import * as token from "@solana/spl-token";
import { assert } from "chai";
import { SystemProgram } from "@solana/web3.js";
describe("nft_marketplace", () => {
  // Configure the client to use the local cluster
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.NftMarketplace as Program<NftMarketplace>;

  // Test accounts
  let seller: anchor.web3.Keypair;
  let buyer: anchor.web3.Keypair;
  let mint: anchor.web3.PublicKey;
  let sellerNftAccount: anchor.web3.PublicKey;
  let buyerNftAccount: anchor.web3.PublicKey;
  const systemProgram = SystemProgram.programId;
  before(async () => {
    // Setup test accounts
    seller = anchor.web3.Keypair.generate();
    buyer = anchor.web3.Keypair.generate();

    // Airdrop SOL to seller and buyer with retry mechanism
    const airdropAndConfirm = async (publicKey: anchor.web3.PublicKey) => {
      const airdropSignature = await provider.connection.requestAirdrop(
        publicKey,
        10 * anchor.web3.LAMPORTS_PER_SOL
      );

      const latestBlockhash = await provider.connection.getLatestBlockhash();

      await provider.connection.confirmTransaction({
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        signature: airdropSignature,
      });
    };

    // Airdrop to both accounts
    await Promise.all([
      airdropAndConfirm(seller.publicKey),
      airdropAndConfirm(buyer.publicKey)
    ]);

    // Create mint
    mint = await token.createMint(
      provider.connection,
      seller,
      seller.publicKey,
      null,
      0
    );

    // Create token accounts
    sellerNftAccount = await token.createAccount(
      provider.connection,
      seller,
      mint,
      seller.publicKey
    );

    buyerNftAccount = await token.createAccount(
      provider.connection,
      buyer,
      mint,
      buyer.publicKey
    );

    // Mint NFT to seller
    await token.mintTo(
      provider.connection,
      seller,
      mint,
      sellerNftAccount,
      seller.publicKey,
      1
    );
  });

  it("Should list an NFT", async () => {
    const listingKeypair = anchor.web3.Keypair.generate();
    const price = new anchor.BN(1000000000); // 1 SOL

    await program.methods
      .listNft(price)
      .accounts({
        listing: listingKeypair.publicKey,
        seller: seller.publicKey,
        mint: mint,
        sellerNftAccount: sellerNftAccount,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: token.TOKEN_PROGRAM_ID,
      } as any)
      .signers([seller, listingKeypair])
      .rpc();

    // Fetch and verify listing
    const listing = await program.account.listing.fetch(listingKeypair.publicKey);

    assert.isTrue(listing.isActive);
    assert.equal(listing.seller.toBase58(), seller.publicKey.toBase58());
    assert.equal(listing.mint.toBase58(), mint.toBase58());
    assert.isTrue(listing.price.eq(price));
  });

  it("Should buy an NFT", async () => {
    const listingKeypair = anchor.web3.Keypair.generate();
    const price = new anchor.BN(1000000000); // 1 SOL

    // First list the NFT
    await program.methods
      .listNft(price)
      .accounts({
        listing: listingKeypair.publicKey,
        seller: seller.publicKey,
        mint: mint,
        sellerNftAccount: sellerNftAccount,
        systemProgram: systemProgram,
        tokenProgram: token.TOKEN_PROGRAM_ID,
      } as any)
      .signers([seller, listingKeypair])
      .rpc();

    // Get initial balances
    const sellerInitialBalance = await provider.connection.getBalance(seller.publicKey);
    const buyerInitialBalance = await provider.connection.getBalance(buyer.publicKey);

    // Buy the NFT
    await program.methods
      .buyNft()
      .accounts({
        listing: listingKeypair.publicKey,
        buyer: buyer.publicKey,
        seller: seller.publicKey,
        sellerNftAccount: sellerNftAccount,
        buyerNftAccount: buyerNftAccount,
        tokenProgram: token.TOKEN_PROGRAM_ID,
      } as any)
      .signers([buyer, seller])  // Ensure both buyer and seller sign
      .rpc();

    // Fetch updated listing
    const listing = await program.account.listing.fetch(listingKeypair.publicKey);

    // Verify listing is no longer active
    assert.isFalse(listing.isActive);

    // Verify token transfer
    const sellerTokenBalance = await token.getAccount(provider.connection, sellerNftAccount);
    const buyerTokenBalance = await token.getAccount(provider.connection, buyerNftAccount);

    assert.equal(Number(sellerTokenBalance.amount), 0);
    assert.equal(Number(buyerTokenBalance.amount), 1);

    // Optional: Verify SOL transfer (rough check due to transaction fees)
    const sellerFinalBalance = await provider.connection.getBalance(seller.publicKey);
    const buyerFinalBalance = await provider.connection.getBalance(buyer.publicKey);

    assert.isTrue(sellerFinalBalance > sellerInitialBalance);
    assert.isTrue(buyerFinalBalance < buyerInitialBalance);
  });

  it("Should fail to buy an inactive listing", async () => {
    const listingKeypair = anchor.web3.Keypair.generate();
    const price = new anchor.BN(1000000000); // 1 SOL

    // First list the NFT
    await program.methods
      .listNft(price)
      .accounts({
        listing: listingKeypair.publicKey,
        seller: seller.publicKey,
        mint: mint,
        sellerNftAccount: sellerNftAccount,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: token.TOKEN_PROGRAM_ID,
      } as any)
      .signers([seller, listingKeypair])
      .rpc();

    // Cancel the listing first
    await program.methods
      .cancelListing()
      .accounts({
        listing: listingKeypair.publicKey,
        seller: seller.publicKey,
      } as any)
      .signers([seller])
      .rpc();

    // Try to buy the now-inactive listing
    try {
      await program.methods
        .buyNft()
        .accounts({
          listing: listingKeypair.publicKey,
          buyer: buyer.publicKey,
          seller: seller.publicKey,
          sellerNftAccount: sellerNftAccount,
          buyerNftAccount: buyerNftAccount,
          tokenProgram: token.TOKEN_PROGRAM_ID,
        } as any)
        .signers([buyer, seller])
        .rpc();

      assert.fail('Should have thrown an error');
    } catch (error) {
      // More robust error checking
      assert(error instanceof anchor.AnchorError, 'Expected AnchorError');
      assert.equal(error.error.errorCode.number, 6000); // MarketplaceError::ListingInactive
    }
  });


  it("Should cancel a listing", async () => {
    const listingKeypair = anchor.web3.Keypair.generate();
    const price = new anchor.BN(1000000000); // 1 SOL

    // First list the NFT
    await program.methods
      .listNft(price)
      .accounts({
        listing: listingKeypair.publicKey,
        seller: seller.publicKey,
        mint: mint,
        sellerNftAccount: sellerNftAccount,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: token.TOKEN_PROGRAM_ID,
      } as any)
      .signers([seller, listingKeypair])
      .rpc();

    // Cancel the listing
    await program.methods
      .cancelListing()
      .accounts({
        listing: listingKeypair.publicKey,
        seller: seller.publicKey,
      } as any)
      .signers([seller])
      .rpc();

    // Fetch updated listing
    const listing = await program.account.listing.fetch(listingKeypair.publicKey);

    // Verify listing is no longer active
    assert.isFalse(listing.isActive);
  });



  it("Should fail to cancel listing by unauthorized user", async () => {
    const listingKeypair = anchor.web3.Keypair.generate();
    const price = new anchor.BN(1000000000); // 1 SOL

    // First list the NFT
    await program.methods
      .listNft(price)
      .accounts({
        listing: listingKeypair.publicKey,
        seller: seller.publicKey,
        mint: mint,
        sellerNftAccount: sellerNftAccount,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: token.TOKEN_PROGRAM_ID,
      } as any)
      .signers([seller, listingKeypair])
      .rpc();

    // Try to cancel the listing with buyer account (not seller)
    try {
      await program.methods
        .cancelListing()
        .accounts({
          listing: listingKeypair.publicKey,
          seller: buyer.publicKey,
        } as any)
        .signers([buyer])
        .rpc();

      assert.fail('Should have thrown an error');
    } catch (error) {
      assert.include(error.message, 'Unauthorized');
    }
  });
});