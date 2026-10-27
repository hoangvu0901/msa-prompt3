const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const {
  callProduct,
  closeClients,
} = require("./infrastructure/grpc-clients");

const base = "http://api-gateway:3002";
let reservation;

async function request(method, path, token, body) {
  const headers = {};
  if (token) headers.Authorization = "Bearer " + token;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(base + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });

  return {
    status: response.status,
    data: await response.json(),
    cache: response.headers.get("x-cache"),
    stockSource: response.headers.get("x-stock-source"),
  };
}

function expect(result, status) {
  assert.equal(
    result.status,
    status,
    "Expected HTTP " + status + ", received " + result.status
  );
  return result.data;
}

async function main() {
  assert.ok(process.env.BOOTSTRAP_ADMIN_USERNAME);
  assert.ok(process.env.BOOTSTRAP_ADMIN_PASSWORD);

  const login = expect(await request(
    "POST", "/api/auth/login", null, {
      username: process.env.BOOTSTRAP_ADMIN_USERNAME,
      password: process.env.BOOTSTRAP_ADMIN_PASSWORD,
    }
  ), 200);
  const token = login.accessToken;
  assert.ok(token);

  const product = expect(await request(
    "POST", "/api/products", token, {
      pname: "Live stock test " + randomUUID(),
      price: 100,
      quantity: 10,
    }
  ), 201);

  const detailPath = "/api/products/" + product.pid;

  // Find the page containing the new product using the service's PID ordering.
  let page = 1;
  let listPath;

  while (true) {
    const currentPath = "/api/products?page=" + page + "&pageSize=100";
    const result = await request("GET", currentPath, token);
    const data = expect(result, 200);

    if (data.items.some(item => item.pid === product.pid)) {
      listPath = currentPath;
      break;
    }

    assert.ok(
      page * 100 < data.total,
      "New product not found in list"
    );
    page++;
  }

  expect(await request("GET", detailPath, token), 200);
  const warmDetail = await request("GET", detailPath, token);
  expect(warmDetail, 200);
  assert.equal(warmDetail.cache, "HIT");
  assert.equal(warmDetail.data.quantity, 10);

  const warmList = await request("GET", listPath, token);
  expect(warmList, 200);
  assert.equal(warmList.cache, "HIT");
  console.log("PASS: Product detail and list caches are warm.");

  reservation = {
    pid: product.pid,
    qty: 3,
    reservationId: randomUUID(),
  };

  await callProduct("reserveStock", reservation);

  const heldDetail = await request("GET", detailPath, token);
  expect(heldDetail, 200);
  assert.equal(heldDetail.cache, "HIT");
  assert.equal(heldDetail.stockSource, "product-service");
  assert.equal(heldDetail.data.quantity, 7);

  const heldList = await request("GET", listPath, token);
  expect(heldList, 200);
  assert.equal(heldList.cache, "HIT");
  assert.equal(
    heldList.data.items.find(item => item.pid === product.pid).quantity,
    7
  );
  console.log("PASS: Cached detail and list show freshly reserved stock.");

  expect(await request("GET", detailPath), 401);
  console.log("PASS: Warm product cache still requires JWT.");

  await callProduct("releaseStock", reservation);

  const releasedDetail = await request("GET", detailPath, token);
  expect(releasedDetail, 200);
  assert.equal(releasedDetail.cache, "HIT");
  assert.equal(releasedDetail.data.quantity, 10);

  const releasedList = await request("GET", listPath, token);
  expect(releasedList, 200);
  assert.equal(releasedList.cache, "HIT");
  assert.equal(
    releasedList.data.items.find(item => item.pid === product.pid).quantity,
    10
  );
  console.log("PASS: Cached detail and list show restored stock.");

  reservation = null;
  console.log("ALL LIVE STOCK CACHE CHECKS PASSED");
}

main()
  .catch(error => {
    console.error("FAIL:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      if (reservation) {
        await callProduct("releaseStock", reservation);
      }
    } catch (error) {
      console.error("Test reservation cleanup failed:", error.message);
      process.exitCode = 1;
    } finally {
      closeClients();
    }
  });
