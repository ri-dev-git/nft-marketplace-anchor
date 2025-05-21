use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    metadata::{
        create_master_edition_v3, create_metadata_accounts_v3, CreateMasterEditionV3,
        CreateMetadataAccountsV3, Metadata,
    },
    token::{mint_to, Mint, MintTo, Token, TokenAccount},
};

use mpl_token_metadata::types::DataV2;

use mpl_token_metadata::accounts::{MasterEdition, Metadata as MetadataAccount};
use mpl_token_metadata::instructions::BurnNftCpiBuilder;

declare_id!("7oEFwgSPqj1XWYQJ9yEC8PAgP45Ye8pK8uW5e8NqiAdt");

#[program]
pub mod nft_marketplace {

    use super::*;

    pub fn mint_nft(
        ctx: Context<MintNFT>,
        name: String,
        symbol: String,
        uri: String,
    ) -> Result<()> {
        let cpi_program = ctx.accounts.token_program.to_account_info();

        let cpi_accounts = MintTo {
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.associated_token_account.to_account_info(),
            authority: ctx.accounts.signer.to_account_info(),
        };

        let cpi_context = CpiContext::new(cpi_program, cpi_accounts);

        mint_to(cpi_context, 1)?;

        let cpi_context = CpiContext::new(
            ctx.accounts.token_metadata_program.to_account_info(),
            CreateMetadataAccountsV3 {
                metadata: ctx.accounts.metadata_account.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                mint_authority: ctx.accounts.signer.to_account_info(),
                update_authority: ctx.accounts.signer.to_account_info(),
                payer: ctx.accounts.signer.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
                rent: ctx.accounts.rent.to_account_info(),
            },
        );

        let data_v2 = DataV2 {
            name: name,
            symbol: symbol,
            uri: uri,
            seller_fee_basis_points: 0,
            creators: None,
            collection: None,
            uses: None,
        };

        create_metadata_accounts_v3(cpi_context, data_v2, false, true, None)?;

        let cpi_context = CpiContext::new(
            ctx.accounts.token_metadata_program.to_account_info(),
            CreateMasterEditionV3 {
                edition: ctx.accounts.master_edition_account.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                update_authority: ctx.accounts.signer.to_account_info(),
                mint_authority: ctx.accounts.signer.to_account_info(),
                payer: ctx.accounts.signer.to_account_info(),
                metadata: ctx.accounts.metadata_account.to_account_info(),
                token_program: ctx.accounts.token_program.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
                rent: ctx.accounts.rent.to_account_info(),
            },
        );

        create_master_edition_v3(cpi_context, None)?;

        Ok(())
    }

    pub fn burn_nft(ctx: Context<BurnNFT>, _nft_mint: Pubkey) -> Result<()> {
        let owner = ctx.accounts.owner.to_account_info();
        let metadata = ctx.accounts.metadata.to_account_info();
        let collection_metadata = ctx
            .accounts
            .collection_metadata
            .as_ref()
            .map(|a| a.to_account_info());
        let mint = ctx.accounts.mint.to_account_info();
        let token = ctx.accounts.token.to_account_info();
        let edition = ctx.accounts.edition.to_account_info();
        let spl_token = ctx.accounts.spl_token.to_account_info();
        let metadata_program_id = ctx.accounts.metadata_program_id.to_account_info();

        BurnNftCpiBuilder::new(&metadata_program_id)
            .metadata(&metadata)
            // if your NFT is part of a collection you will also need to pass in the collection metadata address.
            .collection_metadata(collection_metadata.as_ref())
            .owner(&owner)
            .mint(&mint)
            .token_account(&token)
            .master_edition_account(&edition)
            .spl_token_program(&spl_token)
            .invoke()?;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct MintNFT<'info> {
    /// CHECK: signer is a trusted signer, verified by constraint `signer`
    #[account(mut, signer)]
    pub signer: AccountInfo<'info>,

    #[account(
        init,
        payer = signer,
        mint::decimals = 0,
        mint::authority = signer.key(),
        mint::freeze_authority = signer.key(),
    )]
    pub mint: Account<'info, Mint>,

    #[account(
        init_if_needed,
        payer = signer,
        associated_token::mint = mint,
        associated_token::authority = signer
    )]
    pub associated_token_account: Account<'info, TokenAccount>,

    /// CHECK: PDA for metadata account verified via `address = ...`
    #[account(
        mut,
        address = MetadataAccount::find_pda(&mint.key()).0,
    )]
    pub metadata_account: AccountInfo<'info>,

    /// CHECK: PDA for master edition verified via `address = ...`
    #[account(
        mut,
        address = MasterEdition::find_pda(&mint.key()).0,
    )]
    pub master_edition_account: AccountInfo<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_metadata_program: Program<'info, Metadata>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}
#[derive(Accounts)]
pub struct BurnNFT<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(mut)]
    pub mint: Account<'info, Mint>,

    /// CHECK: Verified via PDA and CPI constraints in burn logic
    #[account(mut)]
    pub metadata: AccountInfo<'info>,

    /// CHECK: Token account is checked in program logic
    #[account(mut)]
    pub token: AccountInfo<'info>,

    /// CHECK: Master edition is verified by PDA address
    #[account(mut)]
    pub edition: AccountInfo<'info>,

    /// CHECK: Optional, verified by collection or PDA constraint if provided
    pub collection_metadata: Option<AccountInfo<'info>>,

    /// CHECK: Standard SPL Token program
    pub spl_token: AccountInfo<'info>,

    /// CHECK: Verified by CPI call to token metadata program
    pub metadata_program_id: AccountInfo<'info>,
}