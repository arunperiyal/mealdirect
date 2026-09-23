const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Money a delivery partner hands over to MealDirect for cash they collected,
// or an amount an admin writes off. A rider's balance is cash collected minus these.
const Settlement = sequelize.define(
  'Settlement',
  {
    id: {
      type: sequelize.options.dialect === 'sqlite' ? DataTypes.STRING : DataTypes.UUID,
      defaultValue: sequelize.options.dialect === 'sqlite'
        ? () => require('crypto').randomUUID()
        : DataTypes.UUIDV4,
      primaryKey: true,
    },
    riderId: {
      type: sequelize.options.dialect === 'sqlite' ? DataTypes.STRING : DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'RESTRICT',
    },
    kind: {
      type: sequelize.options.dialect === 'sqlite' ? DataTypes.STRING : DataTypes.ENUM('payment', 'write_off'),
      allowNull: false,
      validate: { isIn: { args: [['payment', 'write_off']], msg: 'Invalid settlement kind' } },
    },
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      validate: { min: { args: [0.01], msg: 'Amount must be positive' } },
    },
    note: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    recordedById: {
      type: sequelize.options.dialect === 'sqlite' ? DataTypes.STRING : DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'RESTRICT',
    },
  },
  {
    timestamps: true,
    tableName: 'Settlements',
    indexes: sequelize.options.dialect === 'sqlite' ? [] : [{ fields: ['rider_id'] }],
  }
);

module.exports = Settlement;
