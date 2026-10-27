const { randomUUID } = require("node:crypto");
const { redis, redisOperation } = require("./redis-client");

const generationKey = "msa:cache:products:generation";
const ttlSeconds = 60;

const saveScript = `
  if redis.call('GET', KEYS[1]) == ARGV[1] then
    redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[3])
    return 1
  end
  return 0
`;

async function readProductCache(suffix, load) {
  let generation;
  let key;

  try {
    generation = await redisOperation(() =>
      redis.get(generationKey)
    );

    if (!generation) {
      await redisOperation(() =>
        redis.set(generationKey, randomUUID(), { NX: true })
      );

      generation = await redisOperation(() =>
        redis.get(generationKey)
      );
    }

    if (!generation) {
      throw new Error("Missing cache generation");
    }

    key = `msa:cache:products:data:${generation}:${suffix}`;

    const cached = await redisOperation(() => redis.get(key));

    if (cached !== null) {
      return {
        data: JSON.parse(cached),
        cache: "HIT",
      };
    }
  } catch {
    return {
      data: await load(),
      cache: "BYPASS",
    };
  }

  const data = await load();

  try {
    const saved = await redisOperation(() =>
      redis.eval(saveScript, {
        keys: [generationKey, key],
        arguments: [
          generation,
          JSON.stringify(data),
          String(ttlSeconds),
        ],
      })
    );

    return {
      data,
      cache: Number(saved) === 1 ? "MISS" : "BYPASS",
    };
  } catch {
    return { data, cache: "BYPASS" };
  }
}

async function invalidateProductCache() {
  try {
    await redisOperation(() =>
      redis.set(generationKey, randomUUID())
    );

    return "OK";
  } catch {
    console.error(
      "Product changed but cache invalidation failed; old entries expire by TTL."
    );

    return "FAILED";
  }
}

module.exports = {
  readProductCache,
  invalidateProductCache,
};
