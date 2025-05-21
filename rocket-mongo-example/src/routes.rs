use crate::db::MainDatabase;
use rocket::get;
use rocket::put;
use rocket::post;
use rocket::serde::json::Json;
use rocket::http::Status;
use rocket::response::status;

// MongoDB imports
use mongodb::bson::{ doc, Document };
use rocket_db_pools::Connection;

// Model imports
use crate::models::MintedNFTs;
use serde::{ Deserialize, Serialize };

// Import TryStreamExt to get try_collect()
use rocket::futures::TryStreamExt;

#[derive(Deserialize, Serialize, Debug)]
struct NFTMetadata {
    mint_address: String,
    name: String,
    symbol: String,
    price: f64,
    image_uri: String,
    metadata_uri: String,
    owner: String,
}

#[get("/get_listed_nfts", format = "json")]
pub async fn get_listed_nfts(
    mut db: Connection<MainDatabase>
) -> Result<Json<Vec<MintedNFTs>>, status::Custom<Json<serde_json::Value>>> {
    // Make sure to use the correct database name that matches your MongoDB instance
    let collection = db.database("nft_marketplace").collection("MintedNFTs");

    let filter = doc! { "is_listed": true };

    // Add error logging
    println!("Attempting to find listed NFTs");

    match collection.find(filter, None).await {
        Ok(cursor) => {
            match cursor.try_collect().await {
                Ok(nfts) => {
                    println!("Found NFTs successfully");
                    Ok(Json(nfts))
                }
                Err(e) => {
                    println!("Error collecting NFTs: {}", e);
                    Err(
                        status::Custom(
                            Status::InternalServerError,
                            Json(
                                serde_json::json!({
                            "status": "error",
                            "message": format!("Failed to collect NFTs: {}", e)
                        })
                            )
                        )
                    )
                }
            }
        }
        Err(e) => {
            println!("Error finding NFTs: {}", e);
            Err(
                status::Custom(
                    Status::InternalServerError,
                    Json(
                        serde_json::json!({
                    "status": "error",
                    "message": format!("Failed to find NFTs: {}", e)
                })
                    )
                )
            )
        }
    }
}

#[post("/list_nft", format = "json", data = "<nft_data>")]
pub async fn list_nft(
    nft_data: Json<NFTMetadata>,
    mut db: Connection<MainDatabase>
) -> status::Custom<Json<serde_json::Value>> {
    // Make sure to use the correct database name that matches your MongoDB instance
    let collection = db.database("nft_marketplace").collection::<MintedNFTs>("MintedNFTs");

    let nft = MintedNFTs {
        mint_address: nft_data.mint_address.clone(),
        name: nft_data.name.clone(),
        symbol: nft_data.symbol.clone(),
        price: nft_data.price,
        image_uri: nft_data.image_uri.clone(),
        metadata_uri: nft_data.metadata_uri.clone(),
        owner: nft_data.owner.clone(),
        is_listed: true,
    };

    // Add error logging
    println!("Attempting to insert NFT: {:?}", nft);

    match collection.insert_one(nft, None).await {
        Ok(result) => {
            println!("Insert successful: {:?}", result);
            if let Some(id) = result.inserted_id.as_object_id() {
                return status::Custom(
                    Status::Created,
                    Json(
                        serde_json::json!({
                        "status": "success",
                        "message": format!("NFT ({}) listed successfully", id.to_string())
                    })
                    )
                );
            } else {
                println!("No object ID returned");
            }
        }
        Err(e) => {
            println!("Insert error: {}", e);
            return status::Custom(
                Status::InternalServerError,
                Json(
                    serde_json::json!({
                    "status": "error",
                    "message": format!("Failed to list NFT: {}", e)
                })
                )
            );
        }
    }

    status::Custom(
        Status::InternalServerError,
        Json(
            serde_json::json!({
            "status": "error",
            "message": "Unknown error occurred"
        })
        )
    )
}

#[derive(Serialize, Deserialize)]
pub struct UpdateListingStatus {
    pub mint_address: String,
    pub is_listed: bool,
}

#[put("/update_nft_listing_status", format = "json", data = "<payload>")]
pub async fn update_nft_listing_status(
    payload: Json<UpdateListingStatus>,
    mut db: Connection<MainDatabase>
) -> Result<Json<serde_json::Value>, status::Custom<Json<serde_json::Value>>> {
    let collection = db.database("nft_marketplace").collection::<MintedNFTs>("MintedNFTs");

    let filter = doc! { "mint_address": &payload.mint_address };
    let update = doc! { "$set": { "is_listed": payload.is_listed } };

    match collection.update_one(filter, update, None).await {
        Ok(result) => {
            if result.modified_count == 0 {
                return Err(
                    status::Custom(
                        Status::NotFound,
                        Json(
                            serde_json::json!({
                    "status": "error",
                    "message": "No NFT found or no change made"
                })
                        )
                    )
                );
            }
            Ok(
                Json(
                    serde_json::json!({
                "status": "success",
                "message": "NFT listing status updated"
            })
                )
            )
        }
        Err(e) => {
            println!("Error updating listing status: {}", e);
            Err(
                status::Custom(
                    Status::InternalServerError,
                    Json(
                        serde_json::json!({
                "status": "error",
                "message": format!("Failed to update listing status: {}", e)
            })
                    )
                )
            )
        }
    }
}
