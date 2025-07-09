use anchor_lang::prelude::*;
use anchor_lang::solana_program::{program::invoke, system_instruction};
use anchor_spl::{
    associated_token::AssociatedToken,
    metadata::{
        create_master_edition_v3, create_metadata_accounts_v3, CreateMasterEditionV3,
        CreateMetadataAccountsV3, Metadata,
    },
    token::{mint_to, Mint, MintTo, Token, TokenAccount, transfer_checked, TransferChecked},
};
use mpl_token_metadata::types::DataV2;
use mpl_token_metadata::accounts::{MasterEdition, Metadata as MetadataAccount};

declare_id!("8kU8YRPEr9SYYfr37iEb7PDLTARq2yuWr2kL7emyzYAk");

pub const AUTHORITY_SEED: &[u8] = b"authority";
pub const LISTING_SEED: &[u8] = b"listing";

#[program]
pub mod nft_marketplace {
    use super::*;

    pub fn mint_nft(
        ctx: Context<MintNFT>,
        name: String,
        symbol: String,
        uri: String,
        bump: u8,
    ) -> Result<()> {
        let seeds = &[AUTHORITY_SEED, &[bump]];
        let signer_seeds = &[&seeds[..]];

        // Mint the NFT
        mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.associated_token_account.to_account_info(),
                    authority: ctx.accounts.pda.to_account_info(),
                },
                signer_seeds,
            ),
            1,
        )?;

        // Create metadata
        let data = DataV2 {
            name,
            symbol,
            uri,
            seller_fee_basis_points: 0,
            creators: None,
            collection: None,
            uses: None,
        };

        create_metadata_accounts_v3(
            CpiContext::new(
                ctx.accounts.token_metadata_program.to_account_info(),
                CreateMetadataAccountsV3 {
                    metadata: ctx.accounts.metadata_account.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    mint_authority: ctx.accounts.pda.to_account_info(),
                    update_authority: ctx.accounts.pda.to_account_info(),
                    payer: ctx.accounts.signer.to_account_info(),
                    system_program: ctx.accounts.system_program.to_account_info(),
                    rent: ctx.accounts.rent.to_account_info(),
                },
            )
            .with_signer(signer_seeds),
            data,
            false,
            true,
            None,
        )?;

        // Create master edition
        create_master_edition_v3(
            CpiContext::new(
                ctx.accounts.token_metadata_program.to_account_info(),
                CreateMasterEditionV3 {
                    edition: ctx.accounts.master_edition_account.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    update_authority: ctx.accounts.pda.to_account_info(),
                    mint_authority: ctx.accounts.pda.to_account_info(),
                    payer: ctx.accounts.signer.to_account_info(),
                    metadata: ctx.accounts.metadata_account.to_account_info(),
                    token_program: ctx.accounts.token_program.to_account_info(),
                    system_program: ctx.accounts.system_program.to_account_info(),
                    rent: ctx.accounts.rent.to_account_info(),
                },
            )
            .with_signer(signer_seeds),
            None,
        )?;

        Ok(())
    }

    pub fn list_nft(ctx: Context<ListNFT>, price: u64, bump: u8) -> Result<()> {
        // Transfer NFT from seller to marketplace escrow
        transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.seller_token_account.to_account_info(),
                    to: ctx.accounts.escrow_token_account.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    authority: ctx.accounts.seller.to_account_info(),
                },
            ),
            1,
            0,
        )?;

        // Initialize listing account
        let listing = &mut ctx.accounts.listing;
        listing.seller = ctx.accounts.seller.key();
        listing.mint = ctx.accounts.mint.key();
        listing.price = price;
        listing.is_active = true;
        listing.bump = bump;

        Ok(())
    }

    // NEW: Update price instruction
    pub fn update_price(ctx: Context<UpdatePrice>, new_price: u64) -> Result<()> {
        let listing = &mut ctx.accounts.listing;
        
        // Verify listing is active
        require!(listing.is_active, ErrorCode::ListingNotActive);
        
        // Only seller can update price
        require!(listing.seller == ctx.accounts.seller.key(), ErrorCode::UnauthorizedSeller);
        
        // Validate price is greater than 0
        require!(new_price > 0, ErrorCode::InvalidPrice);
        
        // Update the price
        listing.price = new_price;
        
        msg!("Price updated from {} to {} lamports", listing.price, new_price);
        
        Ok(())
    }

    pub fn buy_nft(ctx: Context<BuyNFT>, bump: u8) -> Result<()> {
        let listing = &ctx.accounts.listing;
        
        // Verify listing is active
        require!(listing.is_active, ErrorCode::ListingNotActive);
        
        // Transfer SOL from buyer to seller
        invoke(
            &system_instruction::transfer(
                ctx.accounts.buyer.key,
                &listing.seller,
                listing.price,
            ),
            &[
                ctx.accounts.buyer.to_account_info(),
                ctx.accounts.seller.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        // Transfer NFT from escrow to buyer
        let seeds = &[AUTHORITY_SEED, &[bump]];
        let signer_seeds = &[&seeds[..]];
        
        transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.escrow_token_account.to_account_info(),
                    to: ctx.accounts.buyer_token_account.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    authority: ctx.accounts.pda.to_account_info(),
                },
                signer_seeds,
            ),
            1,
            0,
        )?;

        Ok(())
    }

    pub fn delist_nft(ctx: Context<DelistNFT>, bump: u8) -> Result<()> {
        let listing = &mut ctx.accounts.listing;
        
        // Verify listing is active
        require!(listing.is_active, ErrorCode::ListingNotActive);
        
        // Only seller can delist
        require!(listing.seller == ctx.accounts.seller.key(), ErrorCode::UnauthorizedSeller);

        // Transfer NFT back to seller
        let seeds = &[AUTHORITY_SEED, &[bump]];
        let signer_seeds = &[&seeds[..]];
        
        transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.escrow_token_account.to_account_info(),
                    to: ctx.accounts.seller_token_account.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    authority: ctx.accounts.pda.to_account_info(),
                },
                signer_seeds,
            ),
            1,
            0,
        )?;

        // Mark listing as inactive
        listing.is_active = false;

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(bump: u8)]
pub struct MintNFT<'info> {
    #[account(mut, signer)]
    pub signer: Signer<'info>,

    #[account(
        init,
        payer = signer,
        mint::decimals = 0,
        mint::authority = pda.key(),
        mint::freeze_authority = pda.key(),
    )]
    pub mint: Account<'info, Mint>,

    #[account(
        seeds = [AUTHORITY_SEED],
        bump,
    )]
    pub pda: SystemAccount<'info>,

    #[account(
        init_if_needed,
        payer = signer,
        associated_token::mint = mint,
        associated_token::authority = signer
    )]
    pub associated_token_account: Account<'info, TokenAccount>,

    /// CHECK: Metaplex Metadata PDA
    #[account(mut)]
    pub metadata_account: AccountInfo<'info>,

    /// CHECK: Metaplex Master Edition PDA
    #[account(mut)]
    pub master_edition_account: AccountInfo<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_metadata_program: Program<'info, Metadata>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(price: u64, bump: u8)]
pub struct ListNFT<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,

    #[account(mut)]
    pub mint: Account<'info, Mint>,

    #[account(
        seeds = [AUTHORITY_SEED],
        bump,
    )]
    pub pda: SystemAccount<'info>,

    #[account(
        mut,
        constraint = seller_token_account.amount == 1 &&
                     seller_token_account.owner == seller.key() &&
                     seller_token_account.mint == mint.key()
    )]
    pub seller_token_account: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = seller,
        associated_token::mint = mint,
        associated_token::authority = pda
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = seller,
        space = 8 + 32 + 32 + 8 + 1 + 1, // discriminator + seller + mint + price + is_active + bump
        seeds = [LISTING_SEED, mint.key().as_ref()],
        bump
    )]
    pub listing: Account<'info, Listing>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

// NEW: Update price context
#[derive(Accounts)]
pub struct UpdatePrice<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,

    #[account(mut)]
    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [LISTING_SEED, mint.key().as_ref()],
        bump = listing.bump,
        constraint = listing.seller == seller.key() @ ErrorCode::UnauthorizedSeller
    )]
    pub listing: Account<'info, Listing>,
}

#[derive(Accounts)]
#[instruction(bump: u8)]
pub struct BuyNFT<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    /// CHECK: seller receives SOL
    #[account(mut)]
    pub seller: AccountInfo<'info>,

    #[account(mut)]
    pub mint: Account<'info, Mint>,

    #[account(
        seeds = [AUTHORITY_SEED],
        bump,
    )]
    pub pda: SystemAccount<'info>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = pda
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::mint = mint,
        associated_token::authority = buyer
    )]
    pub buyer_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [LISTING_SEED, mint.key().as_ref()],
        bump = listing.bump,
        close = seller
    )]
    pub listing: Account<'info, Listing>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(bump: u8)]
pub struct DelistNFT<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,

    #[account(mut)]
    pub mint: Account<'info, Mint>,

    #[account(
        seeds = [AUTHORITY_SEED],
        bump,
    )]
    pub pda: SystemAccount<'info>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = pda
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = seller
    )]
    pub seller_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [LISTING_SEED, mint.key().as_ref()],
        bump = listing.bump,
        close = seller
    )]
    pub listing: Account<'info, Listing>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct Listing {
    pub seller: Pubkey,
    pub mint: Pubkey,
    pub price: u64,
    pub is_active: bool,
    pub bump: u8,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Listing is not active")]
    ListingNotActive,
    #[msg("Unauthorized seller")]
    UnauthorizedSeller,
    #[msg("Invalid price - must be greater than 0")]
    InvalidPrice,
}