const SUPPLIERS = require('./suppliers.example');
const Utils = require('../src/Util');

module.exports = {
    // Can be provided as a string or converted with the Util
    AMOUNT: Utils.convertFloatToString(100, 18),

    RECIPIENTS: [
        // Example with reference used
        SUPPLIERS.FIRST_LAST,
        // Example with address specified
        '0x0000000000000000000000000000000000000000',
    ],
};
