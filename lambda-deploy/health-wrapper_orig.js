// Bridges Lambda's CJS loader to your ESM health module
exports.handler = async (event, context) => {
  try {
    // Dynamic import to load the built health module (same directory now)
    const mod = await import('./health.js');
    
    // Verify the handler exists
    if (!mod || typeof mod.handler !== 'function') {
      console.error('health.handler not found in module:', Object.keys(mod || {}));
      return { 
        statusCode: 500, 
        body: JSON.stringify({ 
          ok: false, 
          error: 'health.handler not found',
          moduleKeys: Object.keys(mod || {})
        }) 
      };
    }
    
    // Don't wait for open Redis sockets, etc.
    if (context && typeof context === 'object') {
      context.callbackWaitsForEmptyEventLoop = false;
    }
    
    // Call the actual handler
    return await mod.handler(event, context);
  } catch (error) {
    console.error('Health wrapper error:', error);
    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        degraded: true,
        error: String(error.message || error),
        timestamp: new Date().toISOString()
      })
    };
  }
};