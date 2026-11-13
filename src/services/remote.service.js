function createRemoteService(config) {
  async function get(url, token) {
    let response;
    try {
      response = await fetch(url, {
        headers: { Authorization: token },
        signal: AbortSignal.timeout(config.timeout),
        redirect: 'error'
      });
    } catch {
      throw Object.assign(new Error('Không kết nối được dịch vụ xác thực hoặc sản phẩm.'), { status: 503 });
    }
    if (response.status === 401 || response.status === 403) {
      throw Object.assign(new Error('Token không hợp lệ hoặc hết hạn.'), { status: 401 });
    }
    if (response.status === 404) {
      throw Object.assign(new Error('Sản phẩm không tồn tại.'), { status: 404 });
    }
    if (!response.ok) throw Object.assign(new Error('Dịch vụ liên kết tạm thời không khả dụng.'), { status: 503 });
    try {
      return await response.json();
    } catch {
      throw Object.assign(new Error('Dịch vụ liên kết trả dữ liệu không hợp lệ.'), { status: 503 });
    }
  }

  return {
    async authenticate(token) {
      const data = await get(`${config.authUrl}/auth`, token);
      if (!data.user || !Number.isSafeInteger(data.user.id) || data.user.id <= 0) {
        throw Object.assign(new Error('Phản hồi xác thực không hợp lệ.'), { status: 503 });
      }
      return data.user;
    },
    async product(id, token) {
      const product = await get(`${config.productUrl}/products/${id}`, token);
      if (product.id !== id || typeof product.name !== 'string' || !Number.isFinite(product.price) || product.price < 0 || product.price > 99999999.99 || !Number.isInteger(product.quantity) || product.quantity < 0) {
        throw Object.assign(new Error('Thông tin sản phẩm không hợp lệ.'), { status: 503 });
      }
      return product;
    }
  };
}

module.exports = { createRemoteService };
