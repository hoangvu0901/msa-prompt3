const { callOrder } = require("./order-client");
const { callAuth } = require("./auth-client");
const { callCustomer } = require("./customer-client");
const { callProduct } = require("./product-client");
const { callShipment } = require("./shipment-client");
const { redis, redisOperation } = require("./redis-client");

function serviceUp(result) {
  return result.status === "fulfilled" &&
    result.value.status === "UP" &&
    result.value.database === "connected";
}

async function healthHandler(req, res) {
  const [auth, customer, product, shipment, order, redisResult] =
    await Promise.allSettled([
      callAuth("healthCheck", {}, 3000),
      callCustomer("healthCheck", {}, 3000),
      callProduct("healthCheck", {}, 3000),
      callShipment("healthCheck", {}, 3000),
      callOrder("healthCheck", {}, 3000),
      redisOperation(() => redis.ping()),
    ]);

  const services = {
    gateway: "UP",
    auth: serviceUp(auth) ? "UP" : "DOWN",
    customer: serviceUp(customer) ? "UP" : "DOWN",
    product: serviceUp(product) ? "UP" : "DOWN",
    shipment: serviceUp(shipment) ? "UP" : "DOWN",
    order: serviceUp(order) ? "UP" : "DOWN",
    redis: redisResult.status === "fulfilled" &&
      redisResult.value === "PONG" ? "UP" : "DOWN",
  };

  const healthy = Object.values(services).every(value => value === "UP");

  res.setHeader("Cache-Control", "no-store");
  res.status(healthy ? 200 : 503).json({
    status: healthy ? "UP" : "DOWN",
    services,
  });
}

module.exports = { healthHandler };
