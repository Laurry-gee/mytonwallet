import type { TeactNode } from '../../lib/teact/teact';
import React, {
  memo, useEffect, useRef, useState,
} from '../../lib/teact/teact';

import buildClassName from '../../util/buildClassName';
import captureKeyboardListeners from '../../util/captureKeyboardListeners';
import { ANIMATED_STICKERS_PATHS } from './helpers/animatedAssets';

import useFocusAfterAnimation from '../../hooks/useFocusAfterAnimation';
import useLang from '../../hooks/useLang';
import useLastCallback from '../../hooks/useLastCallback';

import AnimatedIconWithPreview from './AnimatedIconWithPreview';
import Button from './Button';
import Input from './Input';

import modalStyles from './Modal.module.scss';
import styles from './PasswordForm.module.scss';

interface OwnProps {
  isActive: boolean;
  isLoading?: boolean;
  cancelLabel?: string;
  submitLabel: string;
  stickerSize?: number;
  placeholder?: string;
  error?: string;
  containerClassName?: string;
  children?: TeactNode;
  onCancel: NoneToVoidFunction;
  onUpdate: NoneToVoidFunction;
  onSubmit: (password: string) => void;
}

const STICKER_SIZE = 180;

function PasswordForm({
  isActive,
  isLoading,
  cancelLabel,
  submitLabel,
  stickerSize = STICKER_SIZE,
  placeholder,
  error,
  containerClassName,
  children,
  onUpdate,
  onCancel,
  onSubmit,
}: OwnProps) {
  const lang = useLang();

  // eslint-disable-next-line no-null/no-null
  const passwordRef = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState<string>('');
  const isSubmitDisabled = !password.length;

  useEffect(() => {
    if (isActive) {
      setPassword('');
    }
  }, [isActive]);

  useFocusAfterAnimation(passwordRef, !isActive);

  const handleInput = useLastCallback((value: string) => {
    setPassword(value);
    if (error) {
      onUpdate();
    }
  });

  const handleSubmit = useLastCallback(() => {
    onSubmit(password);
  });

  useEffect(() => {
    return isSubmitDisabled
      ? undefined
      : captureKeyboardListeners({
        onEnter: handleSubmit,
      });
  }, [handleSubmit, isSubmitDisabled]);

  return (
    <div className={buildClassName(modalStyles.transitionContent, containerClassName)}>
      <AnimatedIconWithPreview
        tgsUrl={ANIMATED_STICKERS_PATHS.holdTon}
        previewUrl={ANIMATED_STICKERS_PATHS.holdTonPreview}
        play={isActive}
        size={stickerSize}
        nonInteractive
        noLoop={false}
        className={styles.sticker}
      />

      {children}

      <Input
        ref={passwordRef}
        type="password"
        isRequired
        id="first-password"
        error={error ? lang(error) : undefined}
        placeholder={placeholder}
        value={password}
        onInput={handleInput}
      />

      <div className={modalStyles.buttons}>
        {onCancel && (
          <Button onClick={onCancel}>
            {cancelLabel || lang('Cancel')}
          </Button>
        )}
        <Button
          isPrimary
          isLoading={isLoading}
          isDisabled={isSubmitDisabled}
          onClick={!isLoading ? handleSubmit : undefined}
        >
          {submitLabel || lang('Send')}
        </Button>
      </div>
    </div>
  );
}

export default memo(PasswordForm);
