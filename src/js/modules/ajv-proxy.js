const Ajv = require('ajv');

const logger = require('./logger')('ajv-proxy');
const {Sandbox} = require('./messaging');
/**
 * This module provides an interface to Ajv that works in restricted
 * contexts, assuming a sandbox page has been made available.
 * 
 * Where unrestricted, Ajv is run directly.
 * 
 * Because request/response is required for sandboxed pages, we
 * also restrict the normal interface to be promise-based.
 */

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
  let sandbox = new Sandbox('html/ajv-sandbox.html');

  // Ajv interface to sandboxed page.
  class Proxy {
    constructor() {
      this.ajv = null;
      this.ready = sandbox.postMessage({
        method: 'construct'
      }).then((id) => {
        this.ajv = id;
      });
    }

    // Pass-through.
    addSchema(...args) {
      return sandbox.postMessage({
        method: 'call',
        args: [this.ajv, 'addSchema', ...args]
      });
    }

    // Pass-through.
    validate(...args) {
      return sandbox.postMessage({
        method: 'call',
        args: [this.ajv, 'validate', ...args]
      });
    }

    // Pass-through.
    errorsText() {
      return sandbox.postMessage({
        method: 'call',
        args: [this.ajv, 'errorsText']
      });
    }
  };
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
  module.exports = (...args) => {
    return Promise.resolve(new Proxy(...args));
  };
}
