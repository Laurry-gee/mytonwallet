import React, {
  memo, useEffect, useRef, useState,
} from '../../lib/teact/teact';

import { TONSCAN_BASE_MAINNET_URL, TONSCAN_BASE_TESTNET_URL } from '../../config';
import { getActions, withGlobal } from '../../global';
import { selectCurrentAccountState } from '../../global/selectors';
import buildClassName from '../../util/buildClassName';
import captureKeyboardListeners from '../../util/captureKeyboardListeners';
import { copyTextToClipboard } from '../../util/clipboard';
import { shortenAddress } from '../../util/shortenAddress';

import useFlag from '../../hooks/useFlag';
import useFocusAfterAnimation from '../../hooks/useFocusAfterAnimation';
import useLang from '../../hooks/useLang';
import useLastCallback from '../../hooks/useLastCallback';

import DeleteSavedAddressModal from '../main/modals/DeleteSavedAddressModal';
import Button from './Button';
import Input from './Input';
import Modal from './Modal';
import Transition from './Transition';

import styles from './InteractiveTextField.module.scss';
import modalStyles from './Modal.module.scss';

interface OwnProps {
  address?: string;
  addressName?: string;
  text?: string;
  spoiler?: string;
  spoilerRevealText?: string;
  spoilerCallback?: NoneToVoidFunction;
  copyNotification: string;
  className?: string;
  textClassName?: string;
  noSavedAddress?: boolean;
}

interface StateProps {
  isAddressAlreadySaved?: boolean;
  isTestnet?: boolean;
}

const SAVED_ADDRESS_NAME_MAX_LENGTH = 255;

function InteractiveTextField({
  address,
  addressName,
  text,
  spoiler,
  spoilerRevealText,
  spoilerCallback,
  copyNotification,
  noSavedAddress,
  className,
  textClassName,
  isAddressAlreadySaved,
  isTestnet,
}: OwnProps & StateProps) {
  const { showNotification, addSavedAddress } = getActions();

  // eslint-disable-next-line no-null/no-null
  const addressNameRef = useRef<HTMLInputElement>(null);
  const lang = useLang();
  const [isSaveAddressModalOpen, openSaveAddressModal, closeSaveAddressModal] = useFlag();
  const [isDeleteSavedAddressModalOpen, openDeletedSavedAddressModal, closeDeleteSavedAddressModal] = useFlag();
  const [savedAddressName, setSavedAddressName] = useState<string | undefined>(addressName);
  const [isConcealedWithSpoiler, , revealSpoiler] = useFlag(Boolean(spoiler));

  const tonscanBaseUrl = isTestnet ? TONSCAN_BASE_TESTNET_URL : TONSCAN_BASE_MAINNET_URL;
  const tonscanAddressUrl = address ? `${tonscanBaseUrl}address/${address}` : undefined;

  useEffect(() => {
    if (isSaveAddressModalOpen) {
      setSavedAddressName('');
    }
  }, [isSaveAddressModalOpen]);

  const handleSaveAddressSubmit = useLastCallback(() => {
    if (!savedAddressName || !address) {
      return;
    }

    addSavedAddress({ address, name: savedAddressName });
    showNotification({ message: 'Address was saved!', icon: 'icon-star' });
    closeSaveAddressModal();
  });

  useEffect(() => (
    isSaveAddressModalOpen
      ? captureKeyboardListeners({
        onEnter: handleSaveAddressSubmit,
      })
      : undefined
  ), [handleSaveAddressSubmit, isSaveAddressModalOpen]);

  useFocusAfterAnimation(addressNameRef, !isSaveAddressModalOpen);

  const handleCopy = useLastCallback(() => {
    showNotification({ message: copyNotification, icon: 'icon-copy' });
    copyTextToClipboard(address || text || '');
  });

  const handleRevealSpoiler = useLastCallback(() => {
    revealSpoiler();
    spoilerCallback?.();
  });

  function renderContentOrSpoiler() {
    const content = addressName || address || text;

    if (!spoiler) {
      return renderContent(content);
    }

    const isConcealed = isConcealedWithSpoiler || !content;
    return (
      <Transition activeKey={isConcealed ? 1 : 0} name="fade" className={styles.commentContainer}>
        {isConcealed ? (
          <span className={buildClassName(styles.button, styles.button_spoiler, textClassName)}>
            <i>{spoiler}</i>
            <span
              onClick={handleRevealSpoiler}
              tabIndex={0}
              role="button"
              className={styles.revealSpoiler}
            >
              {spoilerRevealText}
            </span>
          </span>
        ) : renderContent(content)}
      </Transition>
    );
  }

  function renderContent(content?: string) {
    return (
      <span
        className={buildClassName(styles.button, textClassName)}
        title={lang('Copy')}
        onClick={handleCopy}
        tabIndex={0}
        role="button"
      >
        {content}
        {Boolean(addressName) && (
          <span className={styles.shortAddress}>{shortenAddress(address!)}</span>
        )}
        <i className={buildClassName(styles.icon, 'icon-copy')} aria-hidden />
      </span>
    );
  }

  function renderSaveAddressModal() {
    return (
      <Modal
        title={lang('Save Address')}
        isCompact
        isOpen={isSaveAddressModalOpen}
        onClose={closeSaveAddressModal}
      >
        <p>{lang('You can save this address for quick access while sending.')}</p>
        <Input
          ref={addressNameRef}
          placeholder={lang('Name')}
          onInput={setSavedAddressName}
          value={savedAddressName}
          maxLength={SAVED_ADDRESS_NAME_MAX_LENGTH}
          className={styles.nameInput}
        />

        <div className={modalStyles.buttons}>
          <Button onClick={closeSaveAddressModal} className={modalStyles.button}>{lang('Cancel')}</Button>
          <Button
            onClick={handleSaveAddressSubmit}
            isPrimary
            isDisabled={!savedAddressName}
            className={modalStyles.button}
          >
            {lang('Save')}
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <>
      <div className={buildClassName(styles.wrapper, className)}>
        {renderContentOrSpoiler()}

        {!noSavedAddress && address && (
          <span
            className={styles.button}
            title={lang(isAddressAlreadySaved ? 'Remove From Saved Addresses' : 'Add To Saved Addresses')}
            onClick={isAddressAlreadySaved ? openDeletedSavedAddressModal : openSaveAddressModal}
            tabIndex={0}
            role="button"
          >
            <i
              className={buildClassName(
                styles.icon,
                styles.iconStar,
                isAddressAlreadySaved ? 'icon-star-filled' : 'icon-star',
              )}
              aria-hidden
            />
          </span>
        )}

        {address && (
          <a
            href={tonscanAddressUrl}
            className={styles.button}
            title={lang('View Address on TON Explorer')}
            target="_blank"
            rel="noreferrer noopener"
          >
            <i className={buildClassName(styles.icon, 'icon-tonscan')} aria-hidden />
          </a>
        )}
      </div>
      {address && (
        <>
          {renderSaveAddressModal()}
          <DeleteSavedAddressModal
            isOpen={isDeleteSavedAddressModalOpen}
            address={address}
            onClose={closeDeleteSavedAddressModal}
          />
        </>
      )}
    </>
  );
}

export default memo(withGlobal<OwnProps>(
  (global, { address }): StateProps => {
    const accountState = selectCurrentAccountState(global);
    const isAddressAlreadySaved = Boolean(address && accountState?.savedAddresses?.[address]);

    return {
      isAddressAlreadySaved,
      isTestnet: global.settings.isTestnet,
    };
  },
)(InteractiveTextField));
