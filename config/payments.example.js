const SUPPLIERS = require('./suppliers.example');
const Util = require('../src/Util');

module.exports = [
  {
    ADDRESS: SUPPLIERS.FIRST_LAST.ADDRESS,
    AMOUNT: Util.convertFloatToString(1000, 18),
  },
];
