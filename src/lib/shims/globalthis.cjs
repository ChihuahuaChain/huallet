function getGlobal() {
  return globalThis;
}
module.exports = getGlobal;
module.exports.getPolyfill = getGlobal;
module.exports.implementation = globalThis;
module.exports.shim = getGlobal;
