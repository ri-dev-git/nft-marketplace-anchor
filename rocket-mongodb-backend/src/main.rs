mod db;
mod models;
mod routes;
use rocket_cors::{AllowedOrigins, CorsOptions};

use rocket::{ launch, routes };
use rocket_db_pools::Database;

#[launch]
fn rocket() -> _ {
    let cors = CorsOptions::default()
        .to_cors()
        .expect("CORS failed");

    rocket::build()
        .attach(db::MainDatabase::init())
        .attach(cors) // ✅ Attach the CORS fairing here
        .mount(
            "/",
            routes![
                routes::get_listed_nfts,
                routes::list_nft,
                routes::update_nft_listing_status,
                routes::delete_nft,
            ]
        )
}