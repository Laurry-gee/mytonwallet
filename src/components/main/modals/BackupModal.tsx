import React, {
  memo, useEffect, useRef, useState,
} from '../../../lib/teact/teact';

import { getActions, withGlobal } from '../../../global';
import { selectMnemonicForCheck } from '../../../global/actions/api/auth';
import buildClassName from '../../../util/buildClassName';
import { callApi } from '../../../api';

import useLang from '../../../hooks/useLang';
import useLastCallback from '../../../hooks/useLastCallback';

import MnemonicCheck from '../../auth/MnemonicCheck';
import MnemonicList from '../../auth/MnemonicList';
import SafetyRules from '../../auth/SafetyRules';
import Modal from '../../ui/Modal';
import ModalHeader from '../../ui/ModalHeader';
import PasswordForm from '../../ui/PasswordForm';
import Transition from '../../ui/Transition';

import modalStyles from '../../ui/Modal.module.scss';
import styles from './BackupModal.module.scss';

type OwnProps = {
  isOpen?: boolean;
  onClose: () => void;
};

type StateProps = {
  currentAccountId?: string;
};

enum SLIDES {
  confirm,
  password,
  mnemonic,
  check,
}

function BackupModal({
  isOpen, currentAccountId, onClose,
}: OwnProps & StateProps) {
  const { setIsBackupRequired } = getActions();

  const lang = useLang();
  const [currentSlide, setCurrentSlide] = useState<number>(SLIDES.confirm);
  const [nextKey, setNextKey] = useState<number | undefined>(SLIDES.password);
  const [checkIndexes, setCheckIndexes] = useState<number[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const mnemonicRef = useRef<string[] | undefined>(undefined);

  useEffect(() => {
    mnemonicRef.current = undefined;
  }, [isOpen]);

  const handleSafetyConfirm = useLastCallback(() => {
    setCurrentSlide(SLIDES.password);
    setNextKey(SLIDES.mnemonic);
  });

  const handlePasswordSubmit = useLastCallback(async (password: string) => {
    setIsLoading(true);
    mnemonicRef.current = await callApi('getMnemonic', currentAccountId!, password);
    setIsLoading(false);

    if (!mnemonicRef.current) {
      setError('Wrong password, please try again');
      return;
    }

    setNextKey(SLIDES.check);
    setCurrentSlide(SLIDES.mnemonic);
  });

  const handleBackupErrorUpdate = useLastCallback(() => {
    setError(undefined);
  });

  const handleCheckMnemonic = useLastCallback(() => {
    setCheckIndexes(selectMnemonicForCheck());
    setCurrentSlide(SLIDES.check);
    setNextKey(undefined);
  });

  const handleRestartCheckMnemonic = useLastCallback(() => {
    setCurrentSlide(SLIDES.mnemonic);
    setNextKey(SLIDES.check);
  });

  const handleModalClose = useLastCallback(() => {
    setIsLoading(false);
    setError(undefined);
    setCurrentSlide(SLIDES.confirm);
    setNextKey(SLIDES.password);
  });

  const handleCheckMnemonicSubmit = useLastCallback(() => {
    setIsBackupRequired({ isMnemonicChecked: true });
    onClose();
  });

  // eslint-disable-next-line consistent-return
  function renderContent(isActive: boolean, isFrom: boolean, currentKey: number) {
    switch (currentKey) {
      case SLIDES.confirm:
        return (
          <SafetyRules
            isActive={isActive}
            onSubmit={handleSafetyConfirm}
            onClose={onClose}
          />
        );

      case SLIDES.password:
        return (
          <>
            <ModalHeader title={lang('Enter Password')} onClose={onClose} />
            <PasswordForm
              isActive={isActive}
              isLoading={isLoading}
              error={error}
              placeholder={lang('Enter your password')}
              submitLabel={lang('Back Up')}
              onUpdate={handleBackupErrorUpdate}
              onSubmit={handlePasswordSubmit}
              cancelLabel={lang('Cancel')}
              onCancel={onClose}
            />
          </>
        );

      case SLIDES.mnemonic:
        return (
          <MnemonicList
            mnemonic={mnemonicRef.current}
            onNext={handleCheckMnemonic}
            onClose={onClose}
          />
        );

      case SLIDES.check:
        return (
          <MnemonicCheck
            isActive={isActive}
            isInModal
            mnemonic={mnemonicRef.current}
            checkIndexes={checkIndexes}
            buttonLabel={lang('Done')}
            onSubmit={handleCheckMnemonicSubmit}
            onCancel={handleRestartCheckMnemonic}
            onClose={onClose}
          />
        );
    }
  }

  return (
    <Modal
      hasCloseButton
      isOpen={isOpen}
      onClose={onClose}
      onCloseAnimationEnd={handleModalClose}
      dialogClassName={styles.modalDialog}
    >
      <Transition
        name="slideLayers"
        className={buildClassName(modalStyles.transition, 'custom-scroll')}
        slideClassName={modalStyles.transitionSlide}
        activeKey={currentSlide}
        nextKey={nextKey}
      >
        {renderContent}
      </Transition>
    </Modal>
  );
}

export default memo(withGlobal<OwnProps>((global): StateProps => {
  return { currentAccountId: global.currentAccountId };
})(BackupModal));
