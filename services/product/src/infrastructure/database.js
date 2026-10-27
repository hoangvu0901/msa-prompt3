const { MongoClient } = require("mongodb");

const username = process.env.MONGO_USER;
const password = process.env.MONGO_PASSWORD;
const databaseName = process.env.MONGO_DATABASE || "product_db";

if (!username || !password) {
  throw new Error("MongoDB application credentials are missing");
}

const client = new MongoClient(
  process.env.MONGO_ADDRESS || "mongodb://product-db:27017",
  {
    auth: { username, password },
    authSource: databaseName,
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
    socketTimeoutMS: 10000,
  }
);

const database = client.db(databaseName);

async function connectDatabase() {
  await client.connect();
  await database.command({ ping: 1 });
}

module.exports = {
  client,
  database,
  connectDatabase,
};
