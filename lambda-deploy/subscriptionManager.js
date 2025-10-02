const handler_module = require('./subscriptionManager_orig.js');
exports.handler = handler_module.handler || handler_module.default || handler_module;
