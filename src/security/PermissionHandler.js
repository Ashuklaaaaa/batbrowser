// ═══════════════════════════════════════════════════════════════
// BatBrowser — Permission Handler
// Handles OS-level permission requests (notifications, camera,
// geolocation, microphone) with user settings integration.
// ═══════════════════════════════════════════════════════════════

'use strict';

const Logger = require('../core/Logger');

const log = Logger.create('PermissionHandler');

// Permission type → settings key mapping
const PERMISSION_SETTINGS_MAP = {
  'notifications':  'enableNotifications',
  'geolocation':    'enableGeolocation',
  'media':          'enableCamera',      // covers camera + microphone
  'microphone':     'enableMicrophone',
  'camera':         'enableCamera',
  'midi':           null,                // always deny
  'midiSysex':      null,               // always deny
  'fullscreen':     'fullscreen',        // always allow
  'openExternal':   null,               // handled separately
};

/**
 * Sets up permission request handling on a session.
 *
 * @param {Electron.Session} ses           - The session to configure
 * @param {Function} getSettings           - Returns current settings object
 */
function setup(ses, getSettings) {
  // ── Permission Request Handler ─────────────────────────────────
  ses.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const settings = getSettings();

    log.debug(`Permission request: ${permission}`, { url: webContents.getURL() });

    // Fullscreen is always granted — it's a UI action
    if (permission === 'fullscreen') {
      callback(true);
      return;
    }

    // MIDI SysEx — always deny (security risk)
    if (permission === 'midiSysex' || permission === 'midi') {
      log.warn(`Denied ${permission} — always blocked`);
      callback(false);
      return;
    }

    // Look up the settings key for this permission
    const settingKey = PERMISSION_SETTINGS_MAP[permission];

    if (settingKey === null) {
      // No settings key → always deny
      log.warn(`Denied ${permission} — no settings mapping`);
      callback(false);
      return;
    }

    if (settingKey === undefined) {
      // Unknown permission type — deny by default (secure default)
      log.warn(`Unknown permission type: ${permission} — denying`);
      callback(false);
      return;
    }

    const granted = settings[settingKey] === true;
    log.info(`Permission ${permission}: ${granted ? 'granted' : 'denied'} (setting: ${settingKey}=${granted})`);
    callback(granted);
  });

  // ── Permission Check Handler ───────────────────────────────────
  ses.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
    const settings = getSettings();
    const settingKey = PERMISSION_SETTINGS_MAP[permission];

    if (permission === 'fullscreen') return true;
    if (!settingKey) return false;

    return settings[settingKey] === true;
  });

  log.info('Permission handler configured');
}

module.exports = { setup };
