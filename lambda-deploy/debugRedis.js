const handler_module = require('./debugRedis_orig.js');
exports.handler = handler_module.handler || handler_module.default || handler_module;
