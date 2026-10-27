const { createClient } = require("redis");

const redis = createClient({
  url: process.env.REDIS_URL || "redis://redis:6379",
  disableOfflineQueue: true,
  socket: {
    connectTimeout: 5000,
  },
});

redis.on("error", (error) => {
  console.error("Redis connection error:", error.message);
});

function connectRedis() {
  redis.connect().catch((error) => {
    console.error("Cannot connect to Redis:", error.message);
  });
}

function closeRedis() {
  if (redis.isOpen) {
    redis.destroy();
  }
}

async function redisOperation(operation) {
  if (!redis.isReady) {
    throw new Error("Redis is not ready");
  }

  let timer;

  try {
    return await Promise.race([
      operation(),
      new Promise((resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error("Redis operation timeout")),
          2000
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  redis,
  connectRedis,
  closeRedis,
  redisOperation,
};
