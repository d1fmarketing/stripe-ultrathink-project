const handler_module = require('./getPaymentIntent_orig.js');
exports.handler = handler_module.handler || handler_module.default || handler_module;
