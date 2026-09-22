const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PAYMENT_STATUSES = ['pending', 'authorized', 'captured', 'refunded', 'failed'];

const Payment = sequelize.define(
  'Payment',
  {
    id: {
      type: sequelize.options.dialect === 'sqlite'
        ? DataTypes.STRING
        : DataTypes.UUID,
      defaultValue: sequelize.options.dialect === 'sqlite'
        ? () => require('crypto').randomUUID()
        : DataTypes.UUIDV4,
      primaryKey: true,
    },
    orderId: {
      type: sequelize.options.dialect === 'sqlite' ? DataTypes.STRING : DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'Orders',
        key: 'id',
      },
      onDelete: 'RESTRICT',
    },
    customerId: {
      type: sequelize.options.dialect === 'sqlite' ? DataTypes.STRING : DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'Users',
        key: 'id',
      },
      onDelete: 'RESTRICT',
    },
    razorpayOrderId: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    razorpayPaymentId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    razorpaySignature: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      validate: {
        min: { args: [0], msg: 'Amount cannot be negative' },
      },
    },
    currency: {
      type: DataTypes.STRING(3),
      allowNull: false,
      defaultValue: 'INR',
    },
    status: {
      type: sequelize.options.dialect === 'sqlite'
        ? DataTypes.STRING
        : DataTypes.ENUM(...PAYMENT_STATUSES),
      defaultValue: 'pending',
      validate: {
        isIn: {
          args: [PAYMENT_STATUSES],
          msg: 'Invalid payment status',
        },
      },
    },
    method: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Razorpay payment method: card, upi, netbanking, wallet, ...',
    },
    errorMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    timestamps: true,
    tableName: 'Payments',
    indexes: sequelize.options.dialect === 'sqlite' ? [] : [
      { fields: ['orderId'] },
      { fields: ['customerId'] },
    ],
  }
);

module.exports = Payment;
