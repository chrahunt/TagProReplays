// Script to be loaded into sandboxed page.
const Ajv = require('ajv');

const logger = require('util/logger')('ajv-sandboxed');
const {registerSandbox} = require('util/messaging');

class ClassManager {
  constructor(klass) {
    this.klass = klass;
    this.instances = new Map();
    this.instance_ids = 0;
  }

  construct(...args) {
    let ref = this.instance_ids++;
    this.instances.set(ref, new this.klass(...args));
    return ref;
  }

  destruct(ref) {
    this.instances.delete(ref);
  }

  call_method(id, method, ...args) {
    logger.debug(`Calling ${this.klass.name}(${id})#${method}`);
    return this.instances.get(id)[method](...args);
  }

  get_property(id, property) {
    logger.debug(`Getting ${this.klass.name}(${id}).${property}`);
    return this.instances.get(id)[property];
  }
}

let manager = new ClassManager(Ajv);

// Set up handlers for controlling Ajv instances.
registerSandbox((message) => {
  let {method, args} = message;
  logger.debug(`Received message: ${method}`);
  if (method == 'construct') {
    // constructor arguments
    return manager.construct(...args);
  } else if (method == 'destruct') {
    // id
    return manager.destruct(...args);
  } else if (method == 'call') {
    // id, method, args
    return manager.call_method(...args);
  } else if (method == 'get') {
    // id, property
    return manager.get_property(...args);
  } else {
    logger.warn(`Method not recognized: ${method}`);
  }
});