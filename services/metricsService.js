const metrics = {
    activeWidgetSockets: 0,
    activeAgentSockets: 0,
    queueLength: 0,
    aiCallsTotal: 0,
    aiErrorsTotal: 0,
    socketErrorsTotal: 0,
    aiLatencyMsTotal: 0,
    aiLatencySamples: 0,
};

const increment = (key, value = 1) => {
    metrics[key] = (metrics[key] || 0) + value;
};

const decrement = (key, value = 1) => {
    metrics[key] = Math.max(0, (metrics[key] || 0) - value);
};

const setGauge = (key, value) => {
    metrics[key] = value;
};

const recordAiLatency = (latencyMs) => {
    increment('aiCallsTotal', 1);
    increment('aiLatencyMsTotal', latencyMs);
    increment('aiLatencySamples', 1);
};

const recordAiError = () => {
    increment('aiErrorsTotal', 1);
};

const recordSocketError = () => {
    increment('socketErrorsTotal', 1);
};

const getSnapshot = () => {
    const averageAiLatencyMs = metrics.aiLatencySamples
        ? Math.round(metrics.aiLatencyMsTotal / metrics.aiLatencySamples)
        : 0;

    const aiErrorRate = metrics.aiCallsTotal
        ? Number((metrics.aiErrorsTotal / metrics.aiCallsTotal).toFixed(4))
        : 0;

    return {
        ...metrics,
        averageAiLatencyMs,
        aiErrorRate,
    };
};

module.exports = {
    increment,
    decrement,
    setGauge,
    recordAiLatency,
    recordAiError,
    recordSocketError,
    getSnapshot,
};
