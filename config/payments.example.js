const SUPPLIERS = require('./suppliers.example');
const Util = require('../src/Util');

module.exports = [
  // Example with references used
  [SUPPLIERS.FIRST_LAST, Util.convertFloatToString(1000, 18)],
  // Example with everything specified
  ['0x0000000000000000000000000000000000000000', '1000000000000000000000'],
];
