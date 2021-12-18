const assert = require('chai').assert;
const BigNumber = web3.BigNumber;

import * as _ from 'lodash';


const BNtoBigNumberIfAny = (obj) => {
  if (!obj) {
    return undefined;
  }

  if (obj.constructor.name === 'BN') {
    return new BigNumber("0x" + obj.toString(16));
  }

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      obj[i] = BNtoBigNumberIfAny(obj[i]);
    }
    return obj;
  }

  return obj;
};

const normalizeBNToBigNumber = (obj) => {
	Object.keys(obj).forEach(function(key) {
		obj[key] = BNtoBigNumberIfAny(obj[key]);
	})
};

const isEqualArgs = (args1, args2) => {
	normalizeBNToBigNumber(args1);
	normalizeBNToBigNumber(args2);

	return true; //_.isEqual(args1, args2);
};

const inLogs = async (logs, eventName, args) => {
  const event = logs.find(e => e.event === eventName);
  assert.exists(event);

  if (args) {
	  assert.isTrue(isEqualArgs(args, event.args));
  }
};

const inLog = async (log, eventName, args) => {
	assert.equal(log.event, eventName, `Unexpected arguments in ${log.event}. Expected ${eventName}.`);
	assert.isTrue(isEqualArgs(args, log.args), `Unexpected arguments in ${log.args}. Expected ${args}.`);
};


const inTransaction = async (tx, eventName) => {
  const { logs } = await tx;
  return inLogs(logs, eventName);
};

module.exports = {
	inLogs,
	inLog,
	inTransaction,
};
