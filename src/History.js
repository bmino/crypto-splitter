const CONFIG = require('../config/config');
const ABI = require('../config/abi');
const ADDRESS = require('../config/config');
const axios = require('axios');
const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider(CONFIG.RPC));
const splitterABI = require('../artifacts/contracts/Splitter.sol/Splitter.json').abi;

// Change these variables
// -----------------------------------------------------------------
const payees = [
    '0x0000000000000000000000000000000000000000',
].map(payee => web3.utils.toChecksumAddress(payee.toLowerCase()));

const startBlock = 0; // Should be > Splitter deployment and < first splitting
const blockRange = 512000; // Number of block events to fetch per batch
// -----------------------------------------------------------------


const payments = [];
const tokenInfoCache = {};
const avaxPriceCache = {};
const blockRanges = [];
let processedRangeCount = 0;
const splitterContract = new web3.eth.Contract(splitterABI, ADDRESS.SPLITTER);

(async () => {
    const endBlock = await web3.eth.getBlockNumber();
    let block = startBlock;

    console.log(`Calculating ranges ...`);

    while (block < endBlock) {
        blockRanges.push([block, (block += blockRange) - 1]);
    }
    blockRanges[blockRanges.length - 1][1] = 'latest';
    console.log(`Calculated ${blockRanges.length} ranges of block size ${blockRange}`);

    console.log(`Fetching events ...`);

    for (const range of blockRanges) {
        await processRange(range);
    }

    // Show overview of all payees
    console.table(payments
        .sort((a,b) => a.epoch > b.epoch ? 1 : -1)
        .map(p => ({
            timestamp: new Date(p.epoch * 1000).toLocaleDateString(),
            payee: p.payee,
            payment: (p.payment / (10 ** tokenInfoCache[p.token].decimals)).toLocaleString('en-US', {maximumFractionDigits: 4}),
            token: tokenInfoCache[p.token].symbol,
            paymentUSD: p.paymentUSD.toLocaleString('en-US', {maximumFractionDigits: 2}),
        }))
    );

    console.log(`Calculating totals for all payees ...`);
    console.log();

    for (const payee of payees) {
        const paymentTotalsTable = [];
        const paymentsToPayee = payments.filter(p => p.payee === payee);
        const tokensPaidToPayee = [ ...new Set(paymentsToPayee.map(({ token }) => token)) ];
        let totalUSDPaidToPayee = 0;
        tokensPaidToPayee.forEach(token => {
            const tokensPaidToPayee = paymentsToPayee
                .filter(p => p.token === token)
                .reduce((sum, p) => sum.iadd(p.payment), web3.utils.toBN(0));
            const usdPaidToPayee = paymentsToPayee
                .filter(p => p.token === token)
                .reduce((sum, p) => sum += p.paymentUSD, 0);
            totalUSDPaidToPayee += usdPaidToPayee;
            paymentTotalsTable.push({
                symbol: tokenInfoCache[token].symbol,
                total: (tokensPaidToPayee / (10 ** tokenInfoCache[token].decimals)).toLocaleString('en-US', {maximumFractionDigits: 4}),
                'value ($)': usdPaidToPayee.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}),
            });
        });
        console.log(`${payee} overview:`);
        console.table(paymentTotalsTable);
        console.log(`Total payments: $${totalUSDPaidToPayee.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`);
        console.log();
    }
})()
    .catch(console.error)
    .then(process.exit);


async function processRange(range) {
    const events = await splitterContract.getPastEvents('PaymentERC20', {
        fromBlock: range[0],
        toBlock: range[1],
    });
    for (const event of events) {
        const payee = web3.utils.toChecksumAddress(event.returnValues.payee);
        if (payees.includes(payee)) {
            const payment = web3.utils.toBN(event.returnValues.payment);
            const epoch = (await web3.eth.getBlock(event.blockNumber)).timestamp;
            const tokenCache = await getTokenInfo(event.returnValues.token);
            const tokenDerivedAVAX = await getDerivedAVAX(event.returnValues.token, event.blockNumber);
            const avaxPrice = await getAVAXPrice(event.blockNumber);
            const paymentUSD = (event.returnValues.payment / (10 ** tokenCache.decimals)) * tokenDerivedAVAX * avaxPrice;
            console.log(`Paid ${payee} ${payment / (10 ** tokenCache.decimals)} ${tokenCache.symbol} in block ${event.blockNumber} (${event.blockHash})`);
            payments.push({
                epoch,
                // blockNumber: event.blockNumber,
                // blockHash: event.blockHash,
                payee,
                payment,
                paymentUSD,
                token: tokenCache.address,
            });
        }
    }
    console.log(`Processed ranges ${++processedRangeCount} of ${blockRanges.length} (${(processedRangeCount / blockRanges.length * 100).toFixed(1)}%)`);
}

async function getTokenInfo(address) {
    if (tokenInfoCache[address]) return tokenInfoCache[address];

    const contract = new web3.eth.Contract(ABI.ERC20, address);
    return tokenInfoCache[address] = {
        address,
        contract,
        decimals: parseInt(await contract.methods.decimals().call()),
        symbol: await contract.methods.symbol().call(),
    };
}

async function getDerivedAVAX(tokenAddress, blockNumber) {
    const { data: { data: { token } } } = await axios({
        url: CONFIG.SUBGRAPH,
        method: 'post',
        data: {
            query: `query {
                token(
                    id: "${tokenAddress.toLowerCase()}"
                    block: { number: ${blockNumber} }
                ) {
                    derivedETH
                }
            }`
        }
    });
    return parseFloat(token.derivedETH);
}


async function getAVAXPrice(blockNumber) {
    if (avaxPriceCache[blockNumber]) return avaxPriceCache[blockNumber];

    const { data: { data: { bundle } } } = await axios({
        url: CONFIG.SUBGRAPH,
        method: 'post',
        data: {
            query: `query {
                bundle(
                    id: 1
                    block: { number: ${blockNumber} }
                ) {
                    ethPrice
                }
            }`
        }
    });

    return avaxPriceCache[blockNumber] = parseFloat(bundle.ethPrice);
}
