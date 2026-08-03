// ═══════════════════════════════════════════════════════════════
// BatBrowser — Optimized Ad Blocker
// High-performance ad/tracker blocking using Set-based O(1)
// domain lookup and pre-compiled regex pattern matching.
// ═══════════════════════════════════════════════════════════════

'use strict';

const Logger = require('../core/Logger');
const { ADBLOCK } = require('../core/Constants');

const log = Logger.create('AdBlocker');

// ─── Ad Domains (EasyList-based) ─────────────────────────────────

const AD_DOMAINS = new Set([
  // Major ad networks
  'doubleclick.net', 'googlesyndication.com', 'googleadservices.com',
  'google-analytics.com', 'googletagmanager.com', 'googletagservices.com',
  'adservice.google.com', 'pagead2.googlesyndication.com',
  'adnxs.com', 'adsrvr.org', 'adform.net', 'adcolony.com', 'admob.com',
  'advertising.com', 'adtech.de', 'adtechus.com', 'addthis.com',
  'adroll.com', 'adzerk.net', 'amazon-adsystem.com', 'adobedtm.com',
  // Sponsored content / native ads
  'taboola.com', 'outbrain.com', 'revcontent.com', 'mgid.com',
  'zergnet.com', 'content.ad', 'narrativ.com',
  // Popup/overlay ad networks
  'popads.net', 'popcash.net', 'propellerads.com', 'juicyads.com',
  'exoclick.com', 'trafficjunky.com', 'clickadu.com',
  // Video ad networks
  'imasdk.googleapis.com', 'vid.springserve.com', 'ads.yahoo.com',
  'yieldmanager.com',
  // Mobile ad networks
  'applovin.com', 'inmobi.com', 'startapp.com', 'chartboost.com',
  'ironsrc.com', 'vungle.com',
  // Misc ad domains
  'zedo.com', 'undertone.com', 'tribalfusion.com', 'atdmt.com',
  'atwola.com', 'bluestreak.com', 'casalemedia.com', 'contextweb.com',
  'fastclick.net', 'flashtalking.com', 'mediaplex.com', 'overture.com',
  'pointroll.com', 'revsci.net', 'smartadserver.com', 'yieldmo.com',
  'rubiconproject.com', 'openx.net', 'pubmatic.com', 'bidswitch.net',
  'moatads.com', 'serving-sys.com', 'bluekai.com', 'exelator.com',
  'eyeota.net', 'krxd.net', 'mathtag.com', 'rlcdn.com',
  'quantserve.com', 'simpli.fi', 'betrad.com', 'mookie1.com',
  'scorecardresearch.com',
]);

// ─── Tracker Domains ─────────────────────────────────────────────

const TRACKER_DOMAINS = new Set([
  // Google tracking
  'google-analytics.com', 'analytics.google.com', 'googletagmanager.com',
  'googletagservices.com', 'googlesyndication.com',
  // Facebook/Meta tracking
  'connect.facebook.net', 'pixel.facebook.com',
  // Session recording / heatmaps
  'hotjar.com', 'static.hotjar.com', 'script.hotjar.com', 'vars.hotjar.com',
  'mouseflow.com', 'cdn.mouseflow.com', 'luckyorange.com', 'cdn.luckyorange.com',
  'inspectlet.com', 'cdn.inspectlet.com', 'crazyegg.com', 'script.crazyegg.com',
  'fullstory.com', 'rs.fullstory.com',
  // Analytics platforms
  'mixpanel.com', 'cdn.mxpnl.com', 'api.mixpanel.com',
  'segment.com', 'cdn.segment.com', 'api.segment.io',
  'amplitude.com', 'cdn.amplitude.com', 'api.amplitude.com',
  'heapanalytics.com', 'cdn.heapanalytics.com',
  // A/B Testing
  'optimizely.com', 'cdn.optimizely.com', 'logx.optimizely.com',
  // Marketing
  'hubspot.com', 'js.hs-scripts.com', 'js.hs-analytics.net',
  'marketo.net', 'mktoresp.com', 'pardot.com',
  // Error tracking
  'newrelic.com', 'nr-data.net', 'bam.nr-data.net',
  'sentry.io', 'browser.sentry-cdn.com', 'bugsnag.com', 'cdn.bugsnag.com',
  // Social tracking pixels
  'clarity.ms', 'bat.bing.com', 'px.ads.linkedin.com', 'snap.licdn.com',
  'analytics.twitter.com', 'ads-api.twitter.com', 'static.ads-twitter.com',
  'analytics.tiktok.com', 'ct.pinterest.com', 'log.pinterest.com',
  // Attribution / measurement
  'appsflyer.com', 'adjust.com', 'app.adjust.com', 'kochava.com',
  'demdex.net', 'omtrdc.net', '2o7.net', 'everesttech.net',
  // Audience measurement
  'chartbeat.com', 'static.chartbeat.com', 'parsely.com', 'cdn.parsely.com',
  'comscore.com', 'sb.scorecardresearch.com', 'imrworldwide.com',
  'quantcast.com', 'pixel.quantserve.com',
  // Identity / fingerprinting
  'liveramp.com', 'liadm.com', 'crwdcntrl.net', 'agkn.com',
  'bidr.io', 'doubleverify.com', 'adsymptotic.com',
  // Retargeting
  'adroll.com', 'bounce.exchange', 'bounceexchange.com',
  'dotomi.com', 'myvisualiq.net',
  // Push notifications
  'onesignal.com',
  // Tag management
  'tags.tiqcdn.com',
  // Branch / deep linking
  'cdn.branch.io',
  // Affiliate
  'sharethis.com', 'sharethrough.com',
  // Misc
  'tidio.co', 'tinypass.com', 'rfihub.com',
]);

// ─── Blocked URL Patterns ─────────────────────────────────────────

/**
 * Patterns matched against the full URL path.
 * Each entry is a literal string searched case-insensitively.
 * Compiled into a single RegExp at startup for performance.
 */
const RAW_PATTERNS = [
  // Analytics scripts
  '/analytics.js', '/ga.js', '/gtag/js', '/gtm.js',
  '/collect?', '/r/collect',
  // Facebook pixel
  '/fbevents.js', '/signals/',
  // Common ad script paths
  '/pagead/', '/adsbygoogle.js', '/show_ads.js',
  '/adserver/', '/adx/',
  // Tracking pixels / beacons
  '/pixel.', '/tracking.', '/beacon.',
  '/ping?', '/event?',
  // Fingerprinting
  '/fingerprint', '/fp.js', '/canvas-fingerprint',
];

// Pre-compile into a single regex — much faster than looping per request
const PATTERN_REGEX = new RegExp(
  RAW_PATTERNS.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
  'i'
);

// ─── Domain Matching ──────────────────────────────────────────────

/**
 * Hostname → blocked type cache.
 * Prevents re-parsing URLs we've already classified.
 * @type {Map<string, 'ad'|'tracker'|null>}
 */
const DOMAIN_CACHE = new Map();
const MAX_CACHE_SIZE = 10_000;

/**
 * Checks if a hostname (or any parent domain) is in the given Set.
 * Uses a cache for repeated lookups.
 *
 * O(1) for cache hits, O(labels) for first lookup.
 *
 * @param {string} hostname
 * @param {Set<string>} domainSet
 * @returns {boolean}
 */
function hostnameInSet(hostname, domainSet) {
  if (domainSet.has(hostname)) return true;

  // Walk parent domains: a.b.c.com → b.c.com → c.com
  const labels = hostname.split('.');
  for (let i = 1; i < labels.length - 1; i++) {
    const parent = labels.slice(i).join('.');
    if (domainSet.has(parent)) return true;
  }
  return false;
}

// ─── Main Classification ──────────────────────────────────────────

/**
 * Determines whether a network request should be blocked.
 *
 * @param {string} url           - Request URL
 * @returns {{ blocked: boolean, type: 'ad'|'tracker'|null }}
 */
function shouldBlock(url) {
  if (!url) return { blocked: false, type: null };

  // Fast-path: skip internal / data URLs
  if (url.startsWith('data:') || url.startsWith('chrome:') ||
      url.startsWith('devtools:') || url.startsWith('file:') ||
      url.startsWith('blob:')) {
    return { blocked: false, type: null };
  }

  // Parse hostname
  let hostname;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return { blocked: false, type: null };
  }

  // Cache lookup
  if (DOMAIN_CACHE.has(hostname)) {
    const cached = DOMAIN_CACHE.get(hostname);
    if (cached === null) {
      // Not blocked by domain — still check patterns
    } else {
      return { blocked: true, type: cached };
    }
  }

  // Tracker domains (checked first — more specific)
  if (hostnameInSet(hostname, TRACKER_DOMAINS)) {
    if (DOMAIN_CACHE.size < MAX_CACHE_SIZE) DOMAIN_CACHE.set(hostname, 'tracker');
    return { blocked: true, type: 'tracker' };
  }

  // Ad domains
  if (hostnameInSet(hostname, AD_DOMAINS)) {
    if (DOMAIN_CACHE.size < MAX_CACHE_SIZE) DOMAIN_CACHE.set(hostname, 'ad');
    return { blocked: true, type: 'ad' };
  }

  // Mark as not blocked by domain
  if (DOMAIN_CACHE.size < MAX_CACHE_SIZE) DOMAIN_CACHE.set(hostname, null);

  // URL pattern matching (catches inline tracking)
  if (PATTERN_REGEX.test(url)) {
    const isTracker = /analytics|pixel|tracking|beacon|collect|fingerprint|fbevents|gtag|gtm\.js/.test(url);
    return { blocked: true, type: isTracker ? 'tracker' : 'ad' };
  }

  return { blocked: false, type: null };
}

// ─── AdBlocker Class ─────────────────────────────────────────────

/**
 * AdBlocker — manages request interception and statistics.
 */
class AdBlocker {
  constructor() {
    this._stats = { ads: 0, trackers: 0 };
    this._enabled = true;
    this._notifyTimeout = null;

    /** @type {Electron.BrowserWindow|null} */
    this._window = null;

    log.info('AdBlocker initialized');
  }

  /**
   * Attaches to a window for stat notifications.
   * @param {Electron.BrowserWindow} win
   */
  attachWindow(win) {
    this._window = win;
  }

  /**
   * Sets whether blocking is active.
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    this._enabled = enabled;
    log.info(`AdBlocker ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Installs the webRequest interceptor on a session.
   * @param {Electron.Session} ses
   */
  setup(ses) {
    ses.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
      if (!this._enabled) {
        callback({ cancel: false });
        return;
      }

      const result = shouldBlock(details.url);

      if (result.blocked) {
        if (result.type === 'ad')      this._stats.ads++;
        if (result.type === 'tracker') this._stats.trackers++;
        this._scheduleStatsNotify();
        callback({ cancel: true });
      } else {
        callback({ cancel: false });
      }
    });

    log.info('Ad blocking interceptor installed on session');
  }

  /**
   * Returns the current session stats.
   * @returns {{ ads: number, trackers: number }}
   */
  getStats() {
    return { ...this._stats };
  }

  /**
   * Schedules a throttled IPC stats notification to the renderer.
   * @private
   */
  _scheduleStatsNotify() {
    if (this._notifyTimeout) return;
    this._notifyTimeout = setTimeout(() => {
      this._notifyTimeout = null;
      if (this._window && !this._window.isDestroyed()) {
        this._window.webContents.send('adblock:stats-updated', { ...this._stats });
      }
    }, ADBLOCK.STATS_NOTIFY_THROTTLE_MS);
  }

  /**
   * Resets session stats (e.g. when settings are cleared).
   */
  resetStats() {
    this._stats = { ads: 0, trackers: 0 };
  }
}

// Singleton
let _instance = null;

function getInstance() {
  if (!_instance) _instance = new AdBlocker();
  return _instance;
}

module.exports = { AdBlocker, getInstance, shouldBlock };
