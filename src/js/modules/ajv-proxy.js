/**
 * @fileoverview This module exports an interface to Ajv that works in
 * restricted contexts. This assumes that a sandbox HTML page is made
 * available.
 * 
 * Where unrestricted, Ajv is run directly.
 * 
 * Because request/response is required for sandboxed pages, we also
 * restrict the interface in both cases to be Promise-based.
 */
const Ajv = require('ajv');

const logger = require('util/logger')('ajv-proxy');
const {Sandbox} = require('util/messaging');

// Whether we're on a page that disallows 'unsafe-eval'
function isRestricted() {
  try {
    let fn = new Function('return false');
    return fn();
  } catch(e) {
    return true;
  }
}

if (isRestricted()) {
  // NOTE: This file must be accessible.
  let sandbox = new Sandbox('html/ajv-sandbox.html');

  class Proxy {
    constructor() {
      this.ajv = null;
      this.ready = sandbox.postMessage({
        method: 'construct'
      }).then((id) => {
        this.ajv = id;
      });
    }

    addSchema(...args) {
      return sandbox.postMessage({
        method: 'call',
        args: [this.ajv, 'addSchema', ...args]
      });
    }

    validate(...args) {
      return sandbox.postMessage({
        method: 'call',
        args: [this.ajv, 'validate', ...args]
      });
    }

    errorsText() {
      return sandbox.postMessage({
        method: 'call',
        args: [this.ajv, 'errorsText']
      });
    }
  };
  /**
   * @returns {Promise<Proxy>}
   */
  module.exports = (...args) => {
    let proxy = new Proxy(...args);
    return proxy.ready.then(() => proxy);
  };
} else {
  // Pass-through to Ajv instance in current env context.
  class Proxy {
    constructor() {
      this.ajv = new Ajv();
    }

    addSchema(...args) {
      return Promise.resolve(this.ajv.addSchema(...args));
    }

    validate(...args) {
      return Promise.resolve(this.ajv.validate(...args));
    }

    errorsText() {
      return Promise.resolve(this.ajv.errorsText());
    }
  }
  /**
   * @returns {Promise<Proxy>}
   */
  module.exports = (...args) => {
    return Promise.resolve(new Proxy(...args));
  };
}
