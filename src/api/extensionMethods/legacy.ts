import type { OnApiSiteUpdate } from '../types/dappUpdates';
import type { ApiSignedTransfer, OnApiUpdate } from '../types';

import { TON_TOKEN_SLUG } from '../../config';
import { parseAccountId } from '../../util/account';
import { logDebugError } from '../../util/logs';
import blockchains from '../blockchains';
import {
  fetchStoredAccount, fetchStoredAddress, fetchStoredPublicKey, getCurrentAccountId, getCurrentAccountIdOrFail,
  waitLogin,
} from '../common/accounts';
import { createDappPromise } from '../common/dappPromises';
import { createLocalTransaction } from '../common/helpers';
import { base64ToBytes, hexToBytes } from '../common/utils';
import { openPopupWindow } from './window';

const ton = blockchains.ton;
let onPopupUpdate: OnApiUpdate;

export function initLegacyDappMethods(_onPopupUpdate: OnApiUpdate) {
  onPopupUpdate = _onPopupUpdate;
}

export async function onDappSendUpdates(onDappUpdate: OnApiSiteUpdate) {
  const accounts = await requestAccounts();

  onDappUpdate({
    type: 'updateAccounts',
    accounts,
  });
}

export async function getBalance() {
  const accountId = await getCurrentAccountIdOrFail();

  return ton.getAccountBalance(accountId);
}

export async function requestAccounts() {
  const accountId = await getCurrentAccountId();
  if (!accountId) {
    return [];
  }

  const address = await fetchStoredAddress(accountId);
  return [address];
}

export async function requestWallets() {
  const accountId = await getCurrentAccountId();
  if (!accountId) {
    return [];
  }

  const [address, publicKey, wallet] = await Promise.all([
    fetchStoredAddress(accountId),
    fetchStoredPublicKey(accountId),
    ton.pickAccountWallet(accountId),
  ]);

  return [{
    address,
    publicKey,
    walletVersion: wallet ? ton.resolveWalletVersion(wallet) : undefined,
  }];
}

export async function sendTransaction(params: {
  to: string;
  value: string;
  data?: string;
  dataType?: 'text' | 'hex' | 'base64' | 'boc';
  stateInit?: string;
}) {
  const accountId = await getCurrentAccountIdOrFail();

  const {
    value: amount, to: toAddress, data, dataType, stateInit,
  } = params;

  let processedData;
  if (data) {
    switch (dataType) {
      case 'hex':
        processedData = hexToBytes(data);
        break;
      case 'base64':
        processedData = base64ToBytes(data);
        break;
      case 'boc':
        processedData = ton.oneCellFromBoc(base64ToBytes(data));
        break;
      default:
        processedData = data;
    }
  }

  const processedStateInit = stateInit ? ton.oneCellFromBoc(base64ToBytes(stateInit)) : undefined;

  await openPopupWindow();
  await waitLogin();

  const checkResult = await ton.checkTransactionDraft(
    accountId, TON_TOKEN_SLUG, toAddress, amount, processedData, processedStateInit,
  );

  if ('error' in checkResult) {
    onPopupUpdate({
      type: 'showError',
      error: checkResult.error,
    });

    return false;
  }

  const { promiseId, promise } = createDappPromise();

  const account = await fetchStoredAccount(accountId);
  if (account?.ledger) {
    return sendLedgerTransaction(accountId, promiseId, promise, checkResult.fee!, params);
  }

  onPopupUpdate({
    type: 'createTransaction',
    promiseId,
    toAddress,
    amount,
    fee: checkResult.fee!,
    ...(dataType === 'text' && {
      comment: data,
    }),
  });

  const password = await promise;

  const result = await ton.submitTransfer(
    accountId, password, TON_TOKEN_SLUG, toAddress, amount, processedData, processedStateInit,
  );

  if ('error' in result) {
    return false;
  }

  const fromAddress = await fetchStoredAddress(accountId);
  createLocalTransaction(onPopupUpdate, accountId, {
    amount,
    fromAddress,
    toAddress,
    fee: checkResult.fee!,
    slug: TON_TOKEN_SLUG,
    ...(dataType === 'text' && {
      comment: data,
    }),
  });

  return true;
}

async function sendLedgerTransaction(
  accountId: string,
  promiseId: string,
  promise: Promise<any>,
  fee: string,
  params: {
    to: string;
    value: string;
    data?: string;
    dataType?: 'text' | 'hex' | 'base64' | 'boc';
    stateInit?: string;
  },
) {
  const { network } = parseAccountId(accountId);
  const fromAddress = await fetchStoredAddress(accountId);
  const {
    to: toAddress, value: amount, data, dataType, stateInit,
  } = params;

  let payloadBoc: string | undefined;

  if (data) {
    switch (dataType) {
      case 'hex':
        payloadBoc = await ton.packPayloadToBoc(hexToBytes(data));
        break;
      case 'base64':
        payloadBoc = await ton.packPayloadToBoc(base64ToBytes(data));
        break;
      case 'boc':
        payloadBoc = data;
        break;
      case 'text':
        payloadBoc = await ton.packPayloadToBoc(data);
        break;
      default:
        payloadBoc = undefined;
    }
  }

  const parsedPayload = payloadBoc ? await ton.parsePayloadBase64(network, toAddress, payloadBoc) : undefined;

  onPopupUpdate({
    type: 'createTransaction',
    promiseId,
    toAddress,
    amount,
    fee,
    ...(dataType === 'text' && {
      comment: data,
    }),
    stateInit,
    rawPayload: payloadBoc,
    parsedPayload,
  });

  try {
    const [signedMessage] = await promise as ApiSignedTransfer[];

    await ton.sendSignedMessage(accountId, signedMessage);
  } catch (err) {
    logDebugError('sendLedgerTransaction', err);
    return false;
  }

  createLocalTransaction(onPopupUpdate, accountId, {
    amount,
    fromAddress,
    toAddress,
    fee,
    slug: TON_TOKEN_SLUG,
    ...(dataType === 'text' && {
      comment: data,
    }),
  });

  return true;
}

export async function rawSign({ data }: { data: string }) {
  const accountId = await getCurrentAccountIdOrFail();

  await openPopupWindow();
  await waitLogin();

  const { promiseId, promise } = createDappPromise();

  onPopupUpdate({
    type: 'createSignature',
    promiseId,
    dataHex: data,
  });

  const password = await promise;

  return ton.rawSign(accountId, password, data);
}
