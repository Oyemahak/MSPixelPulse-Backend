// src/middleware/errorHandler.js
export function notFound(req, res, _next) {
  res.status(404).json({ message: `Not found: ${req.originalUrl}` });
}

export function errorHandler(err, _req, res, _next) {
  console.error('Error:', err.code || err.name || 'SERVER_ERROR');
  const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : err.status || 500;
  const message =
    err.code === 'LIMIT_FILE_SIZE'
      ? 'File exceeds the 4 MB upload limit.'
      : status === 500
      ? 'Server error'
      : err.code === 'STORAGE_UNAVAILABLE'
        ? 'File storage is unavailable'
        : err.message || 'Request failed';
  res.status(status).json({ message });
}
