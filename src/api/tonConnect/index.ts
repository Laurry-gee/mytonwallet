// eslint-disable-next-line max-classes-per-file
import TonWeb from 'tonweb';
import type {
  ConnectEventError,
  ConnectItemReply,
  ConnectRequest,
  DisconnectEvent,
  DisconnectRpcRequest,
  SendTransactionRpcRequest,
  SendTransactionRpcResponse,
  SignDataRpcRequest,
  TonProofItem,
  TonProofItemReplySuccess,
} from '@tonconnect/protocol';
import { CHAIN } from '@tonconnect/protocol';
import nacl from 'tweetnacl';

import { ApiTransactionError } from '../types';
import { CONNECT_EVENT_ERROR_CODES, SEND_TRANSACTION_ERROR_CODES, SIGN_DATA_ERROR_CODES } from './types';
import type {
  ApiAnyDisplayError,
  ApiDappMetadata,
  ApiDappRequest,
  ApiNetwork,
  ApiSignedTransfer,
  ApiTransactionDraftError,
  OnApiUpdate,
} from '../types';
import type {
  ApiTonConnectProof, LocalConnectEvent, TransactionPayload, TransactionPayloadMessage,
} from './types';

import { IS_EXTENSION, TON_TOKEN_SLUG } from '../../config';
import { parseAccountId } from '../../util/account';
import { isValidLedgerComment } from '../../util/ledger/utils';
import { logDebugError } from '../../util/logs';
import blockchains from '../blockchains';
import { parsePayloadBase64 } from '../blockchains/ton';
import { fetchKeyPair } from '../blockchains/ton/auth';
import { LEDGER_SUPPORTED_PAYLOADS } from '../blockchains/ton/constants';
import { toBase64Address, toRawAddress } from '../blockchains/ton/util/tonweb';
import {
  fetchStoredAccount, fetchStoredAddress, fetchStoredPublicKey, getCurrentAccountId, getCurrentAccountIdOrFail,
} from '../common/accounts';
import { createDappPromise } from '../common/dappPromises';
import { createLocalTransaction, isUpdaterAlive } from '../common/helpers';
import {
  base64ToBytes, bytesToBase64, handleFetchErrors, sha256,
} from '../common/utils';
import * as apiErrors from '../errors';
import {
  activateDapp,
  addDapp,
  deactivateAccountDapp,
  deactivateDapp,
  deleteDapp,
  findLastConnectedAccount,
  getDappsByOrigin,
  isDappConnected, updateDapp,
} from '../methods/dapps';
import * as errors from './errors';
import { BadRequestError } from './errors';
import { isValidString, isValidUrl } from './utils';

import { callHook } from '../hooks';

const { Address } = TonWeb.utils;

const ton = blockchains.ton;

let resolveInit: AnyFunction;
const initPromise = new Promise((resolve) => {
  resolveInit = resolve;
});

let onPopupUpdate: OnApiUpdate;

export function initTonConnect(_onPopupUpdate: OnApiUpdate) {
  onPopupUpdate = _onPopupUpdate;
  resolveInit();
}

export async function connect(
  request: ApiDappRequest,
  message: ConnectRequest,
  id: number,
): Promise<LocalConnectEvent> {
  try {
    const { origin } = await validateRequest(request, true);
    const dapp = {
      ...await fetchDappMetadata(origin, message.manifestUrl),
      connectedAt: Date.now(),
      ...('sseOptions' in request && { sse: request.sseOptions }),
    };

    const addressItem = message.items.find(({ name }) => name === 'ton_addr');
    const proofItem = message.items.find(({ name }) => name === 'ton_proof') as TonProofItem | undefined;
    const proof = proofItem ? {
      timestamp: Math.round(Date.now() / 1000),
      domain: new URL(origin).host,
      payload: proofItem.payload,
    } : undefined;

    if (!addressItem) {
      throw new errors.BadRequestError("Missing 'ton_addr'");
    }

    const isOpened = await openExtensionPopup();
    let accountId = await getCurrentAccountOrFail();
    const isConnected = await isDappConnected(accountId, origin);

    let promiseResult: {
      accountId?: string;
      password?: string;
      signature?: string;
    } | undefined;

    if (!isConnected || proof) {
      if (!isOpened) {
        await openExtensionPopup(true);
      }

      const { promiseId, promise } = createDappPromise();

      onPopupUpdate({
        type: 'dappConnect',
        promiseId,
        accountId,
        dapp,
        permissions: {
          address: true,
          proof: !!proof,
        },
        proof,
      });

      promiseResult = await promise;

      accountId = promiseResult!.accountId!;
      await addDapp(accountId, dapp);
    }

    const result = await reconnect(request, id);

    if (result.event === 'connect' && proof) {
      const address = await fetchStoredAddress(accountId);
      const { password, signature } = promiseResult!;

      let proofReplyItem: TonProofItemReplySuccess;
      if (password) {
        proofReplyItem = await signTonProof(accountId, password!, address, proof!);
      } else {
        proofReplyItem = buildTonProofReplyItem(proof, signature!);
      }

      result.payload.items.push(proofReplyItem);
    }

    return result;
  } catch (err) {
    logDebugError('tonConnect:connect', err);
    return formatConnectError(id, err as Error);
  }
}

export async function reconnect(request: ApiDappRequest, id: number): Promise<LocalConnectEvent> {
  try {
    const { origin, accountId } = await validateRequest(request);

    activateDapp(accountId, origin);
    await updateDapp(accountId, origin, (dapp) => ({ ...dapp, connectedAt: Date.now() }));

    const address = await fetchStoredAddress(accountId);
    const items: ConnectItemReply[] = [
      await buildTonAddressReplyItem(accountId, address),
    ];

    return {
      event: 'connect',
      id,
      payload: { items },
    };
  } catch (e) {
    logDebugError('tonConnect:reconnect', e);
    return formatConnectError(id, e as Error);
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function disconnect(request: ApiDappRequest, message: DisconnectRpcRequest): Promise<DisconnectEvent> {
  try {
    const { origin, accountId } = await validateRequest(request);

    await deleteDapp(accountId, origin, true);
    deactivateAccountDapp(accountId);
  } catch (err) {
    logDebugError('tonConnect:disconnect', err);
  }
  return {
    event: 'disconnect',
    id: Number(message.id),
    payload: {},
  };
}

export async function sendTransaction(
  request: ApiDappRequest,
  message: SendTransactionRpcRequest,
): Promise<SendTransactionRpcResponse> {
  try {
    const { origin, accountId } = await validateRequest(request);

    const txPayload = JSON.parse(message.params[0]) as TransactionPayload;
    const messages = txPayload.messages.slice(0, 3);
    let validUntil = txPayload.valid_until;
    if (validUntil && validUntil > 10 ** 10) {
      // If milliseconds were passed instead of seconds
      validUntil = Math.round(validUntil / 1000);
    }

    const { network } = parseAccountId(accountId);
    const account = await fetchStoredAccount(accountId);
    const isLedger = !!account?.ledger;

    await openExtensionPopup(true);

    const { preparedMessages, checkResult } = await checkTransactionMessages(accountId, messages);

    const dapp = (await getDappsByOrigin(accountId))[origin];
    const transactionsForRequest = await prepareTransactionForRequest(network, messages, isLedger);

    const { promiseId, promise } = createDappPromise();

    onPopupUpdate({
      type: 'dappSendTransactions',
      promiseId,
      accountId,
      dapp,
      transactions: transactionsForRequest,
      fee: checkResult.fee!,
    });

    // eslint-disable-next-line prefer-const
    const response: string | ApiSignedTransfer[] = await promise;

    if (validUntil && validUntil < (Date.now() / 1000)) {
      throw new errors.BadRequestError('The confirmation timeout has expired');
    }

    let submitResult: any | { error: string };
    let successNumber: number;

    if (isLedger) {
      submitResult = await ton.sendSignedMessages(accountId, response as ApiSignedTransfer[]);
      successNumber = submitResult.successNumber;
      if (successNumber > 0) {
        if (successNumber < messages.length) {
          onPopupUpdate({
            type: 'showError',
            error: ApiTransactionError.PartialTransactionFailure,
          });
        }
      } else {
        submitResult = { error: 'Failed transfers' };
      }
    } else {
      const password = response as string;
      successNumber = messages.length;
      submitResult = await ton.submitMultiTransfer(accountId, password!, preparedMessages, validUntil);
    }

    if ('error' in submitResult) {
      throw new errors.UnknownError(submitResult.error);
    }

    const fromAddress = await fetchStoredAddress(accountId);
    const successTransactions = transactionsForRequest.slice(0, successNumber);

    successTransactions.forEach(({ amount, resolvedAddress, payload }) => {
      const comment = payload?.type === 'comment' ? payload.comment : undefined;
      createLocalTransaction(onPopupUpdate, accountId, {
        amount,
        fromAddress,
        toAddress: resolvedAddress,
        comment,
        fee: checkResult.fee!,
        slug: TON_TOKEN_SLUG,
      });
    });

    return {
      result: 'ok',
      id: message.id,
    };
  } catch (err) {
    logDebugError('tonConnect:sendTransaction', err);

    let code = SEND_TRANSACTION_ERROR_CODES.UNKNOWN_ERROR;
    let errorMessage = 'Unhandled error';
    let displayError: ApiAnyDisplayError | undefined;

    if (err instanceof apiErrors.ApiUserRejectsError) {
      code = SEND_TRANSACTION_ERROR_CODES.USER_REJECTS_ERROR;
      errorMessage = err.message;
    } else if (err instanceof errors.TonConnectError) {
      code = err.code;
      errorMessage = err.message;
      displayError = err.displayError;
    } else {
      displayError = ApiTransactionError.Unexpected;
    }

    if (onPopupUpdate && isUpdaterAlive(onPopupUpdate) && displayError) {
      onPopupUpdate({
        type: 'showError',
        error: displayError,
      });
    }
    return {
      error: {
        code,
        message: errorMessage,
      },
      id: message.id,
    };
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function signData(request: ApiDappRequest, message: SignDataRpcRequest) {
  return {
    error: {
      code: SIGN_DATA_ERROR_CODES.METHOD_NOT_SUPPORTED,
      message: 'Method not supported',
    },
    id: message.id,
  };
}

async function checkTransactionMessages(accountId: string, messages: TransactionPayloadMessage[]) {
  const preparedMessages = messages.map((msg) => {
    const {
      address,
      amount,
      payload,
      stateInit,
    } = msg;

    return {
      toAddress: address,
      amount,
      payload: payload ? ton.oneCellFromBoc(base64ToBytes(payload)) : undefined,
      stateInit: stateInit ? ton.oneCellFromBoc(base64ToBytes(stateInit)) : undefined,
    };
  });

  const checkResult = await ton.checkMultiTransactionDraft(accountId, preparedMessages);
  if ('error' in checkResult) {
    handleDraftError(checkResult.error);
  }

  return {
    preparedMessages,
    checkResult,
  };
}

function prepareTransactionForRequest(network: ApiNetwork, messages: TransactionPayloadMessage[], isLedger: boolean) {
  return Promise.all(messages.map(
    async ({
      address,
      amount,
      payload: rawPayload,
      stateInit,
    }) => {
      const isInitialized = await ton.isWalletInitialized(network, address);
      const resolvedAddress = toBase64Address(address);

      // Force non-bounceable for non-initialized recipients
      const toAddress = isInitialized ? resolvedAddress : toBase64Address(address, false);
      const payload = rawPayload ? await parsePayloadBase64(network, toAddress, rawPayload) : undefined;

      if (isLedger && payload) {
        if (
          !LEDGER_SUPPORTED_PAYLOADS.includes(payload.type)
          || (payload.type === 'comment' && !isValidLedgerComment(payload.comment))
          || (payload.type === 'transfer-nft' && !!payload.forwardPayload)
        ) {
          throw new BadRequestError('Unsupported payload', ApiTransactionError.UnsupportedHardwarePayload);
        }
      }

      return {
        resolvedAddress,
        toAddress,
        amount,
        rawPayload,
        payload,
        stateInit,
      };
    },
  ));
}

export async function deactivate(request: ApiDappRequest) {
  try {
    const { origin } = await validateRequest(request, true);

    deactivateDapp(origin);
  } catch (err) {
    logDebugError('tonConnect:deactivate', err);
  }
}

function formatConnectError(id: number, error: Error): ConnectEventError {
  let code = CONNECT_EVENT_ERROR_CODES.UNKNOWN_ERROR;
  let message = 'Unhandled error';

  if (error instanceof apiErrors.ApiUserRejectsError) {
    code = CONNECT_EVENT_ERROR_CODES.USER_REJECTS_ERROR;
    message = error.message;
  } else if (error instanceof errors.TonConnectError) {
    code = error.code;
    message = error.message;
  }

  return {
    id,
    event: 'connect_error',
    payload: {
      code,
      message,
    },
  };
}

async function buildTonAddressReplyItem(accountId: string, address: string): Promise<ConnectItemReply> {
  const { network } = parseAccountId(accountId);
  const [stateInit, publicKey] = await Promise.all([
    ton.getWalletStateInit(accountId),
    fetchStoredPublicKey(accountId),
  ]);
  return {
    name: 'ton_addr',
    address: toRawAddress(address),
    network: network === 'mainnet' ? CHAIN.MAINNET : CHAIN.TESTNET,
    publicKey,
    walletStateInit: stateInit,
  };
}

async function signTonProof(
  accountId: string,
  password: string,
  walletAddress: string,
  proof: ApiTonConnectProof,
): Promise<TonProofItemReplySuccess> {
  const keyPair = await fetchKeyPair(accountId, password);
  const { timestamp, domain, payload } = proof;

  const timestampBuffer = Buffer.allocUnsafe(8);
  timestampBuffer.writeBigInt64LE(BigInt(timestamp));

  const domainBuffer = Buffer.from(domain);
  const domainLengthBuffer = Buffer.allocUnsafe(4);
  domainLengthBuffer.writeInt32LE(domainBuffer.byteLength);

  const address = new Address(walletAddress);

  const addressWorkchainBuffer = Buffer.allocUnsafe(4);
  addressWorkchainBuffer.writeInt32BE(address.wc);

  const addressBuffer = Buffer.concat([
    addressWorkchainBuffer,
    Buffer.from(address.hashPart),
  ]);

  const messageBuffer = Buffer.concat([
    Buffer.from('ton-proof-item-v2/', 'utf8'),
    addressBuffer,
    domainLengthBuffer,
    domainBuffer,
    timestampBuffer,
    Buffer.from(payload),
  ]);

  const bufferToSign = Buffer.concat([
    Buffer.from('ffff', 'hex'),
    Buffer.from('ton-connect', 'utf8'),
    Buffer.from(await sha256(messageBuffer)),
  ]);

  const signature = nacl.sign.detached(
    Buffer.from(await sha256(bufferToSign)),
    keyPair!.secretKey,
  );

  return buildTonProofReplyItem(proof, bytesToBase64(signature));
}

function buildTonProofReplyItem(proof: ApiTonConnectProof, signature: string): TonProofItemReplySuccess {
  const { timestamp, domain, payload } = proof;
  const domainBuffer = Buffer.from(domain);

  return {
    name: 'ton_proof',
    proof: {
      timestamp,
      domain: {
        lengthBytes: domainBuffer.byteLength,
        value: domainBuffer.toString('utf8'),
      },
      signature,
      payload,
    },
  };
}

async function fetchDappMetadata(origin: string, manifestUrl: string): Promise<ApiDappMetadata> {
  try {
    const response = await fetch(manifestUrl);
    handleFetchErrors(response);

    const { url, name, iconUrl } = await response.json();
    if (!isValidUrl(url) || !isValidString(name) || !isValidUrl(iconUrl)) {
      throw new Error('Invalid data');
    }

    return {
      origin,
      url,
      name,
      iconUrl,
      manifestUrl,
    };
  } catch (err) {
    logDebugError('fetchDapp', err);
    throw new errors.ManifestContentError();
  }
}

async function validateRequest(request: ApiDappRequest, skipConnection = false) {
  const { origin } = request;
  if (!origin) {
    throw new errors.BadRequestError('Invalid origin');
  }

  let accountId = '';
  if (request.accountId) {
    accountId = request.accountId;
  } else if (!skipConnection) {
    const { network } = parseAccountId(await getCurrentAccountIdOrFail());
    const lastAccountId = await findLastConnectedAccount(network, origin);
    if (!lastAccountId) {
      throw new errors.BadRequestError('The connection is outdated, try relogin');
    }
    accountId = lastAccountId;
  }

  return { origin, accountId };
}

function handleDraftError(error: ApiTransactionDraftError) {
  onPopupUpdate({
    type: 'showError',
    error,
  });
  throw new errors.BadRequestError(error);
}

async function openExtensionPopup(force?: boolean) {
  if (!IS_EXTENSION || (!force && onPopupUpdate && isUpdaterAlive(onPopupUpdate))) {
    return false;
  }

  await callHook('onWindowNeeded');
  await initPromise;

  return true;
}

async function getCurrentAccountOrFail() {
  const accountId = await getCurrentAccountId();
  if (!accountId) {
    throw new errors.BadRequestError('The user is not authorized in the wallet');
  }
  return accountId;
}
