const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const isSqlite = sequelize.options.dialect === 'sqlite';

// A restaurant's own list of dishes, to pick from when building a day's menu. A menu keeps
// its own copy of each dish (see Menu.items), so editing a dish here doesn't change menus
// already made, and orders keep what was ordered.
const Dish = sequelize.define(
  'Dish',
  {
    id: {
      type: isSqlite ? DataTypes.STRING : DataTypes.UUID,
      defaultValue: isSqlite ? () => require('crypto').randomUUID() : DataTypes.UUIDV4,
      primaryKey: true,
    },
    restaurantId: {
      type: isSqlite ? DataTypes.STRING : DataTypes.UUID,
      allowNull: false,
      references: { model: 'Restaurants', key: 'id' },
      onDelete: 'CASCADE',
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: { notEmpty: { msg: 'Enter a name' } },
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
    },
    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      validate: { min: { args: [0], msg: 'Price cannot be negative' } },
    },
    // Copied onto menus with the dish; see lib/itemLimits.js
    maxPerOrder: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    maxPerDay: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    // Removed dishes are hidden, not deleted, so menus and orders that used them keep their link
    archived: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    timestamps: true,
    tableName: 'Dishes',
    indexes: isSqlite ? [] : [{ fields: ['restaurant_id', 'archived'] }],
  }
);

module.exports = Dish;
