const express = require('express');
const { createRemoteService } = require('./services/remote.service');
const { createAuthMiddleware } = require('./middleware/auth.middleware');
const { createOrderRepository } = require('./repositories/order.repository');
const { createOrderController } = require('./controllers/order.controller');
const { createOrderRouter } = require('./routes/order.routes');

function createApp(db, config) {
  const app = express();
  const remote = createRemoteService(config);
  const controller = createOrderController(createOrderRepository(db), remote);
  app.use(express.json({ limit: '64kb' }));
  app.use(createOrderRouter(controller, createAuthMiddleware(remote)));
  app.use((req, res) => res.status(404).json({ message: 'API không tồn tại.' }));
  app.use((error, req, res, next) => {
    const status = error.status || 500;
    if (status === 500) console.error(error);
    res.status(status).json({ message: status === 500 ? 'Lỗi máy chủ.' : error.message });
  });
  return app;
}

module.exports = { createApp };
