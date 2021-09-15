const { TOKEN, CHUNK, SHOW_BYTECODE, SPLITTER, MULTISIG, WALLET, KEY, RPC} = require('../config/config');
const ABI = require('../config/abi');
const PAYMENTS = require('../config/payments');
const SUPPLIERS = require('../config/suppliers');
const Util = require('./Util');
const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider(RPC));
web3.eth.accounts.wallet.add(KEY);

// Contracts
const token = new web3.eth.Contract(ABI.ERC20, TOKEN);
const splitter = new web3.eth.Contract(ABI.SPLITTER, SPLITTER);
const multi = MULTISIG ? new web3.eth.Contract(ABI.GNOSIS_MULTISIG, MULTISIG) : null;

(async () => {
  const symbol = await token.methods.symbol().call();
  const decimals = parseInt(await token.methods.decimals().call());
  const gasPrice = await web3.eth.getGasPrice();

  console.log(`Calculating total sum of ${PAYMENTS.length} payments ...`);
  const paymentSumBN = PAYMENTS.map(entry => entry[1])
    .map(Util.toBN)
    .reduce((sum, payment) => sum.add(payment), Util.BN_ZERO);
  const paymentSum = Util.convertBNtoFloat(paymentSumBN, decimals);
  console.log(`Total: ${paymentSum.toLocaleString('en-US', {minimumFractionDigits: 4})} ${symbol}`);
  console.log();

  console.log(`Checking balance of ${MULTISIG ? `multisig (${MULTISIG})` : `wallet (${WALLET})`} ...`);
  const balanceString = await token.methods.balanceOf(MULTISIG ? MULTISIG : WALLET).call();
  const balance = Util.convertStringToFloat(balanceString, decimals);
  console.log(`Balance: ${balance.toLocaleString('en-US', {minimumFractionDigits: 4})} ${symbol}`);
  console.log();

  if (paymentSum > balance) {
    throw new Error(`Insufficient balance to fund payments!`);
  }

  console.log(`Checking allowance of ${MULTISIG ? `multisig (${MULTISIG})` : `wallet (${WALLET})`} for splitter ...`);
  const allowanceString = await token.methods.allowance(MULTISIG ? MULTISIG : WALLET, SPLITTER).call();
  const allowance = Util.convertStringToFloat(allowanceString, decimals);
  console.log(`Allowance: ${allowance.toLocaleString('en-US', {minimumFractionDigits: 4})} ${symbol}`);
  console.log();

  if (paymentSum > allowance) {
    throw new Error(`Insufficient allowance to fund payments!`);
  }

  // Warn about duplicate suppliers
  console.log(`Checking for supplier name collisions ...`);
  Object.values(SUPPLIERS)
    .filter((address, index, addresses) => addresses.indexOf(address) !== index)
    .forEach(duplicateAddress => {
      const namesUsed = Object.entries(SUPPLIERS).filter(([n, a]) => a === duplicateAddress).map(([name,]) => name);
      console.warn(`Duplicate address ${duplicateAddress}: [${namesUsed}]`);
    });
  console.log();

  // Warn about invalid addresses
  console.log(`Checking for invalid addresses ...`);
  const invalidAddresses = PAYMENTS.map(([address, amount]) => address).filter(address => !web3.utils.isAddress(address));
  if (invalidAddresses.length > 0) {
    invalidAddresses.forEach(address => console.warn(`Invalid address ${address}`));
    throw new Error(`${invalidAddresses.length} invalid addresses detected!`);
  }
  console.log();

  // Split into multiple tx's if required
  console.log(`Splitting into batches if necessary ...`);
  const PAYMENT_BATCHES = Util.chunk(PAYMENTS, CHUNK);
  console.log(`Split into ${PAYMENT_BATCHES.length} batches of [${PAYMENT_BATCHES.map(batch => batch.length)}] payments`);

  const tables = [];
  const directPaymentTXs = [];

  for (const payments of PAYMENT_BATCHES) {
    // Display friendly UI of payment batches
    const table = payments.map(([address, amount]) => ({
      name: Object.keys(SUPPLIERS).find(name => SUPPLIERS[name] === address),
      address,
      amount,
      friendlyValue: Util.convertStringToFloat(amount, decimals).toLocaleString('en-US', {minimumFractionDigits: 2}),
      token: symbol,
    }));
    tables.push(table);

    const directPaymentTX = await splitter.methods.pay(
      TOKEN,
      payments.map(entry => entry[0]),
      payments.map(entry => entry[1]),
    );
    directPaymentTXs.push(directPaymentTX);
  }

  // Display all tables
  tables.forEach(table => console.table(table));

  // Display all bytecode
  if (SHOW_BYTECODE) {
    directPaymentTXs.forEach((tx, i) => {
      const txsIncluded = tx.arguments[1].length;
      const txsSubmitted = CHUNK * i;
      console.log(`Bytecode for ${txsIncluded} Payments (${txsSubmitted + 1}-${txsSubmitted + txsIncluded}):`);
      console.log(tx.encodeABI());
      console.log();
    });
  }

  for (const directPaymentTX of directPaymentTXs) {
    if (MULTISIG) {
      // Create multisig transaction
      const multisigPaymentTX = multi.methods.submitTransaction(
        SPLITTER,
        0,
        directPaymentTX.encodeABI(),
      );

      console.log(`Estimating gas for multisig submission ...`);
      const gasForSubmission = await multisigPaymentTX.estimateGas({ from: WALLET });
      console.log(`Estimated gas for submission: ${gasForSubmission.toLocaleString('en-US')} (${(parseInt(gasForSubmission) / (10 ** 18) * gasPrice).toFixed(4)} AVAX)`);
      console.log();

      console.log(`Estimating gas for multisig execution ...`);
      const gasForExecution = await directPaymentTX.estimateGas({ from: MULTISIG });
      console.log(`Estimated gas for execution: ${gasForExecution.toLocaleString('en-US')} (${(parseInt(gasForExecution) / (10 ** 18) * gasPrice).toFixed(4)} AVAX)`);
      console.log();

      console.log(`Will send multisig transaction in 15 seconds ...`);
      await new Promise(resolve => setTimeout(resolve, 15000));
      console.log();

      console.log(`Submitting transaction to multisig ...`);

      const receipt = await multisigPaymentTX.send({
        from: WALLET,
        gas: gasForSubmission,
        gasPrice: await web3.eth.getGasPrice(), // Recalculate gasPrice due to dynamic fees
      });
    } else {
      console.log(`Estimating gas ...`);
      const gas = await directPaymentTX.estimateGas({ from: WALLET });
      console.log(`Estimated gas: ${gas.toLocaleString('en-us')} (${(parseInt(gas) / (10 ** 18) * gasPrice).toFixed(4)} AVAX)`);
      console.log();

      console.log(`Will send transaction in 15 seconds ...`);
      await new Promise(resolve => setTimeout(resolve, 15000));
      console.log();

      console.log(`Sending transaction ...`);

      const receipt = await directPaymentTX.send({
        from: WALLET,
        gas,
        gasPrice: await web3.eth.getGasPrice(), // Recalculate gasPrice due to dynamic fees
      });
    }
  }

})()
  .then(console.log)
  .catch(console.error)
  .finally(process.exit);
