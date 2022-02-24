const {SPLITTER, MULTISIG, MULTISIG_TYPE, WALLET, KEY, RPC} = require('../config/config');
const ABI = require('../config/abi');
const Util = require('./Util');
const Web3 = require('web3');
const path = require('path');
const fs = require('fs');
const csv = require('csv-parser');
const {CSV_HEADERS, GNOSIS_MULTISIG, GNOSIS_SAFE} = require('./core/constants');
const {propose: gnosisMultisigPropose} = require('./core/gnosisMultisig');
const {propose: gnosisSafePropose} = require('./core/gnosisSafe');
const web3 = new Web3(new Web3.providers.HttpProvider(RPC));
web3.eth.accounts.wallet.add(KEY);


(async () => {
  const PAYMENTS = await new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream('../config/payments.csv')
      .pipe(csv(CSV_HEADERS))
      .on('data', data => results.push(data))
      .on('end', () => resolve(results))
      .on('error', reject);
  });

  if (PAYMENTS.some((payment) => Object.entries(payment).length !== CSV_HEADERS.length)) {
    throw new Error(`Invalid CSV entry! All entries must have ${CSV_HEADERS.length} values`);
  }

  const TOKEN = PAYMENTS[0].token;

  if (TOKEN === 'AVAX') {
    throw new Error('AVAX payments do not require an approval');
  }

  if (!web3.utils.isAddress(TOKEN.toLowerCase())) {
    throw new Error(`Invalid first token address (${TOKEN})`);
  }

  const tokens = PAYMENTS.map(({token}) => token);
  if (tokens.some(token => token.toLowerCase() !== tokens[0].toLowerCase())) {
    throw new Error(`Identified non-uniform set of token CSV entries`);
  }

  const tokenContract = new web3.eth.Contract(ABI.ERC20, TOKEN.toLowerCase());
  const symbol = await tokenContract.methods.symbol().call();
  const decimals = parseInt(await tokenContract.methods.decimals().call());

  // Create actual approval tx
  console.log(`Creating approval transaction ...`);
  const tx = await tokenContract.methods.approve(
    SPLITTER,
    '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
  );

  console.log(`Checking current allowance of ${MULTISIG ? `multisig (${MULTISIG})` : `wallet (${WALLET})`} for splitter ...`);
  const allowance = await tokenContract.methods.allowance(MULTISIG ? MULTISIG : WALLET, SPLITTER).call();
  console.log(`Current allowance: ${Util.convertStringToFloat(allowance, decimals)} ${symbol}`);
  console.log();

  const bytecode = tx.encodeABI();
  const fileOutput = `./${path.basename(__filename, '.js')}-${symbol}-bytecode.txt`;
  fs.writeFileSync(fileOutput, bytecode);
  console.log(`Bytecode written to ${fileOutput}`);

  if (MULTISIG) {
    switch (MULTISIG_TYPE) {
      case GNOSIS_MULTISIG:
        console.log(`Will propose to gnosis multisig in 15 seconds ...`);
        await new Promise(resolve => setTimeout(resolve, 15000));
        console.log();

        console.log(`Proposing transaction to gnosis multisig ...`);

        await gnosisMultisigPropose({
          multisigAddress: MULTISIG,
          destination: SPLITTER,
          value: 0,
          bytecode,
        });
        break;
      case GNOSIS_SAFE:
        console.log(`Will propose to gnosis safe in 15 seconds ...`);
        await new Promise(resolve => setTimeout(resolve, 15000));
        console.log();

        console.log(`Proposing transaction to gnosis safe ...`);

        await gnosisSafePropose({
          multisigAddress: MULTISIG,
          destination: SPLITTER,
          value: 0,
          bytecode,
        });
        break;
      default:
        throw new Error(`Unsupported multisig type: ${MULTISIG_TYPE}`);
    }
  } else {
    console.log(`Estimating gas ...`);
    const gas = await tx.estimateGas({from: WALLET});
    const gasPrice = await web3.eth.getGasPrice();
    console.log(`Estimated gas: ${gas.toLocaleString('en-us')} (${(parseInt(gas) / (10 ** 18) * gasPrice).toFixed(4)} AVAX)`);
    console.log();

    console.log(`Will send transaction directly in 15 seconds ...`);
    await new Promise(resolve => setTimeout(resolve, 15000));
    console.log();

    const baseGasPrice = await web3.eth.getGasPrice();

    console.log(`Sending transaction ...`);

    await tx.send({
      from: WALLET,
      value: 0,
      gas,
      maxFeePerGas: baseGasPrice * 2,
      maxPriorityFeePerGas: web3.utils.toWei('2', 'nano'),
    });
  }
})()
  .then(console.log)
  .catch(console.error)
  .finally(process.exit);
