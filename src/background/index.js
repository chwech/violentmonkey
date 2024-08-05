import '@/common/browser';
import { getActiveTab, makePause } from '@/common';
import { deepCopy, objectPick } from '@/common/object';
import { handleHotkeyOrMenu } from './utils/icon';
import { addPublicCommands, commands, init } from './utils';
import './sync';
import './utils/clipboard';
import './utils/notifications';
import './utils/preinject';
import './utils/script';
import './utils/storage-fetch';
import './utils/tab-redirector';
import './utils/tester';
import './utils/update';
import {
  kDownloadURL, kExclude, kExcludeMatch, kHomepageURL, kIcon, kInclude, kMatch, kName, kOrigExclude, kOrigExcludeMatch,
  kOrigInclude, kOrigMatch, kUpdateURL,
} from '@/options/utils';
import { parseScript } from './utils/db';

addPublicCommands({
  /**
   * Timers in content scripts are shared with the web page so it can clear them.
   * await sendCmd('SetTimeout', 100) in injected/content
   * bridge.call('SetTimeout', 100, cb) in injected/web
   */
  SetTimeout(ms) {
    return ms > 0 && makePause(ms);
  },
});

function handleCommandMessage({ cmd, data, url, [kTop]: mode } = {}, src) {
  if (init) {
    return init.then(handleCommandMessage.bind(this, ...arguments));
  }
  const func = hasOwnProperty(commands, cmd) && commands[cmd];
  if (!func) return; // not responding to commands for popup/options
  // The `src` is omitted when invoked via sendCmdDirectly unless fakeSrc is set.
  // The `origin` is Chrome-only, it can't be spoofed by a compromised tab unlike `url`.
  if (src) {
    let me = src.origin;
    if (url) src.url = url; // MessageSender.url doesn't change on soft navigation
    me = me ? me === extensionOrigin : `${url || src.url}`.startsWith(extensionRoot);
    if (!me && func.isOwn && !src.fake) {
      throw new SafeError(`Command is only allowed in extension context: ${cmd}`);
    }
    // TODO: revisit when link-preview is shipped in Chrome to fix tabId-dependent functionality
    if (!src.tab) {
      if (!me && (IS_FIREFOX ? !func.isOwn : !mode)) {
        if (process.env.DEBUG) console.log('No src.tab, ignoring:', ...arguments);
        return;
      }
      src.tab = false; // allowing access to props
    }
    if (mode) src[kTop] = mode;
  }
  return handleCommandMessageAsync(func, data, src);
}

async function handleCommandMessageAsync(func, data, src) {
  try {
    // `await` is necessary to catch the error here
    return await func(data, src);
  } catch (err) {
    if (process.env.DEBUG) console.error(err);
    // Adding `stack` info + in FF a rejected Promise value is transferred only for an Error object
    throw err instanceof SafeError ? err
      : new SafeError(isObject(err) ? JSON.stringify(err) : err);
  }
}

global.handleCommandMessage = handleCommandMessage;
global.deepCopy = deepCopy;
browser.runtime.onMessage.addListener(handleCommandMessage);
browser.commands?.onCommand.addListener(async cmd => {
  handleHotkeyOrMenu(cmd, await getActiveTab());
});



/** 
 * 安装一个自己的脚本 
 */
const CUSTOM_PROPS = {
  [kName]: '',
  [kHomepageURL]: '',
  [kUpdateURL]: '',
  [kDownloadURL]: '',
  [kIcon]: '',
  [kOrigInclude]: true,
  [kOrigExclude]: true,
  [kOrigMatch]: true,
  [kOrigExcludeMatch]: true,
  tags: '',
};
const toProp = val => val !== '' ? val : null; // `null` removes the prop from script object
const CUSTOM_LISTS = [
  kInclude,
  kMatch,
  kExclude,
  kExcludeMatch,
];
const CUSTOM_ENUM = [
  INJECT_INTO,
  RUN_AT,
];
const toEnum = val => val || null; // `null` removes the prop from script object
const toList = text => (
  text.trim()
    ? text.split('\n').map(line => line.trim()).filter(Boolean)
    : null // `null` removes the prop from script object
);

let id = 1000;

async function installMyScript() {
  const code = `// ==UserScript==
// @name        百应工具
// @namespace   Violentmonkey Scripts
// @match       https://buyin.jinritemai.com/dashboard/*
// @version     1.16
// @author      -
// @description 2024/7/15 09:00:20
// @downloadURL https://unpkg.com/coupon-script-buyin@latest/dist/bundle.js
// @require     https://unpkg.com/vue@3/dist/vue.global.js
// @resource    ELEMENT_CSS https://unpkg.com/element-plus/dist/index.css
// @grant       unsafeWindow
// @grant       GM_registerMenuCommand
// @grant       GM_unregisterMenuCommand
// @grant       GM_cookie
// @grant       GM_getResourceText
// @grant       GM_addStyle
// @grant       GM_setValue
// @grant       GM_getValue
// @grant       GM_xmlhttpRequest
// @grant       GM.xmlHttpRequest
// @grant       GM.setValue
// @grant       GM.getValue
// @require     https://unpkg.com/coupon-script-buyin@latest/dist/index.js
// ==/UserScript==
  `;
const custom = {
  "origInclude": true,
  "origExclude": true,
  "origMatch": true,
  "origExcludeMatch": true
};
for (const key in CUSTOM_PROPS) {
  if (custom[key] == null) custom[key] = CUSTOM_PROPS[key];
}
for (const key of CUSTOM_ENUM) {
  if (!custom[key]) custom[key] = '';
}
for (const key of CUSTOM_LISTS) {
  const val = custom[key];
  // Adding a new row so the user can click it and type, just like in an empty textarea.
  custom[key] = val ? `${val.join('\n')}${val.length ? '\n' : ''}` : '';
}
const noframes = '';
  const res = await parseScript({
    id,
    code,
    config: {
      enabled: 1,
      notifyUpdates: null, // 0, 1, null
      shouldUpdate: 1, // 0, 1, 2
    },
    custom: {
      ...objectPick(custom, Object.keys(CUSTOM_PROPS), toProp),
      ...objectPick(custom, CUSTOM_LISTS, toList),
      ...objectPick(custom, CUSTOM_ENUM, toEnum),
      noframes: noframes ? +noframes : null,
    },
    // User created scripts MUST be marked `isNew` so that
    // the backend is able to check namespace conflicts,
    // otherwise the script with same namespace will be overridden
    isNew: false,
    message: '',
    bumpDate: true,
  });

  console.log('安装一个自己的插件', res);
  id = res.where.id;
}

addPublicCommands({
  installMyScript
});