const shipmentDb = db.getSiblingDB("shipment_db");

function check(condition, message) {
  if (!condition) throw new Error(message);
}

check(
  shipmentDb.runCommand({ ping: 1 }).ok === 1,
  "MongoDB ping failed"
);

const auth = shipmentDb.runCommand({
  connectionStatus: 1,
  showPrivileges: false,
});

check(auth.ok === 1, "Cannot inspect connection authentication");

const users = auth.authInfo.authenticatedUsers;
check(
  users.some(user =>
    user.user === "shipment_user" &&
    user.db === "shipment_db"
  ),
  "Connection is not authenticated as shipment_user"
);

const roles = auth.authInfo.authenticatedUserRoles;
check(
  roles.length === 1 &&
  roles[0].role === "readWrite" &&
  roles[0].db === "shipment_db",
  "Unexpected application roles"
);

print("Database: " + shipmentDb.getName());
print("PASS: Connected as shipment_user with shipment_db readWrite.");

const indexes = shipmentDb.shipments.getIndexes();

for (const [name, field] of [
  ["unique_shipment_shipid", "shipid"],
  ["unique_shipment_oid", "oid"],
  ["unique_shipment_event_id", "event_id"],
]) {
  const index = indexes.find(item => item.name === name);

  check(
    index &&
    index.unique === true &&
    Object.keys(index.key).length === 1 &&
    index.key[field] === 1,
    "Missing or incorrect unique index: " + name
  );

  print("PASS: " + name + " exists.");
}

const counter = shipmentDb.counters.findOne({
  _id: "shipment_shipid",
});

check(counter !== null, "Shipment counter is missing");

const sequence = Number(counter.seq);
check(
  Number.isInteger(sequence) && sequence >= 0,
  "Shipment counter is invalid"
);

print("Shipment counter: " + sequence);
print("Total shipments: " + shipmentDb.shipments.countDocuments());
print("PASS: Shipment database connection and checks.");
