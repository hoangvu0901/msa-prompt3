const {
  validatePid,
  validateProduct,
  validatePagination,
} = require("../domain/product");

const repository = require("../infrastructure/product-repository");

module.exports = {
  createProduct: async (input) =>
    repository.createProduct(validateProduct(input)),

  getProduct: async (input) =>
    repository.getProduct(validatePid(input.pid)),

  listProducts: async (input) =>
    repository.listProducts(validatePagination(input)),

  updateProduct: async (input) =>
    repository.updateProduct(
      validatePid(input.pid),
      validateProduct(input)
    ),

  deleteProduct: async (input) =>
    repository.deleteProduct(validatePid(input.pid)),
};
