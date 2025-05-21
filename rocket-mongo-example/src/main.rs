mod db;
mod models;
mod routes;

use rocket::{ launch, routes };
use rocket_db_pools::Database;

#[launch]
fn rocket() -> _ {
    rocket
        ::build()
        .attach(db::MainDatabase::init())
        .mount(
            "/",
            routes![routes::get_listed_nfts, routes::list_nft, routes::update_nft_listing_status]
        )
}
