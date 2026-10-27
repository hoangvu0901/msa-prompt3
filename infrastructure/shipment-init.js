const shipmentDb = db.getSiblingDB("shipment_db");
const password = process.env.SHIPMENT_APP_PASSWORD;

if (!password) {
  throw new Error("Missing SHIPMENT_APP_PASSWORD");
}

const existingUser = shipmentDb.getUser("shipment_user");

if (!existingUser) {
  shipmentDb.createUser({
    user: "shipment_user",
    pwd: password,
    roles: [{ role: "readWrite", db: "shipment_db" }],
  });
  print("Created shipment_user.");
} else {
  const roles = existingUser.roles;

  if (
    roles.length !== 1 ||
    roles[0].role !== "readWrite" ||
    roles[0].db !== "shipment_db"
  ) {
    throw new Error("Existing shipment_user has unexpected roles");
  }

  print("Existing shipment_user preserved.");
}

for (const name of ["shipments", "counters"]) {
  if (!shipmentDb.getCollectionNames().includes(name)) {
    shipmentDb.createCollection(name);
  }
}

shipmentDb.shipments.createIndex(
  { shipid: 1 },
  { unique: true, name: "unique_shipment_shipid" }
);

shipmentDb.shipments.createIndex(
  { oid: 1 },
  { unique: true, name: "unique_shipment_oid" }
);

shipmentDb.shipments.createIndex(
  { event_id: 1 },
  { unique: true, name: "unique_shipment_event_id" }
);

shipmentDb.shipments.createIndex(
  { uid: 1, shipid: -1 },
  { name: "shipment_customer_lookup" }
);

shipmentDb.counters.updateOne(
  { _id: "shipment_shipid" },
  { $setOnInsert: { seq: 0 } },
  { upsert: true }
);

print("PASS: Shipment collections, indexes and counter initialized.");
