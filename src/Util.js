const Web3 = require('web3');

const Util = {

  BN_TEN: Web3.utils.toBN(10),
  BN_ZERO: Web3.utils.toBN(0),

  convertFloatToString(float, decimals) {
    return Util.convertFloatToBN(float, decimals).toString();
  },

  convertFloatToBN(value, decimals) {
    const stringValue = value.toString();

    if (value > Number.MAX_SAFE_INTEGER || stringValue.includes('e')) {
      throw new Error(`Unsafe conversion of ${value} to BN`);
    }

    const valueParts = stringValue.split('.');
    const offsetLength = valueParts[1]?.length ?? 0;

    // Represent value as an inflated BN
    const inflatedValueBN = Web3.utils.toBN(valueParts.join(''));

    // Scale to desired decimals and remove offset
    const scalingFactor = Web3.utils.toBN(decimals - offsetLength);
    return scalingFactor.isNeg()
      ? inflatedValueBN.div(Util.BN_TEN.pow(scalingFactor))
      : inflatedValueBN.mul(Util.BN_TEN.pow(scalingFactor));
  },

  convertBNtoFloat(bigNumber, decimals) {
    return Util.convertStringToFloat(bigNumber.toString(), decimals);
  },

  convertStringToFloat(stringNumber, decimals) {
    const isNegative = stringNumber[0] === '-';
    const unsignedString = stringNumber.replace('-', '');
    const zeroPadding = '0'.repeat(Math.max(decimals - unsignedString.length, 0));
    const unsignedPaddedInput = zeroPadding + unsignedString;
    const wholePartString = (isNegative ? '-' : '') + unsignedPaddedInput.slice(0, unsignedPaddedInput.length - decimals);
    const fractionalPartString = unsignedPaddedInput.slice(unsignedPaddedInput.length - decimals, unsignedPaddedInput.length);

    if (decimals === 0) {
      // if (unsignedString.replace(/0+$/, '').length >= 18) logger.execution.warn(`Converting ${wholePartString} will lose precision`);
      return parseInt(wholePartString);
    } else {
      // if (unsignedString.replace(/0+$/, '').length >= 18) logger.execution.warn(`Converting ${wholePartString}.${fractionalPartString} will lose precision`);
      return parseFloat(`${wholePartString}.${fractionalPartString}`);
    }
  },

  toBN(value) {
    return Web3.utils.toBN(value);
  },

  chunk(array, chunkSize) {
    const batches = [];
    for (let i = 0; i < array.length; i+=chunkSize) {
      const batch = array.slice(i, i+chunkSize);
      batches.push(batch);
    }
    return batches;
  },

};

module.exports = Util;
