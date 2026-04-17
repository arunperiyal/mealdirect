const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Order = sequelize.define(
  'Order',
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
    customerId: {
      type: sequelize.options.dialect === 'sqlite' ? DataTypes.STRING : DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'Users',
        key: 'id',
      },
      onDelete: 'RESTRICT',
    },
    restaurantId: {
      type: sequelize.options.dialect === 'sqlite' ? DataTypes.STRING : DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'Restaurants',
        key: 'id',
      },
      onDelete: 'RESTRICT',
    },
    menuId: {
      type: sequelize.options.dialect === 'sqlite' ? DataTypes.STRING : DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'Menus',
        key: 'id',
      },
      onDelete: 'RESTRICT',
    },
    items: {
      type: DataTypes.JSON,
      defaultValue: [],
      allowNull: false,
      comment: 'Array of { menuItemId, name, quantity, price, total }',
    },
    deliveryType: {
      type: sequelize.options.dialect === 'sqlite'
        ? DataTypes.STRING
        : DataTypes.ENUM('delivery', 'pickup'),
      defaultValue: 'delivery',
      validate: {
        isIn: {
          args: [['delivery', 'pickup']],
          msg: 'Invalid delivery type',
        },
      },
    },
    deliverySlotId: {
      type: sequelize.options.dialect === 'sqlite' ? DataTypes.STRING : DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'DeliverySlots',
        key: 'id',
      },
      onDelete: 'SET NULL',
    },
    deliveryAddress: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    estimatedDeliveryTime: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    paymentMethod: {
      type: sequelize.options.dialect === 'sqlite'
        ? DataTypes.STRING
        : DataTypes.ENUM('credit_card', 'cod'),
      defaultValue: 'cod',
      validate: {
        isIn: {
          args: [['credit_card', 'cod']],
          msg: 'Invalid payment method',
        },
      },
    },
    paymentStatus: {
      type: sequelize.options.dialect === 'sqlite'
        ? DataTypes.STRING
        : DataTypes.ENUM('pending', 'completed', 'failed'),
      defaultValue: 'pending',
      validate: {
        isIn: {
          args: [['pending', 'completed', 'failed']],
          msg: 'Invalid payment status',
        },
      },
    },
    paymentId: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Stripe/Razorpay transaction ID',
    },
    subtotal: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      validate: {
        min: { args: [0], msg: 'Subtotal cannot be negative' },
      },
    },
    tax: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
      validate: {
        min: { args: [0], msg: 'Tax cannot be negative' },
      },
    },
    deliveryFee: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
      validate: {
        min: { args: [0], msg: 'Delivery fee cannot be negative' },
      },
    },
    discount: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
      validate: {
        min: { args: [0], msg: 'Discount cannot be negative' },
      },
    },
    total: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      validate: {
        min: { args: [0], msg: 'Total cannot be negative' },
      },
    },
    status: {
      type: sequelize.options.dialect === 'sqlite'
        ? DataTypes.STRING
        : DataTypes.ENUM(
            'pending',
            'confirmed',
            'preparing',
            'ready',
            'out_for_delivery',
            'delivered',
            'picked_up',
            'cancelled'
          ),
      defaultValue: 'pending',
      validate: {
        isIn: {
          args: [
            [
              'pending',
              'confirmed',
              'preparing',
              'ready',
              'out_for_delivery',
              'delivered',
              'picked_up',
              'cancelled',
            ],
          ],
          msg: 'Invalid order status',
        },
      },
    },
    statusHistory: {
      type: DataTypes.JSON,
      defaultValue: [],
      allowNull: false,
      comment: 'Array of { status, timestamp, changedBy }',
    },
    customerNotes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    restaurantNotes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    cancellationReason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    orderTime: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    confirmedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    readyAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    deliveredAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    timestamps: true,
    paranoid: true,
    tableName: 'Orders',
    indexes: sequelize.options.dialect === 'sqlite' ? [] : [
      { fields: ['customerId'] },
      { fields: ['restaurantId'] },
      { fields: ['menuId'] },
      { fields: ['status'] },
      { fields: ['customerId', 'status'] },
      { fields: ['restaurantId', 'status'] },
    ],
  }
);

module.exports = Order;
