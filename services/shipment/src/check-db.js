const {
  client,
  database,
  connectDatabase,
} = require("./infrastructure/database");

async function main() {
  await connectDatabase();

  const indexes = await database.collection("shipments").indexes();

  for (const name of [
    "unique_shipment_shipid",
    "unique_shipment_oid",
    "unique_shipment_event_id",
  ]) {
    if (!indexes.some(index => index.name === name && index.unique)) {
      throw new Error("Missing unique index: " + name);
    }
  }

  console.log("Database:", database.databaseName);
  console.log("PASS: Shipment application connection and indexes.");
}

main()
  .catch(error => {
    console.error("FAIL:", error.message);
    process.exitCode = 1;
  })
  .finally(() => client.close());
