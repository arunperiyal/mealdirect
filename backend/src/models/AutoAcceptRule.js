const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const isSqlite = sequelize.options.dialect === 'sqlite';
const id = isSqlite ? DataTypes.STRING : DataTypes.UUID;
const time = (field) => ({
  type: DataTypes.STRING(5),
  allowNull: false,
  validate: { is: { args: /^([01]\d|2[0-3]):[0-5]\d$/, msg: `${field} must be a time like 12:30` } },
});

// A rider's standing order: take this restaurant's deliveries due between these times
// (business timezone, start included, end not). See controllers/autoAcceptController.js.
const AutoAcceptRule = sequelize.define(
  'AutoAcceptRule',
  {
    id: {
      type: id,
      defaultValue: isSqlite ? () => require('crypto').randomUUID() : DataTypes.UUIDV4,
      primaryKey: true,
    },
    riderId: { type: id, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
    restaurantId: { type: id, allowNull: false, references: { model: 'Restaurants', key: 'id' }, onDelete: 'CASCADE' },
    startTime: time('Start time'),
    endTime: time('End time'),
    // Paused rules stay saved but take nothing
    enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  {
    tableName: 'AutoAcceptRules',
    timestamps: true,
    indexes: isSqlite ? [] : [{ fields: ['rider_id'] }, { fields: ['restaurant_id', 'enabled'] }],
  }
);

module.exports = AutoAcceptRule;
