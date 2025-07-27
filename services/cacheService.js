// services/cacheService.js

// A simple in-memory cache using a Map
const userPreferencesCache = new Map();

/**
 * Sets a value in the cache.
 * @param {string | number} key - The key (e.g., telegramId).
 * @param {any} value - The value to cache.
 */
const set = (key, value) => {
    userPreferencesCache.set(key, value);
};

/**
 * Gets a value from the cache.
 * @param {string | number} key - The key (e.g., telegramId).
 * @returns {any | undefined} The cached value or undefined if not found.
 */
const get = (key) => {
    return userPreferencesCache.get(key);
};

/**
 * Deletes a value from the cache.
 * @param {string | number} key - The key to delete.
 */
const del = (key) => {
    userPreferencesCache.delete(key);
};

module.exports = {
    set,
    get,
    del,
};