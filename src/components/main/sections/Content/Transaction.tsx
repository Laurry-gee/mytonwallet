import type { Ref, RefObject } from 'react';
import React, { memo } from '../../../../lib/teact/teact';

import type { ApiToken, ApiTransaction } from '../../../../api/types';

import { CARD_SECONDARY_VALUE_SYMBOL } from '../../../../config';
import { bigStrToHuman, getIsTxIdLocal } from '../../../../global/helpers';
import buildClassName from '../../../../util/buildClassName';
import { formatTime } from '../../../../util/dateFormat';
import { formatCurrencyExtended } from '../../../../util/formatNumber';
import { shortenAddress } from '../../../../util/shortenAddress';

import useLang from '../../../../hooks/useLang';
import useLastCallback from '../../../../hooks/useLastCallback';

import Button from '../../../ui/Button';

import styles from './Transaction.module.scss';

import scamImg from '../../../../assets/scam.svg';

type OwnProps = {
  ref?: Ref<HTMLElement>;
  tokensBySlug?: Record<string, ApiToken>;
  transaction: ApiTransaction;
  apyValue: number;
  savedAddresses?: Record<string, string>;
  onClick: (txId: string) => void;
};

function Transaction({
  ref,
  tokensBySlug,
  transaction,
  apyValue,
  savedAddresses,
  onClick,
}: OwnProps) {
  const lang = useLang();

  const {
    txId,
    amount,
    fromAddress,
    toAddress,
    timestamp,
    comment,
    encryptedComment,
    isIncoming,
    type,
    metadata,
    slug,
  } = transaction;

  const isStake = type === 'stake';
  const isUnstake = type === 'unstake';
  const isUnstakeRequest = type === 'unstakeRequest';
  const isStaking = isStake || isUnstake || isUnstakeRequest;

  const token = tokensBySlug?.[slug];
  const amountHuman = bigStrToHuman(amount, token!.decimals);
  const address = isIncoming ? fromAddress : toAddress;
  const addressName = savedAddresses?.[address] || metadata?.name;
  const isLocal = getIsTxIdLocal(txId);
  const isScam = Boolean(metadata?.isScam);

  const handleClick = useLastCallback(() => {
    onClick(txId);
  });

  function getOperationName() {
    if (isStake) {
      return 'Staked';
    }

    if (isUnstakeRequest) {
      return 'Unstake Requested';
    }

    if (isUnstake) {
      return 'Unstaked';
    }

    return isIncoming ? 'Received' : 'Sent';
  }

  function renderComment() {
    if (isStaking || isScam || (!comment && !encryptedComment)) {
      return undefined;
    }

    return (
      <div
        className={buildClassName(
          styles.comment,
          isIncoming ? styles.comment_incoming : styles.comment_outgoing,
        )}
      >
        {encryptedComment && <i className={buildClassName(styles.commentIcon, 'icon-lock')} aria-hidden />}
        {encryptedComment ? <i>{lang('Encrypted Message')}</i> : comment}
      </div>
    );
  }

  const stakeIconClass = buildClassName(
    isStaking && 'icon-earn',
    isStake && styles.icon_purple,
    isStaking && styles.icon_staking,
    !isStaking && (isIncoming ? 'icon-receive-alt' : 'icon-send-alt'),
  );

  const iconFullClass = buildClassName(
    styles.icon,
    isIncoming && styles.icon_operationPositive,
    stakeIconClass,
  );

  function renderAmount() {
    const amountOtherClass = buildClassName(
      styles.amount,
      isIncoming
        ? styles.amount_operationPositive
        : (isStake ? styles.amount_stake : styles.amount_operationNegative),
    );

    return (
      <div className={styles.amountWrapper}>
        <div className={amountOtherClass}>
          {formatCurrencyExtended(
            isStaking ? Math.abs(amountHuman) : amountHuman,
            token?.symbol || CARD_SECONDARY_VALUE_SYMBOL,
            isStaking,
          )}
        </div>
        <div className={styles.address}>
          {!isStaking && lang(isIncoming ? '$transaction_from' : '$transaction_to', {
            address: <span className={styles.addressValue}>{addressName || shortenAddress(address)}</span>,
          })}
          {isStake && lang('at APY %1$s%', apyValue)}
          {(isUnstake || isUnstakeRequest) && '\u00A0'}
        </div>
      </div>
    );
  }

  return (
    <Button
      ref={ref as RefObject<HTMLButtonElement>}
      key={txId}
      className={styles.item}
      onClick={handleClick}
      isSimple
    >
      <i className={iconFullClass} aria-hidden />
      {isLocal && (
        <i
          className={buildClassName(styles.iconWaiting, 'icon-clock')}
          title={lang('Transaction is not completed')}
        />
      )}
      <div className={styles.leftBlock}>
        <div className={styles.operationName}>
          {lang(getOperationName())}
          {isScam && <img src={scamImg} alt={lang('Scam')} className={styles.scamImage} />}
        </div>
        <div className={styles.date}>{formatTime(timestamp)}</div>
      </div>
      {renderAmount()}
      {renderComment()}
      <i className={buildClassName(styles.iconArrow, 'icon-chevron-right')} aria-hidden />
    </Button>
  );
}

export default memo(Transaction);
