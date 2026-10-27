const repository = require("../infrastructure/shipment-status-repository");

function positiveId(value, field) {
  if (!Number.isInteger(value) || value <= 0 || value > 2147483647) {
    const error = new Error("Invalid " + field);
    error.kind = "VALIDATION";
    throw error;
  }
  return value;
}

module.exports = {
  getShipment: input =>
    repository.getShipment(positiveId(input.shipid, "shipid")),

  getShipmentByOrder: input =>
    repository.getShipmentByOrder(positiveId(input.oid, "oid")),

  updateShipmentStatus: input => {
    const shipid = positiveId(input.shipid, "shipid");

    if (!["PENDING", "SHIPPING", "DELIVERED"].includes(input.status)) {
      const error = new Error("Unsupported shipment status");
      error.kind = "VALIDATION";
      throw error;
    }

    return repository.updateStatus(shipid, input.status);
  },
};
