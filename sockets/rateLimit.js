const logger = require('../services/loggerService');

const buckets = new Map();

const DEFAULT_WINDOW_MS = Number(process.env.SOCKET_RATE_LIMIT_WINDOW_MS || 60000);
const DEFAULT_MAX = Number(process.env.SOCKET_RATE_LIMIT_MAX || 60);

const now = () => Date.now();

const pruneExpired = (bucket, currentTime) => {
    while (bucket.length > 0 && currentTime - bucket[0] > DEFAULT_WINDOW_MS) {
        bucket.shift();
    }
};

const isRateLimited = ({ key, limit = DEFAULT_MAX, windowMs = DEFAULT_WINDOW_MS }) => {
    const currentTime = now();
    const bucket = buckets.get(key) || [];

    while (bucket.length > 0 && currentTime - bucket[0] > windowMs) {
        bucket.shift();
    }

    if (bucket.length >= limit) {
        buckets.set(key, bucket);
        return true;
    }

    bucket.push(currentTime);
    buckets.set(key, bucket);
    return false;
};

setInterval(() => {
    const currentTime = now();

    for (const [key, bucket] of buckets.entries()) {
        pruneExpired(bucket, currentTime);
        if (bucket.length === 0) {
            buckets.delete(key);
        }
    }

    logger.info('socket_rate_limit_bucket_cleanup', { bucketCount: buckets.size });
}, 300000).unref();

module.exports = {
    isRateLimited,
};
