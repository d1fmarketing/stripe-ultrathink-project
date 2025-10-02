const impl = require('./*_impl.js');
exports.handler = impl.handler || impl.default || impl;
