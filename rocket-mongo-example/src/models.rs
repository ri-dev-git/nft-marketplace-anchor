use serde::{ Deserialize, Serialize };

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct MintedNFTs {
    pub mint_address: String,
    pub name: String,
    pub symbol: String,
    pub price: f64,
    pub image_uri: String,
    pub metadata_uri: String,
    pub owner: String,
    pub is_listed: bool,
}
