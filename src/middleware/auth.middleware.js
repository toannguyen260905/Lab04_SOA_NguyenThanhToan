function createAuthMiddleware(remote) {
  return async (req, res, next) => {
    const token = req.get('Authorization') || '';
    if (!/^Bearer [^\s]+$/i.test(token)) return res.status(401).json({ message: 'Cần gửi Bearer token.' });
    req.user = await remote.authenticate(token);
    next();
  };
}

module.exports = { createAuthMiddleware };
