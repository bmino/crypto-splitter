const { TOKEN, CHUNK, SPLITTER, MULTISIG, WALLET, KEY, RPC } = require('../config/config');
const ABI = require('../config/abi');
const { AMOUNT, RECIPIENTS } = require('../config/distributions');
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
  const friendlyValue = Util.convertStringToFloat(AMOUNT, decimals).toLocaleString('en-US', {minimumFractionDigits: 2});

  console.log(`Calculating total sum of ${RECIPIENTS.length} distributions ...`);
  const distributionSumBN = Util.toBN(AMOUNT).muln(RECIPIENTS.length);
  const distributionSum = Util.convertBNtoFloat(distributionSumBN, decimals);
  console.log(`Total: ${distributionSum.toLocaleString('en-US', {minimumFractionDigits: 4})} ${symbol}`);
  console.log();

  console.log(`Checking balance of ${MULTISIG ? `multisig (${MULTISIG})` : `wallet (${WALLET})`} ...`);
  const balanceString = await token.methods.balanceOf(MULTISIG ? MULTISIG : WALLET).call();
  const balance = Util.convertStringToFloat(balanceString, decimals);
  console.log(`Balance: ${balance.toLocaleString('en-US', {minimumFractionDigits: 4})} ${symbol}`);
  console.log();

  if (distributionSum > balance) {
    throw new Error(`Insufficient balance to fund distributions!`);
  }

  console.log(`Checking allowance of ${MULTISIG ? `multisig (${MULTISIG})` : `wallet (${WALLET})`} for splitter ...`);
  const allowanceString = await token.methods.allowance(MULTISIG ? MULTISIG : WALLET, SPLITTER).call();
  const allowance = Util.convertStringToFloat(allowanceString, decimals);
  console.log(`Allowance: ${allowance.toLocaleString('en-US', {minimumFractionDigits: 4})} ${symbol}`);
  console.log();

  if (distributionSum > allowance) {
    throw new Error(`Insufficient allowance to fund distributions!`);
  }

  // Warn about duplicate addresses
  console.log(`Checking for duplicate addresses ...`);
  RECIPIENTS
    .filter((address, index) => RECIPIENTS.indexOf(address) !== index)
    .forEach(duplicateAddress => {
      const appearances = RECIPIENTS.filter(recipient => recipient.toLowerCase() === duplicateAddress.toLowerCase()).length;
      console.warn(`Duplicate address ${duplicateAddress}: (x${appearances})`);
    });
  console.log();

  // Warn about invalid addresses
  console.log(`Checking for invalid addresses ...`);
  const invalidAddresses = RECIPIENTS.filter(address => !web3.utils.isAddress(address));
  if (invalidAddresses.length > 0) {
    invalidAddresses.forEach(address => console.warn(`Invalid address ${address}`));
    throw new Error(`${invalidAddresses.length} invalid addresses detected!`);
  }
  console.log();

  // Split into multiple tx's if required
  console.log(`Splitting into batches if necessary ...`);
  const RECIPIENT_BATCHES = [];
  for (let i = 0; i < RECIPIENTS.length; i+=CHUNK) {
    const batch = RECIPIENTS.slice(i, i+CHUNK);
    RECIPIENT_BATCHES.push(batch);
  }
  console.log(`Split into ${RECIPIENT_BATCHES.length} batches of [${RECIPIENT_BATCHES.map(batch => batch.length)}] distributions`);

  const tables = [];
  const directDistributeTXs = [];

  for (const recipients of RECIPIENT_BATCHES) {
    // Display friendly UI of payment batches
    const table = recipients.map((address) => ({
      address,
      AMOUNT,
      friendlyValue,
      token: symbol,
    }));
    tables.push(table);

    const directDistributeTX = splitter.methods.distribute(
      TOKEN,
      AMOUNT,
      recipients,
    );
    directDistributeTXs.push(directDistributeTX);
  }

  // Display all tables
  tables.forEach(table => console.table(table));

  // Display all bytecode
  directDistributeTXs.forEach((tx, i) => {
    const txsIncluded = tx.arguments[2].length;
    const txsSubmitted = CHUNK * i;
    console.log(`Bytecode for ${txsIncluded} Distributions (${txsSubmitted + 1}-${txsSubmitted + txsIncluded}):`);
    console.log(tx.encodeABI());
    console.log();
  });

  for (const directDistributeTX of directDistributeTXs) {
    if (MULTISIG) {
      // Create multisig transaction
      const multisigPaymentTX = multi.methods.submitTransaction(
        SPLITTER,
        0,
        directDistributeTX.encodeABI(),
      );

      console.log(`Estimating gas for multisig submission ...`);
      const gasForSubmission = await multisigPaymentTX.estimateGas({ from: WALLET });
      console.log(`Estimated gas for submission: ${gasForSubmission.toLocaleString('en-US')} (${(parseInt(gasForSubmission) / (10 ** 18) * gasPrice).toFixed(4)} AVAX)`);
      console.log();

      console.log(`Estimating gas for multisig execution ...`);
      const gasForExecution = await directDistributeTX.estimateGas({ from: MULTISIG });
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
      const gas = await directDistributeTX.estimateGas({ from: WALLET });
      console.log(`Estimated gas: ${gas.toLocaleString('en-US')} (${(parseInt(gas) / (10 ** 18) * gasPrice).toFixed(4)} AVAX)`);
      console.log();

      console.log(`Will send transaction in 15 seconds ...`);
      await new Promise(resolve => setTimeout(resolve, 15000));
      console.log();

      console.log(`Sending transaction ...`);

      const receipt = await directDistributeTX.send({
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
