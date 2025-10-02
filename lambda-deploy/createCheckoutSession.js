const handler_module = require('./createCheckoutSession_orig.js');
exports.handler = handler_module.handler || handler_module.default || handler_module;
