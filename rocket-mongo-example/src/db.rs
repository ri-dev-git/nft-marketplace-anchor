use rocket_db_pools::{ mongodb::Client, Database };

#[derive(Database)]
#[database("nftDb")]
pub struct MainDatabase(Client);
