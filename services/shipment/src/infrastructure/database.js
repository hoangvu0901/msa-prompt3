const { MongoClient } = require("mongodb");

if (!process.env.MONGO_USER || !process.env.MONGO_PASSWORD) {
  throw new Error("Shipment MongoDB credentials are missing");
}

const client = new MongoClient(
  process.env.MONGO_ADDRESS || "mongodb://shipment-db:27017",
  {
    auth: {
      username: process.env.MONGO_USER,
      password: process.env.MONGO_PASSWORD,
    },
    authSource: process.env.MONGO_DATABASE || "shipment_db",
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
    socketTimeoutMS: 10000,
  }
);

const database = client.db(
  process.env.MONGO_DATABASE || "shipment_db"
);

async function connectDatabase() {
  await client.connect();
  await database.command({ ping: 1 });
}

module.exports = { client, database, connectDatabase };
