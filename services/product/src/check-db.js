const assert = require("node:assert/strict");
const {
  client,
  database,
  connectDatabase,
} = require("./infrastructure/database");

async function main() {
  try {
    await connectDatabase();

    assert.equal(database.databaseName, "product_db");

    console.log("Database:", database.databaseName);

    const status = await database.command({
      connectionStatus: 1,
    });

    const users = status.authInfo.authenticatedUsers;
    const roles = status.authInfo.authenticatedUserRoles;

    assert.ok(users.some(
      (user) =>
        user.user === "product_user" &&
        user.db === "product_db"
    ));

    assert.ok(roles.some(
      (role) =>
        role.role === "readWrite" &&
        role.db === "product_db"
    ));

    assert.ok(roles.every(
      (role) =>
        role.role === "readWrite" &&
        role.db === "product_db"
    ));

    console.log("PASS: Connected as product_user with product_db readWrite.");

    const indexes = await database.collection("products")
      .listIndexes()
      .toArray();

    assert.ok(indexes.some(
      (index) =>
        index.name === "unique_product_pid" &&
        index.unique === true
    ));

    console.log("PASS: Unique product pid index exists.");

    const counter = await database.collection("counters")
      .findOne({ _id: "product_pid" });

    assert.ok(counter);
    assert.ok(Number.isInteger(counter.seq) && counter.seq >= 0);

    console.log("Product counter:", counter.seq);

    const total = await database.collection("products")
      .countDocuments();

    console.log("Total products:", total);
    console.log("PASS: Product database connection and checks.");
  } catch (error) {
    console.error("FAIL:", error.message);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}

main();
