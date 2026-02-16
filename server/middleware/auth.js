import jwt from 'jsonwebtoken';

export function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function authenticateStream(req, res, next) {
  try {
    // For streaming, accept token from query param (since video players can't send headers)
    const token = req.query.token || req.headers.authorization?.substring(7);

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function validateBucket(req, res, next) {
  const buckets = process.env.ZATA_BUCKETS.split(',').map(b => b.trim());
  const bucket = req.query.bucket || req.body.bucket;

  if (!bucket) {
    return res.status(400).json({ error: 'Bucket parameter required' });
  }

  if (!buckets.includes(bucket)) {
    return res.status(400).json({ error: 'Invalid bucket' });
  }

  req.bucket = bucket;
  next();
}
