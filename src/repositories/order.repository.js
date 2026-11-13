function createOrderRepository(db) {
  function transaction(action) {
    db.exec('BEGIN');
    try {
      const result = action();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  function updateTotal(orderId) {
    const row = db.prepare('SELECT COALESCE(SUM(ROUND(total_price * 100)), 0) AS cents FROM order_items WHERE order_id = ?').get(orderId);
    if (row.cents > 9999999999) throw Object.assign(new Error('Tổng tiền vượt giới hạn 99999999.99.'), { status: 400 });
    db.prepare('UPDATE orders SET total_amount = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(row.cents / 100, orderId);
  }

  function insertItem(orderId, item) {
    return db.prepare('INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, total_price) VALUES (?, ?, ?, ?, ?, ?)')
      .run(orderId, item.product_id, item.product_name, item.quantity, item.unit_price, item.total_price);
  }

  return {
    listOrders: () => db.prepare('SELECT * FROM orders ORDER BY id DESC').all(),
    findOrder: (id) => db.prepare('SELECT * FROM orders WHERE id = ?').get(id),
    listItems: () => db.prepare('SELECT * FROM order_items ORDER BY id DESC').all(),
    findItem: (id) => db.prepare('SELECT * FROM order_items WHERE id = ?').get(id),
    orderItems: (id) => db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id').all(id),
    createOrder(customer, items) {
      return transaction(() => {
        const result = db.prepare('INSERT INTO orders (customer_name, customer_email) VALUES (?, ?)').run(customer.customer_name, customer.customer_email);
        const id = Number(result.lastInsertRowid);
        for (const item of items) insertItem(id, item);
        updateTotal(id);
        return id;
      });
    },
    updateStatus(id, status) {
      db.prepare('UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, id);
    },
    deleteOrder(id) {
      db.prepare('DELETE FROM orders WHERE id = ?').run(id);
    },
    createItem(orderId, item) {
      return transaction(() => {
        const result = insertItem(orderId, item);
        updateTotal(orderId);
        return Number(result.lastInsertRowid);
      });
    },
    updateItem(id, item) {
      return transaction(() => {
        const old = this.findItem(id);
        db.prepare('UPDATE order_items SET quantity = ?, total_price = ? WHERE id = ?').run(item.quantity, item.total_price, id);
        updateTotal(old.order_id);
      });
    },
    deleteItem(id) {
      return transaction(() => {
        const item = this.findItem(id);
        db.prepare('DELETE FROM order_items WHERE id = ?').run(id);
        updateTotal(item.order_id);
      });
    }
  };
}

module.exports = { createOrderRepository };
