const handler_module = require('./getCase_orig.js');
exports.handler = handler_module.handler || handler_module.default || handler_module;
