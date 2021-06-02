const { ethers } = require("hardhat");
const chai = require("chai");
const { expect } = chai;
const { smoddit } = require('@eth-optimism/smock');


describe("Splitter", function() {
  let splitter;
  let erc20;
  let amount_erc20;
  let signers;

  beforeEach(async () => {
    signers = await ethers.getSigners();

    const DummyERC20 = await smoddit("ERC20");
    erc20 = await DummyERC20.deploy("Dummy Token", "ERC20");
    await erc20.deployed();

    const Splitter = await ethers.getContractFactory("Splitter");
    splitter = await Splitter.deploy();
    await splitter.deployed();

    const balance = '1000000' + '0'.repeat(18);
    await erc20.smodify.put({
      _balances: {
        [signers[0].address]: balance
      }
    });
    amount_erc20 = await erc20.balanceOf(signers[0].address);
    expect(amount_erc20).to.equal(balance);

    await erc20.approve(splitter.address, balance);
  });

  describe('Pay', async function() {
    it("Cannot pay with more payees than amounts", async function() {
      const payees = signers.map(s => s.address);
      const amounts = payees.map(p => ethers.constants.AddressZero).splice(0, 1);

      expect(payees.length).to.be.greaterThan(amounts.length);

      await expect(splitter.pay(erc20.address, payees, amounts))
        .to.be.revertedWith('Splitter::pay: INVALID_INPUT_LENGTH');
    });

    it("Cannot pay with more amounts than payees", async function() {
      const payees = signers.map(s => s.address);
      const amounts = payees.map(p => ethers.constants.AddressZero);
      amounts.push(ethers.constants.AddressZero);

      expect(amounts.length).to.be.greaterThan(payees.length);

      await expect(splitter.pay(erc20.address, payees, amounts))
        .to.be.revertedWith('Splitter::pay: INVALID_INPUT_LENGTH');
    });

    it("Reverts when exceeding total balance", async function() {
      const payees = [signers[1].address, signers[2].address];
      const amounts = [amount_erc20, amount_erc20];

      await expect(splitter.pay(erc20.address, payees, amounts))
        .to.be.revertedWith("ERC20: transfer amount exceeds balance");

      expect(await erc20.balanceOf(payees[0])).to.equal(0);
      expect(await erc20.balanceOf(payees[1])).to.equal(0);
    });

    it("Reverts when exceeding total allowance", async function() {
      const quarterAmount = amount_erc20.div(4);
      const payees = [signers[1].address, signers[2].address];
      const amounts = [quarterAmount, quarterAmount];

      await erc20.approve(splitter.address, quarterAmount.mul(2).sub(1));

      await expect(splitter.pay(erc20.address, payees, amounts))
        .to.be.revertedWith("ERC20: transfer amount exceeds allowance");

      expect(await erc20.balanceOf(payees[0])).to.equal(0);
      expect(await erc20.balanceOf(payees[1])).to.equal(0);
    });

    it("Can pay one address", async function() {
      const amount = amount_erc20.sub(1);
      const payees = [signers[1].address];
      const amounts = [amount];

      await expect(splitter.pay(erc20.address, payees, amounts));

      expect(await erc20.balanceOf(payees[0])).to.equal(amounts[0]);
    });

    it("Can pay two addresses with different amounts", async function() {
      const halfAmount = amount_erc20.div(2);
      const payees = [signers[1].address, signers[2].address];
      const amounts = [halfAmount, halfAmount];

      await expect(splitter.pay(erc20.address, payees, amounts));

      expect(await erc20.balanceOf(payees[0])).to.equal(amounts[0]);
      expect(await erc20.balanceOf(payees[1])).to.equal(amounts[1]);
    });
  });

  describe('Pay AVAX', async function() {
    it("Cannot pay with more payees than amounts", async function() {
      const payees = signers.map(s => s.address);
      const amounts = payees.map(p => ethers.constants.AddressZero).splice(0, 1);

      expect(payees.length).to.be.greaterThan(amounts.length);

      await expect(splitter.payAVAX(payees, amounts))
        .to.be.revertedWith('Splitter::payAVAX: INVALID_INPUT_LENGTH');
    });

    it("Cannot pay with more amounts than payees", async function() {
      const payees = signers.map(s => s.address);
      const amounts = payees.map(p => ethers.constants.AddressZero);
      amounts.push(ethers.constants.AddressZero);

      expect(amounts.length).to.be.greaterThan(payees.length);

      await expect(splitter.payAVAX(payees, amounts))
        .to.be.revertedWith('Splitter::payAVAX: INVALID_INPUT_LENGTH');
    });

    it("Reverts when exceeding total balance", async function() {
      const amount = await ethers.provider.getBalance(signers[0].address);
      const payees = [signers[1].address, signers[2].address];
      const amounts = [amount, amount];

      await expect(splitter.payAVAX(payees, amounts))
        .to.be.revertedWith("Address: insufficient balance");
    });

    it("Can pay one address", async function() {
      const amount = (await ethers.provider.getBalance(signers[0].address)).div(4);
      const payees = [signers[1].address];
      const amounts = [amount];

      const balanceBefore = await ethers.provider.getBalance(payees[0]);

      await expect(splitter.payAVAX(payees, amounts, { value: amount }));

      await ethers.provider.send("evm_mine");

      expect(await ethers.provider.getBalance(payees[0])).to.equal(balanceBefore.add(amounts[0]));
    });

    it("Can pay two addresses with different amounts", async function() {
      const amount = (await ethers.provider.getBalance(signers[0].address)).div(4);
      const payees = [signers[1].address, signers[2].address];
      const amounts = [amount.sub(1), amount.add(1)];

      const balance0Before = await ethers.provider.getBalance(payees[0]);
      const balance1Before = await ethers.provider.getBalance(payees[1]);

      await expect(splitter.payAVAX(payees, amounts, { value: amounts[0].add(amounts[1]) }));

      await ethers.provider.send("evm_mine");

      expect(await ethers.provider.getBalance(payees[0])).to.equal(balance0Before.add(amounts[0]));
      expect(await ethers.provider.getBalance(payees[1])).to.equal(balance1Before.add(amounts[1]));
    });
  });

  describe('Distribute', async function() {
    it("Reverts when exceeding total balance", async function() {
      const payees = [signers[1].address, signers[2].address];

      await expect(splitter.distribute(erc20.address, amount_erc20, payees))
        .to.be.revertedWith("Splitter::distribute: INSUFFICIENT_BALANCE");

      expect(await erc20.balanceOf(payees[0])).to.equal(0);
      expect(await erc20.balanceOf(payees[1])).to.equal(0);
    });

    it("Reverts when exceeding total allowance", async function() {
      const quarterAmount = amount_erc20.div(4);
      const payees = [signers[1].address, signers[2].address];

      await erc20.approve(splitter.address, quarterAmount.mul(2).sub(1));

      await expect(splitter.distribute(erc20.address, quarterAmount, payees))
        .to.be.revertedWith("Splitter::distribute: INSUFFICIENT_ALLOWANCE");

      expect(await erc20.balanceOf(payees[0])).to.equal(0);
      expect(await erc20.balanceOf(payees[1])).to.equal(0);
    });

    it("Can pay one address", async function() {
      const payees = [signers[1].address];

      await expect(splitter.distribute(erc20.address, amount_erc20, payees));

      expect(await erc20.balanceOf(payees[0])).to.equal(amount_erc20);
    });

    it("Can pay two addresses", async function() {
      const halfAmount = amount_erc20.div(2);
      const payees = [signers[1].address, signers[2].address];

      await expect(splitter.distribute(erc20.address, halfAmount, payees));

      expect(await erc20.balanceOf(payees[0])).to.equal(halfAmount);
      expect(await erc20.balanceOf(payees[1])).to.equal(halfAmount);
    });
  });

  describe('Distribute AVAX', async function() {
    it("Reverts when exceeding total balance", async function() {
      const amount = await ethers.provider.getBalance(signers[0].address);
      const payees = [signers[1].address, signers[2].address];

      const balance0Before = await ethers.provider.getBalance(payees[0]);
      const balance1Before = await ethers.provider.getBalance(payees[1]);

      await expect(splitter.distributeAVAX(amount, payees))
        .to.be.revertedWith("Splitter::distributeAVAX: INSUFFICIENT_BALANCE");

      expect(await ethers.provider.getBalance(payees[0])).to.equal(balance0Before);
      expect(await ethers.provider.getBalance(payees[1])).to.equal(balance1Before);
    });

    it("Can pay one address", async function() {
      const amount = (await ethers.provider.getBalance(signers[0].address)).div(2);
      const payees = [signers[1].address];

      const balanceBefore = await ethers.provider.getBalance(payees[0]);

      await expect(splitter.distributeAVAX(amount, payees, { value: amount }));

      await ethers.provider.send("evm_mine");

      expect(await ethers.provider.getBalance(payees[0])).to.equal(balanceBefore.add(amount));
    });

    it("Can pay two addresses", async function() {
      const amount = (await ethers.provider.getBalance(signers[0].address)).div(4);
      const payees = [signers[1].address, signers[2].address];

      const balance0Before = await ethers.provider.getBalance(payees[0]);
      const balance1Before = await ethers.provider.getBalance(payees[1]);

      await expect(splitter.distributeAVAX(amount, payees, { value: amount.mul(2) }));

      await ethers.provider.send("evm_mine");

      expect(await ethers.provider.getBalance(payees[0])).to.equal(balance0Before.add(amount));
      expect(await ethers.provider.getBalance(payees[1])).to.equal(balance1Before.add(amount));
    });
  });
});
