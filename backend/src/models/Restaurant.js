const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Restaurant = sequelize.define(
  'Restaurant',
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
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        len: { args: [3, 255], msg: 'Name must be between 3 and 255 characters' },
      },
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      lowercase: true,
      validate: {
        isEmail: { msg: 'Invalid email format' },
      },
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        is: { args: /^[0-9+\-\s()]*$/, msg: 'Invalid phone format' },
      },
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    ownerId: {
      type: sequelize.options.dialect === 'sqlite' ? DataTypes.STRING : DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'Users',
        key: 'id',
      },
      onDelete: 'RESTRICT',
    },
    address: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    city: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    zipCode: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    latitude: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    longitude: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    operatingHours: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: {},
      comment: 'JSON: { mon: {open: "09:00", close: "22:00"}, ... }',
    },
    isApproved: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    verificationStatus: {
      type: sequelize.options.dialect === 'sqlite'
        ? DataTypes.STRING
        : DataTypes.ENUM('pending', 'verified', 'rejected'),
      defaultValue: 'pending',
      validate: {
        isIn: {
          args: [['pending', 'verified', 'rejected']],
          msg: 'Invalid verification status',
        },
      },
    },
    verificationNotes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    approvedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    approvedBy: {
      type: sequelize.options.dialect === 'sqlite' ? DataTypes.STRING : DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'Users',
        key: 'id',
      },
      onDelete: 'SET NULL',
    },
    deliveryEnabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    pickupEnabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    defaultDeliveryFee: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
      validate: {
        min: { args: [0], msg: 'Delivery fee cannot be negative' },
      },
    },
    minOrderForDelivery: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
      validate: {
        min: { args: [0], msg: 'Min order cannot be negative' },
      },
    },
    bankAccountName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    bankAccountNumber: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Encrypted in production',
    },
    bankIFSC: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    upiId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    totalOrders: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    avgRating: {
      type: DataTypes.DECIMAL(2, 1),
      defaultValue: 0,
      validate: {
        min: { args: [0], msg: 'Rating cannot be negative' },
        max: { args: [5], msg: 'Rating cannot exceed 5' },
      },
    },
    totalReviews: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    logoUrl: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    bannerUrl: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    timestamps: true,
    paranoid: true,
    tableName: 'Restaurants',
    indexes: sequelize.options.dialect === 'sqlite' ? [] : [
      { fields: ['ownerId'] },
      { fields: ['city'] },
      { fields: ['isApproved'] },
      { fields: ['verificationStatus'] },
    ],
  }
);

module.exports = Restaurant;
