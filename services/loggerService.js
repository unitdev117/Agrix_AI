const serializeError = (error) => {
    if (!error) {
        return undefined;
    }

    return {
        name: error.name,
        message: error.message,
        stack: error.stack,
    };
};

const colors = {
    reset: "\x1b[0m",
    info: "\x1b[36m",  // Cyan
    success: "\x1b[32m", // Green
    warn: "\x1b[33m",  // Yellow
    error: "\x1b[31m", // Red
    dim: "\x1b[2m"     // Dim
};

const formatMeta = (meta) => {
    if (!meta || Object.keys(meta).length === 0) return '';
    const cleanMeta = { ...meta };
    delete cleanMeta.error; 
    if (Object.keys(cleanMeta).length === 0) return '';
    return ` ${colors.dim}${JSON.stringify(cleanMeta)}${colors.reset}`;
};

const writeLog = (level, message, meta = {}) => {
    const timestamp = new Date().toLocaleTimeString();
    
    let color = colors.info;
    let prefix = '[INFO]';
    
    if (level === 'error') {
        color = colors.error;
        prefix = '[ERROR]';
    } else if (level === 'warn') {
        color = colors.warn;
        prefix = '[WARN]';
    } else if (level === 'success') {
        color = colors.success;
        prefix = '[SUCCESS]';
    }

    const metaString = formatMeta(meta);
    const logLine = `${colors.dim}[${timestamp}]${colors.reset} ${color}${prefix}${colors.reset} ${message}${metaString}`;
    
    if (level === 'error') {
        console.error(logLine);
        if (meta.error) {
            console.error(`${colors.error}      └─ ${meta.error.message || meta.error.name}${colors.reset}`);
        }
    } else {
        console.log(logLine);
    }
};

const logger = {
    info(message, meta) {
        writeLog('info', message, meta);
    },
    success(message, meta) {
        writeLog('success', message, meta);
    },
    warn(message, meta) {
        writeLog('warn', message, meta);
    },
    error(message, meta = {}) {
        writeLog('error', message, {
            ...meta,
            error: serializeError(meta.error),
        });
    },
};

module.exports = logger;
