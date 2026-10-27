try {
  const password = process.env.PRODUCT_APP_PASSWORD;

  if (!password || password.length < 24) {
    throw new Error("PRODUCT_APP_PASSWORD is missing or too short");
  }

  const productDb = db.getSiblingDB("product_db");

  if (!productDb.getUser("product_user")) {
    productDb.createUser({
      user: "product_user",
      pwd: password,
      roles: [
        { role: "readWrite", db: "product_db" },
      ],
    });

    print("Created product_user.");
  } else {
    print("product_user already exists.");
  }

  const collections = productDb.getCollectionNames();

  if (!collections.includes("products")) {
    productDb.createCollection("products");
  }

  if (!collections.includes("counters")) {
    productDb.createCollection("counters");
  }

  productDb.products.createIndex(
    { pid: 1 },
    { unique: true, name: "unique_product_pid" }
  );

  productDb.counters.updateOne(
    { _id: "product_pid" },
    { $setOnInsert: { seq: 0 } },
    { upsert: true }
  );

  print("PASS: Product database initialized.");
} catch (error) {
  print("FAIL: " + error.message);
  quit(1);
}
