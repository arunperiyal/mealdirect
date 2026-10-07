const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Menu = sequelize.define(
  'Menu',
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
    restaurantId: {
      type: sequelize.options.dialect === 'sqlite' ? DataTypes.STRING : DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'Restaurants',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    // A restaurant can have several menus a day (Lunch, Dinner, "Lunch – South Indian"),
    // so each has a name customers, the kitchen and statements show
    name: {
      type: DataTypes.STRING(60),
      allowNull: false,
      defaultValue: 'Menu',
      validate: { notEmpty: { msg: 'Name the menu, e.g. Lunch' } },
    },
    date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      validate: {
        isDate: true,
      },
    },
    orderingStartTime: {
      type: DataTypes.TIME,
      allowNull: true,
    },
    orderingEndTime: {
      type: DataTypes.TIME,
      allowNull: true,
    },
    // Which day each end of the ordering window falls on: 0 the menu's day, -1 the day
    // before (overnight ordering). See lib/ordering.js.
    orderingOpensDay: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: { isIn: { args: [[-1, 0]], msg: 'Ordering opens on the menu day or the day before' } },
    },
    orderingClosesDay: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: { isIn: { args: [[-1, 0]], msg: 'Ordering closes on the menu day or the day before' } },
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    items: {
      type: DataTypes.JSON,
      defaultValue: [],
      allowNull: false,
      comment: 'Array of { id, dishId, name, description, price, imageUrl, available, maxPerOrder, maxPerDay }',
    },
    deliverySlotIds: {
      type: DataTypes.JSON,
      defaultValue: [],
      allowNull: false,
      comment: 'Array of delivery slot IDs',
    },
    maxOrdersPerSlot: {
      type: DataTypes.INTEGER,
      defaultValue: 50,
      validate: {
        min: { args: [1], msg: 'Max orders must be at least 1' },
      },
    },
    status: {
      type: sequelize.options.dialect === 'sqlite'
        ? DataTypes.STRING
        : DataTypes.ENUM('draft', 'published', 'closed', 'archived'),
      defaultValue: 'draft',
      validate: {
        isIn: {
          args: [['draft', 'published', 'closed', 'archived']],
          msg: 'Invalid menu status',
        },
      },
    },
    publishedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    timestamps: true,
    paranoid: true,
    tableName: 'Menus',
    indexes: sequelize.options.dialect === 'sqlite' ? [] : [
      { fields: ['restaurant_id'] },
      { fields: ['date'] },
      { fields: ['status'] },
      { fields: ['restaurant_id', 'date'] },
    ],
  }
);

module.exports = Menu;
