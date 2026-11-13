const { Router } = require('express');

function createOrderRouter(controller, authenticate) {
  const router = Router();
  router.use(authenticate);
  router.param('id', (req, res, next, value) => {
    if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) {
      return res.status(400).json({ message: 'ID phải là số nguyên dương.' });
    }
    req.recordId = Number(value);
    next();
  });
  router.get('/orders', controller.listOrders);
  router.get('/orders/:id', controller.getOrder);
  router.post('/orders', controller.createOrder);
  router.put('/orders/:id', controller.updateOrder);
  router.delete('/orders/:id', controller.deleteOrder);
  router.get('/order_items', controller.listItems);
  router.get('/order_items/:id', controller.getItem);
  router.post('/order_items', controller.createItem);
  router.put('/order_items/:id', controller.updateItem);
  router.delete('/order_items/:id', controller.deleteItem);
  return router;
}

module.exports = { createOrderRouter };
