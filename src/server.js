const { getConfig } = require('./config');
const { openDatabase } = require('./db');
const { createApp } = require('./app');

const config = getConfig();
const db = openDatabase(config.dbPath);
const server = createApp(db, config).listen(config.port, '127.0.0.1', () => {
  console.log(`Order service: http://localhost:${config.port}`);
});
server.on('error', error => {
  console.error(error.message);
  db.close();
  process.exitCode = 1;
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => server.close(() => db.close()));
}
