// ═══════════════════════════════════════════════════════════════
// BatBrowser — Structured Logger
// Provides consistent, leveled logging with context and timing.
// ═══════════════════════════════════════════════════════════════

'use strict';

/** ANSI color codes for terminal output */
const COLORS = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  red:     '\x1b[31m',
  yellow:  '\x1b[33m',
  green:   '\x1b[32m',
  blue:    '\x1b[34m',
  cyan:    '\x1b[36m',
  magenta: '\x1b[35m',
  gray:    '\x1b[90m',
};

const LEVEL_CONFIG = {
  error: { label: 'ERROR', color: COLORS.red,     emoji: '✖' },
  warn:  { label: 'WARN ', color: COLORS.yellow,  emoji: '⚠' },
  info:  { label: 'INFO ', color: COLORS.blue,    emoji: '●' },
  debug: { label: 'DEBUG', color: COLORS.gray,    emoji: '○' },
  perf:  { label: 'PERF ', color: COLORS.magenta, emoji: '⚡' },
};

const IS_DEV = process.env.NODE_ENV !== 'production';

/**
 * Formats a timestamp as HH:MM:SS.mmm
 */
function formatTime() {
  const now = new Date();
  const h  = now.getHours().toString().padStart(2, '0');
  const m  = now.getMinutes().toString().padStart(2, '0');
  const s  = now.getSeconds().toString().padStart(2, '0');
  const ms = now.getMilliseconds().toString().padStart(3, '0');
  return `${h}:${m}:${s}.${ms}`;
}

/**
 * Core log function. All public methods route through here.
 * @param {'error'|'warn'|'info'|'debug'|'perf'} level
 * @param {string} context  - Module or feature name, e.g. 'TabManager'
 * @param {string} message
 * @param {any}    [data]   - Optional structured data
 */
function log(level, context, message, data) {
  // In production suppress debug messages
  if (!IS_DEV && level === 'debug') return;

  const cfg    = LEVEL_CONFIG[level] || LEVEL_CONFIG.info;
  const time   = COLORS.gray + formatTime() + COLORS.reset;
  const lvl    = cfg.color + COLORS.bold + cfg.label + COLORS.reset;
  const ctx    = COLORS.cyan + `[${context}]` + COLORS.reset;
  const msg    = message;

  let output = `${time} ${lvl} ${ctx} ${msg}`;

  // eslint-disable-next-line no-console
  const consoleFn = level === 'error' ? console.error
    : level === 'warn'  ? console.warn
    : console.log;

  if (data !== undefined) {
    consoleFn(output, data);
  } else {
    consoleFn(output);
  }
}

/**
 * Creates a child logger bound to a specific context module.
 *
 * @param {string} context - Module name (e.g. 'TabManager')
 * @returns {Logger}
 *
 * @example
 * const log = Logger.create('TabManager');
 * log.info('Created tab', { tabId, url });
 * log.error('Failed to close tab', err);
 */
function create(context) {
  return {
    error: (message, data) => log('error', context, message, data),
    warn:  (message, data) => log('warn',  context, message, data),
    info:  (message, data) => log('info',  context, message, data),
    debug: (message, data) => log('debug', context, message, data),
    perf:  (message, data) => log('perf',  context, message, data),

    /**
     * Times a synchronous operation and logs it.
     * @param {string} label
     * @param {Function} fn
     * @returns {any} Return value of fn
     */
    time(label, fn) {
      const start = performance.now();
      try {
        const result = fn();
        const ms = (performance.now() - start).toFixed(2);
        log('perf', context, `${label} completed in ${ms}ms`);
        return result;
      } catch (err) {
        const ms = (performance.now() - start).toFixed(2);
        log('error', context, `${label} FAILED after ${ms}ms`, err);
        throw err;
      }
    },

    /**
     * Times an async operation and logs it.
     * @param {string} label
     * @param {Function} fn - Async function
     * @returns {Promise<any>}
     */
    async timeAsync(label, fn) {
      const start = performance.now();
      try {
        const result = await fn();
        const ms = (performance.now() - start).toFixed(2);
        log('perf', context, `${label} completed in ${ms}ms`);
        return result;
      } catch (err) {
        const ms = (performance.now() - start).toFixed(2);
        log('error', context, `${label} FAILED after ${ms}ms`, err);
        throw err;
      }
    },
  };
}

module.exports = { create, log };
