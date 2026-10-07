const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const isSqlite = sequelize.options.dialect === 'sqlite';

// A customer's saved delivery address, to pick at checkout instead of typing it again
const Address = sequelize.define(
  'Address',
  {
    id: {
      type: isSqlite ? DataTypes.STRING : DataTypes.UUID,
      defaultValue: isSqlite ? () => require('crypto').randomUUID() : DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: isSqlite ? DataTypes.STRING : DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
    },
    // "Home", "Work"...
    label: {
      type: DataTypes.STRING(40),
      allowNull: false,
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    // Set when an order goes to this address; the most recently used comes first
    lastUsedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: 'Addresses',
    timestamps: true,
    indexes: isSqlite ? [] : [{ fields: ['user_id'] }],
  }
);

module.exports = Address;
