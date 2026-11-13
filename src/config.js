const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });

function getConfig() {
  const port = Number(process.env.PORT || 3003);
  const timeout = Number(process.env.SERVICE_TIMEOUT_MS || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT không hợp lệ.');
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 60000) throw new Error('SERVICE_TIMEOUT_MS không hợp lệ.');
  return {
    port,
    timeout,
    dbPath: path.resolve(__dirname, '..', process.env.DB_PATH || 'data/lab4.sqlite'),
    authUrl: (process.env.AUTH_SERVICE_URL || 'http://127.0.0.1:3001').replace(/\/$/, ''),
    productUrl: (process.env.PRODUCT_SERVICE_URL || 'http://127.0.0.1:3002').replace(/\/$/, '')
  };
}

module.exports = { getConfig };
