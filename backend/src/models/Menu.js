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
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    items: {
      type: DataTypes.JSON,
      defaultValue: [],
      allowNull: false,
      comment: 'Array of { id, name, description, price, imageUrl, available }',
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
      { fields: ['restaurantId'] },
      { fields: ['date'] },
      { fields: ['status'] },
      { fields: ['restaurantId', 'date'] },
    ],
  }
);

module.exports = Menu;
