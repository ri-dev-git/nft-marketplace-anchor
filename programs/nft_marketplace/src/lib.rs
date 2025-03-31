use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use mpl_token_metadata::instructions::CreateMetadataAccountV3;

declare_id!("CfPFcbSj3P3SXcCBuqQMxytKhxFWntsUJmDKAJgTdeYf");

#[program]
mod nft_marketplace {

    use super::*;

    pub fn list_nft(ctx: Context<ListNFT>, price: u64) -> Result<()> {
        let listing = &mut ctx.accounts.listing;
        listing.seller = ctx.accounts.seller.key();
        listing.mint = ctx.accounts.mint.key();
        listing.price = price;
        listing.is_active = true;
        Ok(())
    }

    pub fn buy_nft(ctx: Context<BuyNFT>) -> Result<()> {
        let listing = &mut ctx.accounts.listing;
        require!(listing.is_active, MarketplaceError::ListingInactive);

        // Transfer SOL from buyer to seller using system program CPI
        let cpi_context = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.buyer.to_account_info(),
                to: ctx.accounts.seller.to_account_info(),
            },
        );
        system_program::transfer(cpi_context, listing.price)?;

        // Transfer NFT to buyer
        let cpi_accounts = Transfer {
            from: ctx.accounts.seller_nft_account.to_account_info(),
            to: ctx.accounts.buyer_nft_account.to_account_info(),
            authority: ctx.accounts.seller.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        token::transfer(CpiContext::new(cpi_program, cpi_accounts), 1)?;

        listing.is_active = false;
        Ok(())
    }

    pub fn cancel_listing(ctx: Context<CancelListing>) -> Result<()> {
        let listing = &mut ctx.accounts.listing;
        require!(
            listing.seller == ctx.accounts.seller.key(),
            MarketplaceError::Unauthorized
        );
        listing.is_active = false;
        Ok(())
    }
}
#[derive(Accounts)]
pub struct ListNFT<'info> {
    #[account(init, payer = seller, space = 8 + 32 + 32 + 8 + 1)]
    pub listing: Account<'info, Listing>,

    #[account(mut)]
    pub seller: Signer<'info>,

    #[account()]
    pub mint: Account<'info, Mint>, // ✅ Ensure Mint is correctly referenced

    #[account(
        mut,
        constraint = seller_nft_account.mint == mint.key(),
        constraint = seller_nft_account.owner == seller.key(),
    )]
    pub seller_nft_account: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>, // ✅ Ensure Token program is added
}

#[derive(Accounts)]
pub struct BuyNFT<'info> {
    #[account(mut)]
    pub listing: Account<'info, Listing>,

    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(
        mut,
        constraint = seller.key() == listing.seller
    )]
    pub seller: Signer<'info>,

    #[account(
        mut,
        constraint = seller_nft_account.mint == listing.mint,
        constraint = seller_nft_account.owner == seller.key(),
    )]
    pub seller_nft_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = buyer_nft_account.mint == listing.mint,
        constraint = buyer_nft_account.owner == buyer.key(),
    )]
    pub buyer_nft_account: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}
#[derive(Accounts)]
pub struct CancelListing<'info> {
    #[account(mut)]
    pub listing: Account<'info, Listing>,
    #[account(mut)]
    pub seller: Signer<'info>,
}
#[account]
pub struct Listing {
    pub seller: Pubkey,
    pub mint: Pubkey,
    pub price: u64,
    pub is_active: bool,
}

#[error_code]
pub enum MarketplaceError {
    #[msg("Listing is not active.")]
    ListingInactive,
    #[msg("Unauthorized action.")]
    Unauthorized,
}
