const { Kafka, logLevel } = require("kafkajs");

const kafka = new Kafka({
  clientId: "msa-shipment-consumer",
  brokers: (process.env.KAFKA_BROKERS || "kafka:9092")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean),
  connectionTimeout: 5000,
  requestTimeout: 15000,
  retry: {
    initialRetryTime: 300,
    retries: 3,
  },
  logLevel: logLevel.ERROR,
});

const consumer = kafka.consumer({
  groupId: process.env.KAFKA_GROUP_ID || "shipment-order-created-v1",
  allowAutoTopicCreation: false,
  sessionTimeout: 60000,
  heartbeatInterval: 3000,
});

module.exports = { consumer };
