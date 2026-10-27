const { Kafka, Partitioners, logLevel } = require("kafkajs");

const kafka = new Kafka({
  clientId: "msa-order-outbox",
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

const producer = kafka.producer({
  allowAutoTopicCreation: false,
  maxInFlightRequests: 1,
  createPartitioner: Partitioners.DefaultPartitioner,
});

module.exports = { producer };
