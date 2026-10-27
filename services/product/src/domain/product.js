function invalid(message) {
  const error = new Error(message);
  error.kind = "VALIDATION";
  throw error;
}

function validatePid(pid) {
  if (!Number.isInteger(pid) || pid <= 0 || pid > 2147483647) {
    invalid("Invalid product ID");
  }

  return pid;
}

function validateProduct(input) {
  const pname = (input.pname || "").trim();
  const price = (input.price || "").trim();
  const quantity = input.quantity;

  if (!pname || [...pname].length > 100) {
    invalid("Product name must contain 1-100 characters");
  }

  if (!/^(0|[1-9][0-9]{0,7})(\.[0-9]{1,2})?$/.test(price)) {
    invalid("Price must be between 0 and 99999999.99 with at most 2 decimals");
  }

  if (
    !Number.isInteger(quantity) ||
    quantity < 0 ||
    quantity > 2147483647
  ) {
    invalid("Quantity must be a non-negative integer");
  }

  const [whole, fraction = ""] = price.split(".");

  return {
    pname,
    price: whole + "." + fraction.padEnd(2, "0"),
    quantity,
  };
}

function validatePagination(input) {
  const page = input.page === 0 ? 1 : input.page;
  const pageSize = input.pageSize === 0 ? 20 : input.pageSize;

  if (
    !Number.isInteger(page) ||
    page < 1 ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100
  ) {
    invalid("Invalid pagination");
  }

  return { page, pageSize };
}

module.exports = {
  validatePid,
  validateProduct,
  validatePagination,
};
