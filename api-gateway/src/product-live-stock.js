const { callProduct } = require("./product-client");
const { grpc } = require("./auth-client");

async function refreshProductStock(cached, reloadList) {
  const isList = Array.isArray(cached.data.items);
  const products = isList ? cached.data.items : [cached.data];

  if (products.length === 0) return cached;

  const result = await callProduct("getStocks", {
    pids: products.map(product => product.pid),
  });

  const quantities = new Map(
    result.items.map(item => [item.pid, item.quantity])
  );

  const missing = products.some(product => !quantities.has(product.pid));

  if (missing) {
    if (isList) {
      // A cached list may contain a product deleted in the meantime.
      // Reload the list, including current quantities, from Product.
      return {
        data: await reloadList(),
        cache: "BYPASS",
      };
    }

    const error = new Error("Product not found");
    error.code = grpc.status.NOT_FOUND;
    error.details = "Product not found";
    throw error;
  }

  const updated = products.map(product => ({
    ...product,
    quantity: quantities.get(product.pid),
  }));

  return {
    cache: cached.cache,
    data: isList
      ? { ...cached.data, items: updated }
      : updated[0],
  };
}

module.exports = { refreshProductStock };
