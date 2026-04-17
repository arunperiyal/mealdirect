const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const DeliverySlot = sequelize.define(
  'DeliverySlot',
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
    menuId: {
      type: sequelize.options.dialect === 'sqlite' ? DataTypes.STRING : DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'Menus',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    restaurantId: {
      type: sequelize.options.dialect === 'sqlite' ? DataTypes.STRING : DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'Restaurants',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    startTime: {
      type: DataTypes.TIME,
      allowNull: false,
      validate: {
        notNull: { msg: 'Start time is required' },
      },
    },
    endTime: {
      type: DataTypes.TIME,
      allowNull: false,
      validate: {
        notNull: { msg: 'End time is required' },
      },
    },
    maxOrders: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: { args: [1], msg: 'Max orders must be at least 1' },
      },
    },
    currentOrders: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      validate: {
        min: { args: [0], msg: 'Current orders cannot be negative' },
      },
    },
    isFull: {
      type: DataTypes.VIRTUAL,
      get() {
        return this.currentOrders >= this.maxOrders;
      },
    },
  },
  {
    timestamps: true,
    paranoid: true,
    tableName: 'DeliverySlots',
    indexes: sequelize.options.dialect === 'sqlite' ? [] : [
      { fields: ['menuId'] },
      { fields: ['restaurantId'] },
    ],
  }
);

module.exports = DeliverySlot;
