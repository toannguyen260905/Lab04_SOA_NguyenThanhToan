const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const bcrypt = require('../../Lab-2/node_modules/bcryptjs');
const { openDatabase } = require('../src/db');
const { createApp } = require('../src/app');
const { openDatabase: openAuth } = require('../../Lab-2/src/db');
const { createApp: authApp } = require('../../Lab-2/src/app');
const { createUserRepository } = require('../../Lab-2/src/repositories/user.repository');
const { openDatabase: openProducts } = require('../../Lab-3/src/db');
const { createApp: productApp } = require('../../Lab-3/src/app');

test('Order service kết nối Lab 2 và Lab 3', async t => {
  const databases = [];
  const servers = [];
  t.after(async () => {
    for (const server of servers.reverse()) {
      if (server.listening) await new Promise(resolve => server.close(resolve));
    }
    for (const db of databases) db.close();
  });
  async function start(app) {
    const server = app.listen(0, '127.0.0.1');
    servers.push(server);
    await once(server, 'listening');
    return `http://127.0.0.1:${server.address().port}`;
  }
  const authDb = openAuth(':memory:');
  const productDb = openProducts(':memory:');
  const db = openDatabase(':memory:');
  databases.push(authDb, productDb, db);
  createUserRepository(authDb).create('student', await bcrypt.hash('Student@123', 4));
  const authUrl = await start(authApp(authDb, { secret: 'test-secret-for-lab4-at-least-thirty-two-bytes', expiresIn: '1h' }));
  const productUrl = await start(productApp(productDb, { authServiceUrl: authUrl, authTimeoutMs: 1000 }));
  const base = await start(createApp(db, { authUrl, productUrl, timeout: 1000 }));
  let token;
  async function request(url, method = 'GET', body, authorization = token) {
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(authorization ? { Authorization: `Bearer ${authorization}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return { status: response.status, data: response.status === 204 ? null : await response.json() };
  }
  const login = await request(authUrl, 'POST', { userName: 'student', password: Buffer.from('Student@123').toString('base64') });
  assert.equal(login.status, 200);
  token = login.data.token;
  const product = (await request(productUrl + '/products', 'POST', { name: 'Bàn phím', price: 120000.25, quantity: 10 })).data;
  const second = (await request(productUrl + '/products', 'POST', { name: 'Chuột', price: 50000, quantity: 5 })).data;
  const body = items => ({ customer_name: 'Nguyễn Văn A', customer_email: 'a@example.com', items });
  let order;
  let item;

  await t.test('Xác thực và kiểm tra tồn kho', async () => {
    assert.equal((await request(base + '/orders', 'GET', undefined, '')).status, 401);
    assert.equal((await request(base + '/orders', 'GET', undefined, 'wrong')).status, 401);
    assert.equal((await request(base + '/orders', 'POST', {})).status, 400);
    assert.equal((await request(base + '/orders', 'POST', body([]))).status, 400);
    assert.equal((await request(base + '/orders', 'POST', body([{ product_id: 999, quantity: 1 }]))).status, 404);
    assert.equal((await request(base + '/orders', 'POST', body([{ product_id: product.id, quantity: 11 }]))).status, 409);
    assert.equal((await request(base + '/orders', 'POST', body([{ product_id: product.id, quantity: 1 }, { product_id: product.id, quantity: 2 }]))).status, 400);
    assert.equal((await request(base + '/orders')).data.length, 0);
  });
  await t.test('Tạo và xem đơn, lấy giá từ Lab 3', async () => {
    const result = await request(base + '/orders', 'POST', body([{ product_id: product.id, quantity: 2, unit_price: 1 }]));
    assert.equal(result.status, 201);
    order = result.data;
    item = order.items[0];
    assert.equal(order.total_amount, 240000.5);
    assert.equal(item.unit_price, 120000.25);
    assert.equal(order.status, 'pending');
    assert.equal((await request(base + '/orders')).data.length, 1);
    assert.equal((await request(base + '/orders/' + order.id)).data.items.length, 1);
    assert.equal((await request(base + '/order_items')).data.length, 1);
    assert.equal((await request(base + '/order_items/' + item.id)).data.product_name, 'Bàn phím');
  });
  await t.test('CRUD chi tiết và tính lại tổng tiền', async () => {
    await request(productUrl + '/products/' + product.id, 'PUT', { name: 'Bàn phím mới', price: 150000, quantity: 10 });
    assert.equal((await request(base + '/order_items/' + item.id, 'PUT', { quantity: 3 })).data.total_price, 360000.75);
    assert.equal((await request(base + '/order_items/' + item.id, 'PUT', { quantity: 11 })).status, 409);
    assert.equal((await request(base + '/order_items', 'POST', { order_id: order.id, product_id: product.id, quantity: 1 })).status, 409);
    const added = await request(base + '/order_items', 'POST', { order_id: order.id, product_id: second.id, quantity: 2 });
    assert.equal(added.status, 201);
    assert.equal((await request(base + '/orders/' + order.id)).data.total_amount, 460000.75);
    assert.equal((await request(base + '/order_items/' + added.data.id, 'DELETE')).status, 204);
    assert.equal((await request(base + '/orders/' + order.id)).data.total_amount, 360000.75);
    assert.equal((await request(base + '/order_items/' + added.data.id)).status, 404);
  });
  await t.test('Rollback khi tổng tiền vượt giới hạn', async () => {
    const expensive = (await request(productUrl + '/products', 'POST', { name: 'Máy', price: 99999999, quantity: 10 })).data;
    assert.equal((await request(base + '/order_items', 'POST', { order_id: order.id, product_id: expensive.id, quantity: 1 })).status, 400);
    assert.equal((await request(base + '/orders/' + order.id)).data.items.length, 1);
    assert.equal((await request(base + '/orders', 'POST', body([{ product_id: expensive.id, quantity: 1 }, { product_id: second.id, quantity: 1 }]))).status, 400);
    assert.equal((await request(base + '/orders')).data.length, 1);
  });
  await t.test('Trạng thái và xóa đơn cùng chi tiết', async () => {
    assert.equal((await request(base + '/orders/' + order.id, 'PUT', { status: 'wrong' })).status, 400);
    assert.equal((await request(base + '/orders/' + order.id, 'PUT', { status: 'completed' })).data.status, 'completed');
    assert.equal((await request(base + '/order_items/' + item.id, 'PUT', { quantity: 1 })).status, 409);
    assert.equal((await request(base + '/order_items/' + item.id, 'DELETE')).status, 409);
    assert.equal((await request(base + '/orders/' + order.id, 'PUT', { status: 'pending' })).status, 409);
    assert.equal((await request(base + '/orders/' + order.id, 'DELETE')).status, 204);
    assert.equal((await request(base + '/order_items')).data.length, 0);
    assert.equal((await request(base + '/orders/' + order.id)).status, 404);
    assert.equal((await request(base + '/orders/abc')).status, 400);
    const cancelled = await request(base + '/orders', 'POST', body([{ product_id: second.id, quantity: 1 }]));
    assert.equal((await request(base + '/orders/' + cancelled.data.id, 'PUT', { status: 'cancelled' })).data.status, 'cancelled');
  });
  await t.test('Service sản phẩm và xác thực không khả dụng', async () => {
    await new Promise(resolve => servers[1].close(resolve));
    assert.equal((await request(base + '/orders', 'POST', body([{ product_id: product.id, quantity: 1 }]))).status, 503);
    await new Promise(resolve => servers[0].close(resolve));
    assert.equal((await request(base + '/orders')).status, 503);
  });
});
