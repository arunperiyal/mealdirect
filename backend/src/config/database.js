const { Sequelize } = require('sequelize');
const config = require('./index');

const sequelize = new Sequelize(
  config.database.database,
  config.database.user,
  config.database.password,
  {
    host: config.database.host,
    port: config.database.port,
    dialect: config.database.dialect,
    // SQLite file (or ':memory:'). Without this, SQLite falls back to using
    // the host setting as a file name.
    storage: config.database.storage,
    logging: config.database.logging,
    define: config.database.define,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  }
);

module.exports = sequelize;
