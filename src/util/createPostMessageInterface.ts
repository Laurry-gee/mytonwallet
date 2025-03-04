import { DETACHED_TAB_URL } from './ledger/tab';
import { logDebugError } from './logs';

import type {
  ApiUpdate,
  CancellableCallback, OriginMessageData, OriginMessageEvent, WorkerMessageData,
} from './PostMessageConnector';

declare const self: WorkerGlobalScope;

const callbackState = new Map<string, CancellableCallback>();

type ApiConfig =
  ((name: string, ...args: any[]) => any | [any, ArrayBuffer[]])
  | Record<string, Function>;
type SendToOrigin = (data: WorkerMessageData, transferables?: Transferable[]) => void;

export function createWorkerInterface(api: ApiConfig, channel?: string) {
  function sendToOrigin(data: WorkerMessageData, transferables?: Transferable[]) {
    data.channel = channel;

    if (transferables) {
      postMessage(data, transferables);
    } else {
      postMessage(data);
    }
  }

  handleErrors(sendToOrigin);

  onmessage = (message: OriginMessageEvent) => {
    if (message.data?.channel === channel) {
      onMessage(api, message.data, sendToOrigin);
    }
  };
}

export function createExtensionInterface(
  portName: string,
  api: ApiConfig,
  channel?: string,
  cleanUpdater?: (onUpdate: (update: ApiUpdate) => void) => void,
  withAutoInit = false,
) {
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== portName) {
      return;
    }

    /**
     * If the sender's URL includes the DETACHED_TAB_URL, we skip further processing
     * This condition ensures that we don't interact with tabs that have already been closed.
     */
    const url = port.sender?.url;
    if (url?.includes(DETACHED_TAB_URL)) {
      return;
    }

    const origin = url ? new URL(url).origin : undefined;

    const dAppUpdater = (update: ApiUpdate) => {
      sendToOrigin({
        type: 'update',
        update,
      });
    };

    function sendToOrigin(data: WorkerMessageData) {
      data.channel = channel;
      port.postMessage(data);
    }

    handleErrors(sendToOrigin);

    port.onMessage.addListener((data: OriginMessageData) => {
      if (data.channel === channel) {
        onMessage(api, data, sendToOrigin, dAppUpdater, origin);
      }
    });

    port.onDisconnect.addListener(() => {
      cleanUpdater?.(dAppUpdater);
    });

    if (withAutoInit) {
      onMessage(api, { type: 'init', name: 'init', args: [] }, sendToOrigin, dAppUpdater);
    }
  });
}

async function onMessage(
  api: ApiConfig,
  data: OriginMessageData,
  sendToOrigin: SendToOrigin,
  onUpdate?: (update: ApiUpdate) => void,
  origin?: string,
) {
  if (!onUpdate) {
    onUpdate = (update: ApiUpdate) => {
      sendToOrigin({
        type: 'update',
        update,
      });
    };
  }

  switch (data.type) {
    case 'init': {
      const { args } = data;
      const promise = typeof api === 'function'
        ? api('init', origin, onUpdate, ...args)
        : api.init?.(onUpdate, ...args);
      await promise;

      break;
    }
    case 'callMethod': {
      const {
        messageId, name, args, withCallback,
      } = data;
      try {
        if (messageId && withCallback) {
          const callback = (...callbackArgs: any[]) => {
            const lastArg = callbackArgs[callbackArgs.length - 1];

            sendToOrigin({
              type: 'methodCallback',
              messageId,
              callbackArgs,
            }, isTransferable(lastArg) ? [lastArg] : undefined);
          };

          callbackState.set(messageId, callback);

          args.push(callback as never);
        }

        const response = typeof api === 'function'
          ? await api(name, origin, ...args)
          : await api[name](...args);
        const { arrayBuffer } = (typeof response === 'object' && 'arrayBuffer' in response && response) || {};

        if (messageId) {
          sendToOrigin(
            {
              type: 'methodResponse',
              messageId,
              response,
            },
            arrayBuffer ? [arrayBuffer] : undefined,
          );
        }
      } catch (err: any) {
        logDebugError('onMessage:callMethod', err);

        if (messageId) {
          sendToOrigin({
            type: 'methodResponse',
            messageId,
            error: { message: err.message },
          });
        }
      }

      if (messageId) {
        callbackState.delete(messageId);
      }

      break;
    }
    case 'cancelProgress': {
      const callback = callbackState.get(data.messageId);
      if (callback) {
        callback.isCanceled = true;
      }

      break;
    }
  }
}

function isTransferable(obj: any) {
  return obj instanceof ArrayBuffer || obj instanceof ImageBitmap;
}

function handleErrors(sendToOrigin: SendToOrigin) {
  self.onerror = (e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    sendToOrigin({ type: 'unhandledError', error: { message: e.error?.message || 'Uncaught exception in worker' } });
  };

  self.addEventListener('unhandledrejection', (e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    sendToOrigin({ type: 'unhandledError', error: { message: e.reason?.message || 'Uncaught rejection in worker' } });
  });
}
