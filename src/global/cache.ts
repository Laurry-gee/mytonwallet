import { addCallback, removeCallback, setGlobal } from '../lib/teact/teactn';

import {
  AppState,
} from './types';
import type { GlobalState, TokenPeriod } from './types';

import {
  DEBUG, DEFAULT_DECIMAL_PLACES, GLOBAL_STATE_CACHE_DISABLED, GLOBAL_STATE_CACHE_KEY, IS_ELECTRON, MAIN_ACCOUNT_ID,
} from '../config';
import { buildAccountId, parseAccountId } from '../util/account';
import { cloneDeep, mapValues, pick } from '../util/iteratees';
import {
  onBeforeUnload, onIdle, throttle,
} from '../util/schedulers';
import { getIsTxIdLocal } from './helpers';
import { addActionHandler, getGlobal } from './index';
import { INITIAL_STATE, STATE_VERSION } from './initialState';
import { updateHardware } from './reducers';

import { isHeavyAnimating } from '../hooks/useHeavyAnimationCheck';

const UPDATE_THROTTLE = 5000;
const TXS_LIMIT = 20;
const ANIMATION_DELAY_MS = 320;

const updateCacheThrottled = throttle(() => onIdle(updateCache), UPDATE_THROTTLE, false);

let isCaching = false;
let unsubscribeFromBeforeUnload: NoneToVoidFunction | undefined;

export function initCache() {
  if (GLOBAL_STATE_CACHE_DISABLED) {
    return;
  }

  addActionHandler('afterSignIn', (global, actions) => {
    setGlobal({ ...global, appState: AppState.Main });

    setTimeout(() => {
      actions.restartAuth();
    }, ANIMATION_DELAY_MS);

    if (isCaching) {
      return;
    }
    setupCaching();
  });

  addActionHandler('afterSignOut', (global, actions, payload) => {
    const { isFromAllAccounts } = payload || {};

    if (isFromAllAccounts) {
      setGlobal({
        ...global,
        state: AppState.Auth,
      });

      actions.resetApiSettings({ areAllDisabled: true });

      localStorage.removeItem(GLOBAL_STATE_CACHE_KEY);

      if (!isCaching) {
        return;
      }

      clearCaching();
    }
  });

  addActionHandler('cancelCaching', () => {
    if (!isCaching) {
      return;
    }

    clearCaching();
  });

  addActionHandler('initLedgerPage', (global) => {
    global = updateHardware(global, {
      isRemoteTab: true,
    });
    setGlobal({ ...global, appState: AppState.Ledger });
  });
}

export function loadCache(initialState: GlobalState) {
  return readCache(initialState);
}

function setupCaching() {
  isCaching = true;
  unsubscribeFromBeforeUnload = onBeforeUnload(() => {
    // Allow to manually delete cache
    if (DEBUG && !localStorage.getItem(GLOBAL_STATE_CACHE_KEY)) {
      return;
    }

    updateCache();
  }, true);
  window.addEventListener('blur', updateCache);
  addCallback(updateCacheThrottled);
}

function clearCaching() {
  isCaching = false;
  removeCallback(updateCacheThrottled);
  window.removeEventListener('blur', updateCache);
  if (unsubscribeFromBeforeUnload) {
    unsubscribeFromBeforeUnload();
  }
}

function readCache(initialState: GlobalState): GlobalState {
  if (DEBUG) {
    // eslint-disable-next-line no-console
    console.time('global-state-cache-read');
  }

  const json = localStorage.getItem(GLOBAL_STATE_CACHE_KEY);
  let cached = json ? JSON.parse(json) as GlobalState : undefined;

  if (DEBUG) {
    // eslint-disable-next-line no-console
    console.timeEnd('global-state-cache-read');
  }

  if (cached) {
    try {
      migrateCache(cached, initialState);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);

      cached = undefined;
    }
  }

  return {
    ...initialState,
    ...cached,
  };
}

function migrateCache(cached: GlobalState, initialState: GlobalState) {
  // Pre-fill settings with defaults
  cached.settings = {
    ...initialState.settings,
    ...cached.settings,
  };

  if (cached.stateVersion === STATE_VERSION) {
    return;
  }

  // Migration to multi-accounts
  if (!cached.byAccountId) {
    cached.accounts = {
      byId: {
        [MAIN_ACCOUNT_ID]: {
          address: (cached as any).addresses.byAccountId[MAIN_ACCOUNT_ID],
          title: 'Main Account',
        },
      },
    };

    delete (cached as any).addresses;

    cached.byAccountId = {};
    cached.byAccountId[MAIN_ACCOUNT_ID] = {
      isBackupRequired: Boolean((cached as any).isBackupRequired),
      currentTokenSlug: (cached as any).currentTokenSlug as string,
      currentTokenPeriod: (cached as any).currentTokenPeriod as TokenPeriod,
    };

    if ('balances' in cached) {
      cached.byAccountId[MAIN_ACCOUNT_ID].balances = (cached as any).balances.byAccountId[MAIN_ACCOUNT_ID];
      delete (cached as any).balances;
    }

    if ('transactions' in cached) {
      cached.byAccountId[MAIN_ACCOUNT_ID].transactions = (cached as any).transactions;
      delete (cached as any).transactions;
    }

    if ('nfts' in cached) {
      cached.byAccountId[MAIN_ACCOUNT_ID].nfts = (cached as any).nfts;
      delete (cached as any).nfts;
    }

    if ('savedAddresses' in cached) {
      cached.byAccountId[MAIN_ACCOUNT_ID].savedAddresses = (cached as any).savedAddresses;
      delete (cached as any).savedAddresses;
    }

    if ('backupWallet' in cached) {
      delete (cached as any).backupWallet;
    }
  }

  if (
    (!cached.currentAccountId || !cached.byAccountId[cached.currentAccountId]) && Object.keys(cached.byAccountId).length
  ) {
    cached.currentAccountId = Object.keys(cached.byAccountId)[0];
  }

  // Initializing the v1
  if (!cached.stateVersion && cached.accounts && Object.keys(cached.accounts).length > 0) {
    cached.stateVersion = 1;
  }

  if (cached.stateVersion === 1) {
    cached.stateVersion = 2;

    if (cached.tokenInfo?.bySlug) {
      cached.tokenInfo.bySlug = {
        toncoin: {
          ...cached.tokenInfo.bySlug.toncoin,
          decimals: DEFAULT_DECIMAL_PLACES,
        },
      };
    }

    if (cached.byAccountId) {
      Object.values(cached.byAccountId).forEach((accountState) => {
        if (accountState.balances?.bySlug) {
          accountState.balances.bySlug = pick(accountState.balances!.bySlug, ['toncoin']);
        }
        if (accountState.transactions) {
          delete accountState.transactions;
        }
      });
    }
  }

  if (cached.stateVersion === 2) {
    cached.stateVersion = 3;

    // Normalization of MAIN_ACCOUNT_ID '0' => '0-ton-mainnet'
    const oldId = '0';
    const newId = MAIN_ACCOUNT_ID;
    if (cached.accounts && oldId in cached.accounts.byId) {
      if (cached.currentAccountId === oldId) {
        cached.currentAccountId = newId;
      }
      cached.accounts.byId[newId] = cached.accounts.byId[oldId];
      delete cached.accounts.byId[oldId];
      cached.byAccountId[newId] = cached.byAccountId[oldId];
      delete cached.byAccountId[oldId];
    }

    // Add testnet accounts
    if (cached.accounts) {
      for (const accountId of Object.keys(cached.accounts.byId)) {
        const testnetAccountId = buildAccountId({
          ...parseAccountId(accountId),
          network: 'testnet',
        });
        cached.accounts.byId[testnetAccountId] = cloneDeep(cached.accounts.byId[accountId]);
        cached.byAccountId[testnetAccountId] = {};
      }
    }
  }

  if (cached.stateVersion === 3) {
    cached.stateVersion = 4;

    if (cached.byAccountId) {
      for (const accountId of Object.keys(cached.byAccountId)) {
        delete cached.byAccountId[accountId].transactions;
      }
    }
  }

  if (cached.stateVersion === 4) {
    cached.stateVersion = 5;

    cached.staking = {
      ...initialState.staking,
    };
  }

  if (cached.stateVersion === 5) {
    cached.stateVersion = 6;

    if (cached.byAccountId) {
      for (const accountId of Object.keys(cached.byAccountId)) {
        delete cached.byAccountId[accountId].transactions;
      }
    }
  }

  if (cached.stateVersion === 6) {
    cached.stateVersion = 7;

    if (cached.byAccountId) {
      for (const accountId of Object.keys(cached.byAccountId)) {
        delete cached.byAccountId[accountId].transactions;
      }
    }
  }

  if (cached.stateVersion === 7) {
    if (cached.byAccountId) {
      for (const accountId of Object.keys(cached.byAccountId)) {
        delete (cached.byAccountId[accountId] as any).backupWallet;
      }
    }

    cached.stateVersion = 8;
  }

  if (cached.stateVersion === 8) {
    if (cached.settings && IS_ELECTRON) {
      cached.settings.isDeeplinkHookEnabled = true;
    }

    cached.stateVersion = 9;
  }

  // When adding migration here, increase `STATE_VERSION`
}

function updateCache() {
  if (GLOBAL_STATE_CACHE_DISABLED) {
    return;
  }

  if (!isCaching || isHeavyAnimating()) {
    return;
  }

  const global = getGlobal();
  const reducedGlobal: GlobalState = {
    ...INITIAL_STATE,
    ...pick(global, [
      'tokenInfo',
      'settings',
      'currentAccountId',
      'stateVersion',
      'landscapeActionsActiveTabIndex',
    ]),
    accounts: {
      byId: global.accounts?.byId || {},
    },
    byAccountId: reduceByAccountId(global),
  };

  const json = JSON.stringify(reducedGlobal);
  localStorage.setItem(GLOBAL_STATE_CACHE_KEY, json);
}

function reduceByAccountId(global: GlobalState) {
  return Object.entries(global.byAccountId).reduce((acc, [accountId, state]) => {
    acc[accountId] = pick(state, [
      'balances',
      'isBackupRequired',
      'currentTokenSlug',
      'currentTokenPeriod',
      'savedAddresses',
      'stakingBalance',
      'isUnstakeRequested',
      'poolState',
      'stakingHistory',
    ]);

    const { txIdsBySlug, newestTransactionsBySlug } = state.transactions || {};

    if (txIdsBySlug && Object.keys(txIdsBySlug).length) {
      const reducedTxIdsBySlug = mapValues(txIdsBySlug, (txIds) => txIds.filter(
        (id) => !getIsTxIdLocal(id),
      ).slice(0, TXS_LIMIT));

      acc[accountId].transactions = {
        byTxId: pick(state.transactions!.byTxId, Object.values(reducedTxIdsBySlug).flat()),
        txIdsBySlug: reducedTxIdsBySlug,
        newestTransactionsBySlug,
      };
    }

    return acc;
  }, {} as GlobalState['byAccountId']);
}
