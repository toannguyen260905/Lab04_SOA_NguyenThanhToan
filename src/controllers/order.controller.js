function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}

function validId(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function createOrderController(repo, remote) {
  function findOrder(id) {
    const order = repo.findOrder(id);
    if (!order) fail(404, 'Không tìm thấy đơn hàng.');
    return order;
  }

  function findItem(id) {
    const item = repo.findItem(id);
    if (!item) fail(404, 'Không tìm thấy chi tiết đơn hàng.');
    return item;
  }

  function requirePending(order) {
    if (order.status !== 'pending') fail(409, 'Chỉ được sửa đơn hàng đang pending.');
  }

  function detail(id) {
    return { ...findOrder(id), items: repo.orderItems(id) };
  }

  async function prepareItem(input, token, old) {
    if (!input || !validId(input.product_id) || !Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 2147483647) {
      fail(400, 'product_id phải là số nguyên dương, quantity từ 1 đến 2147483647.');
    }
    const product = await remote.product(input.product_id, token);
    if (product.quantity < input.quantity) fail(409, `Sản phẩm ${product.name} không đủ tồn kho.`);
    const price = old ? old.unit_price : product.price;
    const total = Math.round(price * 100) * input.quantity;
    if (total > 9999999999) fail(400, 'Thành tiền vượt giới hạn 99999999.99.');
    return {
      product_id: product.id,
      product_name: old ? old.product_name : product.name,
      quantity: input.quantity,
      unit_price: price,
      total_price: total / 100
    };
  }

  return {
    listOrders(req, res) {
      res.json(repo.listOrders());
    },
    getOrder(req, res) {
      res.json(detail(req.recordId));
    },
    async createOrder(req, res) {
      const body = req.body;
      if (!body || typeof body.customer_name !== 'string' || !body.customer_name.trim() || body.customer_name.trim().length > 255 || typeof body.customer_email !== 'string' || body.customer_email.trim().length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.customer_email.trim())) {
        fail(400, 'Tên khách hàng và email không hợp lệ.');
      }
      if (!Array.isArray(body.items) || body.items.length === 0) fail(400, 'Đơn hàng cần ít nhất một sản phẩm.');
      const items = [];
      const ids = new Set();
      for (const input of body.items) {
        const item = await prepareItem(input, req.get('Authorization'));
        if (ids.has(item.product_id)) fail(400, 'Sản phẩm bị trùng trong đơn hàng.');
        ids.add(item.product_id);
        items.push(item);
      }
      const id = repo.createOrder({ customer_name: body.customer_name.trim(), customer_email: body.customer_email.trim() }, items);
      res.location(`/orders/${id}`).status(201).json(detail(id));
    },
    updateOrder(req, res) {
      const order = findOrder(req.recordId);
      const status = req.body?.status;
      if (!['pending', 'completed', 'cancelled'].includes(status)) fail(400, 'Trạng thái phải là pending, completed hoặc cancelled.');
      if (status !== order.status) {
        requirePending(order);
        if (status === 'completed' && repo.orderItems(order.id).length === 0) fail(409, 'Không thể hoàn thành đơn hàng rỗng.');
        repo.updateStatus(order.id, status);
      }
      res.json(detail(order.id));
    },
    deleteOrder(req, res) {
      findOrder(req.recordId);
      repo.deleteOrder(req.recordId);
      res.status(204).end();
    },
    listItems(req, res) {
      res.json(repo.listItems());
    },
    getItem(req, res) {
      res.json(findItem(req.recordId));
    },
    async createItem(req, res) {
      const body = req.body;
      if (!body || !validId(body.order_id)) fail(400, 'order_id phải là số nguyên dương.');
      requirePending(findOrder(body.order_id));
      const item = await prepareItem(body, req.get('Authorization'));
      requirePending(findOrder(body.order_id));
      if (repo.orderItems(body.order_id).some(row => row.product_id === item.product_id)) fail(409, 'Sản phẩm đã có trong đơn hàng. Hãy cập nhật số lượng.');
      const id = repo.createItem(body.order_id, item);
      res.location(`/order_items/${id}`).status(201).json(findItem(id));
    },
    async updateItem(req, res) {
      const old = findItem(req.recordId);
      requirePending(findOrder(old.order_id));
      if (req.body?.product_id !== undefined && req.body.product_id !== old.product_id) fail(400, 'Không được đổi product_id.');
      if (req.body?.order_id !== undefined && req.body.order_id !== old.order_id) fail(400, 'Không được đổi order_id.');
      const item = await prepareItem({ product_id: old.product_id, quantity: req.body?.quantity }, req.get('Authorization'), old);
      const current = findItem(old.id);
      requirePending(findOrder(current.order_id));
      repo.updateItem(old.id, item);
      res.json(findItem(old.id));
    },
    deleteItem(req, res) {
      const item = findItem(req.recordId);
      requirePending(findOrder(item.order_id));
      repo.deleteItem(item.id);
      res.status(204).end();
    }
  };
}

module.exports = { createOrderController };
