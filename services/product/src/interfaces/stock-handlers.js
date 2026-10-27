const { grpc } = require("../infrastructure/grpc-contract");
const { database } = require("../infrastructure/database");

async function getStocks(call, callback) {
  const pids = call.request.pids;

  if (
    !Array.isArray(pids) ||
    pids.length === 0 ||
    pids.length > 100 ||
    new Set(pids).size !== pids.length ||
    pids.some(pid =>
      !Number.isInteger(pid) || pid <= 0 || pid > 2147483647
    )
  ) {
    callback({
      code: grpc.status.INVALID_ARGUMENT,
      details: "Provide between 1 and 100 unique product IDs",
    });
    return;
  }

  try {
    const items = await database.collection("products")
      .find(
        { pid: { $in: pids } },
        { projection: { _id: 0, pid: 1, quantity: 1 } }
      )
      .toArray();

    callback(null, { items });
  } catch (error) {
    console.error("Stock lookup failed:", error.message);
    callback({
      code: grpc.status.UNAVAILABLE,
      details: "Stock lookup unavailable",
    });
  }
}

module.exports = { getStocks };
