/**
 * Global error handling middleware
 */
const errorHandler = (err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  console.error('Error:', {
    status,
    message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });

  // Don't expose internal error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';

  res.status(status).json({
    success: false,
    message,
    ...(isDevelopment && { stack: err.stack })
  });
};

/**
 * 404 Not Found middleware
 */
const notFound = (req, res, next) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
    code: 'NOT_FOUND'
  });
};

/**
 * Validation error formatter
 */
const validationErrorFormatter = (errors) => {
  return errors
    .array()
    .map((err) => ({
      field: err.path || err.param,
      message: err.msg
    }));
};

module.exports = {
  errorHandler,
  notFound,
  validationErrorFormatter
};
