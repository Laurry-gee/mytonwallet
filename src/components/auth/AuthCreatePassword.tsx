import React, {
  memo, useEffect, useRef, useState,
} from '../../lib/teact/teact';

import type { AuthMethod } from '../../global/types';

import { getActions } from '../../global';
import buildClassName from '../../util/buildClassName';
import { ANIMATED_STICKERS_PATHS } from '../ui/helpers/animatedAssets';

import useFlag from '../../hooks/useFlag';
import useFocusAfterAnimation from '../../hooks/useFocusAfterAnimation';
import useLang from '../../hooks/useLang';
import useLastCallback from '../../hooks/useLastCallback';
import { usePasswordValidation } from '../../hooks/usePasswordValidation';

import AnimatedIconWithPreview from '../ui/AnimatedIconWithPreview';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Modal from '../ui/Modal';

import modalStyles from '../ui/Modal.module.scss';
import styles from './Auth.module.scss';

interface OwnProps {
  isActive?: boolean;
  method?: AuthMethod;
  isLoading?: boolean;
}

const AuthCreatePassword = ({
  isActive,
  method,
  isLoading,
}: OwnProps) => {
  const { afterCreatePassword, restartAuth } = getActions();

  const lang = useLang();

  // eslint-disable-next-line no-null/no-null
  const firstInputRef = useRef<HTMLInputElement>(null);
  const [firstPassword, setFirstPassword] = useState<string>('');
  const [secondPassword, setSecondPassword] = useState<string>('');
  const [hasError, setHasError] = useState<boolean>(false);
  const [isJustSubmitted, setIsJustSubmitted] = useState<boolean>(false);
  const [isPasswordFocused, markPasswordFocused, unmarkPasswordFocused] = useFlag(false);
  const [isSecondPasswordFocused, markSecondPasswordFocused, unmarkSecondPasswordFocused] = useFlag(false);
  const [isPasswordsNotEqual, setIsPasswordsNotEqual] = useState<boolean>(false);
  const [isWeakPasswordModalOpen, openWeakPasswordModal, closeWeakPasswordModal] = useFlag(false);
  const canSubmit = firstPassword.length > 0 && secondPassword.length > 0 && !hasError;
  const isImporting = method !== 'createAccount';
  const formId = getFormId(method!);

  const validation = usePasswordValidation({
    firstPassword,
    secondPassword,
  });

  useFocusAfterAnimation(firstInputRef, !isActive);

  useEffect(() => {
    setIsPasswordsNotEqual(false);
    if (firstPassword === '' || !isActive || isPasswordFocused) {
      setHasError(false);
      return;
    }

    const { noEqual } = validation;

    if ((!isSecondPasswordFocused || isJustSubmitted) && noEqual && secondPassword !== '') {
      setHasError(true);
      setIsPasswordsNotEqual(true);
    } else if (!noEqual || secondPassword === '' || (isSecondPasswordFocused && !isJustSubmitted)) {
      setHasError(false);
    }
  }, [
    isActive, firstPassword, secondPassword, validation, isSecondPasswordFocused, isPasswordFocused, isJustSubmitted,
  ]);

  const handleFirstPasswordChange = useLastCallback((value: string) => {
    setFirstPassword(value);
    if (isJustSubmitted) {
      setIsJustSubmitted(false);
    }
  });

  const handleSecondPasswordChange = useLastCallback((value: string) => {
    setSecondPassword(value);
    if (isJustSubmitted) {
      setIsJustSubmitted(false);
    }
  });

  const handleCancel = useLastCallback(() => {
    restartAuth();
  });

  const handleSubmit = useLastCallback((e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!canSubmit) {
      return;
    }

    if (firstPassword !== secondPassword) {
      setIsJustSubmitted(true);
      setHasError(true);
      setIsPasswordsNotEqual(true);
      return;
    }

    const isWeakPassword = Object.values(validation).find((rule) => rule);

    if (isWeakPassword && !isWeakPasswordModalOpen) {
      openWeakPasswordModal();
      return;
    }

    if (isWeakPasswordModalOpen) {
      closeWeakPasswordModal();
    }
    afterCreatePassword({ password: firstPassword });
  });

  const shouldRenderError = hasError && !isPasswordFocused;

  function renderErrors() {
    if (isPasswordsNotEqual) {
      return (
        <div className={buildClassName(styles.errors, styles.error)}>
          {lang('Passwords must be equal.')}
        </div>
      );
    }

    const {
      invalidLength,
      noUpperCase,
      noLowerCase,
      noNumber,
      noSpecialChar,
    } = validation;

    return (
      <div className={styles.passwordRules}>
        {lang('To protect your wallet as much as possible, use a password with')}
        <span className={getValidationRuleClass(shouldRenderError, invalidLength)}>
          {' '}{lang('$auth_password_rule_8chars')},
        </span>
        <span className={getValidationRuleClass(shouldRenderError, noLowerCase)}>
          {' '}{lang('$auth_password_rule_one_small_char')},
        </span>
        <span className={getValidationRuleClass(shouldRenderError, noUpperCase)}>
          {' '}{lang('$auth_password_rule_one_capital_char')},
        </span>
        <span className={getValidationRuleClass(shouldRenderError, noNumber)}>
          {' '}{lang('$auth_password_rule_one_digit')},
        </span>
        <span className={getValidationRuleClass(shouldRenderError, noSpecialChar)}>
          {' '}{lang('$auth_password_rule_one_special_char')}
        </span>.
      </div>
    );
  }

  return (
    <form
      id={formId}
      onSubmit={handleSubmit}
      className={buildClassName(styles.container, styles.container_scrollable, 'custom-scroll')}
    >
      <AnimatedIconWithPreview
        play={isActive}
        tgsUrl={ANIMATED_STICKERS_PATHS.happy}
        previewUrl={ANIMATED_STICKERS_PATHS.happyPreview}
        noLoop={false}
        nonInteractive
        className={styles.sticker}
      />
      <div className={styles.title}>{lang('Congratulations!')}</div>
      <p className={styles.info}>
        <b>{lang(isImporting ? 'The wallet is imported' : 'The wallet is ready')}.</b>
      </p>
      <p className={styles.info}>
        {lang('Create a password to protect it.')}
      </p>

      <div className={styles.form}>
        <Input
          ref={firstInputRef}
          type="password"
          isRequired
          id="first-password"
          hasError={shouldRenderError}
          placeholder={lang('Enter your password...')}
          value={firstPassword}
          autoComplete="new-password"
          onInput={handleFirstPasswordChange}
          onFocus={markPasswordFocused}
          onBlur={unmarkPasswordFocused}
          className={styles.input}
        />
        <Input
          type="password"
          isRequired
          id="second-password"
          placeholder={lang('...and repeat it')}
          hasError={isPasswordsNotEqual}
          value={secondPassword}
          autoComplete="new-password"
          onInput={handleSecondPasswordChange}
          onFocus={markSecondPasswordFocused}
          onBlur={unmarkSecondPasswordFocused}
          className={styles.input}
        />
      </div>

      {renderErrors()}

      <div className={buildClassName(styles.buttons, styles.buttons__inner)}>
        <Button onClick={handleCancel} className={styles.footerButton}>
          {lang('Cancel')}
        </Button>
        <Button
          isSubmit
          isPrimary
          isDisabled={isPasswordsNotEqual || firstPassword === ''}
          isLoading={isLoading}
          className={styles.footerButton}
        >
          {lang('Continue')}
        </Button>
      </div>

      <Modal
        isOpen={isWeakPasswordModalOpen}
        isCompact
        onClose={closeWeakPasswordModal}
        title={lang('Insecure Password')}
      >
        <p className={modalStyles.text}>
          {lang('Your have entered an insecure password, which can be easily guessed by scammers.')}
        </p>
        <p className={modalStyles.text}>
          {lang('Continue or change password to something more secure?')}
        </p>
        <div className={modalStyles.buttons}>
          <Button isPrimary onClick={closeWeakPasswordModal} className={modalStyles.button}>{lang('Change')}</Button>
          <Button forFormId={formId} isSubmit isDestructive className={modalStyles.button}>{lang('Continue')}</Button>
        </div>
      </Modal>
    </form>
  );
};

function getValidationRuleClass(shouldRenderError: boolean, ruleHasError: boolean) {
  return buildClassName(
    styles.passwordRule,
    !ruleHasError ? styles.valid : shouldRenderError ? styles.invalid : undefined,
  );
}

// eslint-disable-next-line consistent-return
function getFormId(method: AuthMethod) {
  switch (method) {
    case 'createAccount':
      return 'auth_create_password';
    case 'importMnemonic':
      return 'auth_import_mnemonic_password';
    case 'importHardwareWallet':
      return 'auth_import_hardware_password';
  }
}

export default memo(AuthCreatePassword);
