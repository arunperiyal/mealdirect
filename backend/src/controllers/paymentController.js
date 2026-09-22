const { Order, Payment } = require('../models');
const razorpay = require('../services/razorpay');
const orderController = require('./orderController');
const config = require('../config');

const throwError = (code, message, statusCode = 400) => {
  throw { code, message, statusCode };
};

const PAID_STATUSES = ['authorized', 'captured'];

// Razorpay works in the smallest currency unit (paise)
const toPaise = (amount) => Math.round(Number(amount) * 100);

// Assign a new array so Sequelize detects the JSON change
const addStatusHistory = (order, newStatus, changedBy) => {
  order.statusHistory = [
    ...(order.statusHistory || []),
    { status: newStatus, timestamp: new Date(), changedBy },
  ];
};

// Hide the signature from API responses
const serializePayment = (payment) => {
  const data = payment.toJSON();
  delete data.razorpaySignature;
  return data;
};

// Record a successful payment on the order and auto-confirm it if still pending
const markOrderPaid = async (payment, changedBy) => {
  const order = await Order.findByPk(payment.orderId);
  if (!order || order.paymentStatus === 'completed') return order;

  order.paymentStatus = 'completed';
  order.paymentId = payment.razorpayPaymentId;

  if (order.status === 'pending') {
    order.status = 'confirmed';
    order.confirmedAt = new Date();
    addStatusHistory(order, 'confirmed', changedBy);
  } else if (order.status === 'cancelled') {
    // Paid after cancellation: needs a manual refund until refunds are automated
    console.warn(`Payment received for cancelled order ${order.id}; refund required`);
  }

  await order.save();
  return order;
};

// 1. Create a Razorpay order for an existing online-payment order
const createPaymentOrder = async (customerId, orderId) => {
  try {
    const order = await Order.findByPk(orderId);
    if (!order) throwError('NOT_FOUND', 'Order not found', 404);
    if (order.customerId !== customerId) {
      throwError('FORBIDDEN', 'You do not have access to this order', 403);
    }
    if (order.paymentMethod === 'cod') {
      throwError('COD_ORDER', 'Cash on delivery orders do not need online payment', 409);
    }
    if (order.status === 'cancelled') {
      throwError('ORDER_CANCELLED', 'Cannot pay for a cancelled order', 409);
    }
    if (order.paymentStatus === 'completed') {
      throwError('ALREADY_PAID', 'This order has already been paid', 409);
    }

    const { keyId, currency } = config.payment.razorpay;
    const amount = toPaise(order.total);

    // Reuse an open Razorpay order so retries don't create duplicates
    let payment = await Payment.findOne({
      where: { orderId, status: 'pending' },
      order: [['createdAt', 'DESC']],
    });

    if (!payment || toPaise(payment.amount) !== amount) {
      const razorpayOrder = await razorpay.createOrder({
        amount,
        currency,
        receipt: order.id,
        notes: { orderId: order.id },
      });

      payment = await Payment.create({
        orderId: order.id,
        customerId,
        razorpayOrderId: razorpayOrder.id,
        amount: order.total,
        currency: razorpayOrder.currency || currency,
        status: 'pending',
      });
    }

    return {
      paymentId: payment.id,
      orderId: order.id,
      razorpayOrderId: payment.razorpayOrderId,
      amount,
      currency: payment.currency,
      keyId,
    };
  } catch (error) {
    if (error.code) throw error;
    throw { code: 'DB_ERROR', message: error.message, statusCode: 500 };
  }
};

// 2. Verify the Checkout callback signature and mark the order paid
const verifyPayment = async (customerId, data) => {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = data;

    const payment = await Payment.findOne({ where: { razorpayOrderId } });
    if (!payment) throwError('NOT_FOUND', 'Payment not found', 404);
    if (payment.customerId !== customerId) {
      throwError('FORBIDDEN', 'You do not have access to this payment', 403);
    }

    const valid = razorpay.verifyPaymentSignature({
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    });
    if (!valid) {
      throwError('INVALID_SIGNATURE', 'Payment signature verification failed', 400);
    }

    // A webhook may have already recorded this payment
    if (!PAID_STATUSES.includes(payment.status)) {
      payment.status = 'authorized';
      payment.errorMessage = null;
    }
    payment.razorpayPaymentId = razorpayPaymentId;
    payment.razorpaySignature = razorpaySignature;
    await payment.save();

    const order = await markOrderPaid(payment, customerId);

    return { payment: serializePayment(payment), order };
  } catch (error) {
    if (error.code) throw error;
    throw { code: 'DB_ERROR', message: error.message, statusCode: 500 };
  }
};

// 3. Handle a Razorpay webhook event
const handleWebhook = async (rawBody, signature, body) => {
  try {
    if (!razorpay.verifyWebhookSignature(rawBody, signature)) {
      throwError('INVALID_SIGNATURE', 'Webhook signature verification failed', 400);
    }

    const event = body.event;
    const entity = body.payload?.payment?.entity;
    if (!entity) return { handled: false, reason: 'unsupported event' };

    const payment = await Payment.findOne({ where: { razorpayOrderId: entity.order_id } });
    if (!payment) return { handled: false, reason: 'unknown order' };

    if (entity.amount !== toPaise(payment.amount)) {
      console.warn(`Webhook amount mismatch for payment ${payment.id}`);
      return { handled: false, reason: 'amount mismatch' };
    }

    switch (event) {
      case 'payment.authorized':
      case 'payment.captured': {
        const newStatus = event === 'payment.captured' ? 'captured' : 'authorized';
        // Never downgrade captured/refunded back to authorized
        if (payment.status === 'refunded' || payment.status === 'captured') break;
        payment.status = newStatus;
        payment.razorpayPaymentId = entity.id;
        payment.method = entity.method || payment.method;
        payment.errorMessage = null;
        await payment.save();
        await markOrderPaid(payment, 'razorpay');
        break;
      }

      case 'payment.failed': {
        // A later retry on the same Razorpay order may still succeed
        if (payment.status !== 'pending' && payment.status !== 'failed') break;
        payment.status = 'failed';
        payment.razorpayPaymentId = entity.id;
        payment.method = entity.method || payment.method;
        payment.errorMessage = entity.error_description || 'Payment failed';
        await payment.save();

        const order = await Order.findByPk(payment.orderId);
        if (order && order.paymentStatus !== 'completed') {
          order.paymentStatus = 'failed';
          await order.save();
        }
        break;
      }

      default:
        return { handled: false, reason: 'unsupported event' };
    }

    return { handled: true, event };
  } catch (error) {
    if (error.code) throw error;
    throw { code: 'DB_ERROR', message: error.message, statusCode: 500 };
  }
};

// 4. Get payment status for an order
const getPaymentStatus = async (orderId, userId, role) => {
  try {
    const order = await orderController.getOrder(orderId, userId, role);
    const payments = await Payment.findAll({
      where: { orderId },
      order: [['createdAt', 'DESC']],
    });

    return {
      orderId: order.id,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      total: order.total,
      payments: payments.map(serializePayment),
    };
  } catch (error) {
    if (error.code) throw error;
    throw { code: 'DB_ERROR', message: error.message, statusCode: 500 };
  }
};

module.exports = {
  createPaymentOrder,
  verifyPayment,
  handleWebhook,
  getPaymentStatus,
};
