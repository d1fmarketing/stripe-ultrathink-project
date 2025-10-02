const handler_module = require('./autoRefreshTokens_orig.js');
exports.handler = handler_module.handler || handler_module.default || handler_module;
