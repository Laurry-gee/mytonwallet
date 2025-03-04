import React, {
  memo, useEffect, useMemo, useState,
} from '../../lib/teact/teact';

import { ANIMATED_STICKER_SMALL_SIZE_PX, MNEMONIC_COUNT } from '../../config';
import { getActions, withGlobal } from '../../global';
import renderText from '../../global/helpers/renderText';
import buildClassName from '../../util/buildClassName';
import captureKeyboardListeners from '../../util/captureKeyboardListeners';
import { ANIMATED_STICKERS_PATHS } from '../ui/helpers/animatedAssets';

import useClipboardPaste from '../../hooks/useClipboardPaste';
import { useDeviceScreen } from '../../hooks/useDeviceScreen';
import useLang from '../../hooks/useLang';
import useLastCallback from '../../hooks/useLastCallback';

import InputMnemonic from '../common/InputMnemonic';
import AnimatedIconWithPreview from '../ui/AnimatedIconWithPreview';
import Button from '../ui/Button';

import styles from './Auth.module.scss';

interface OwnProps {
  isActive?: boolean;
}

type StateProps = {
  error?: string;
  isLoading?: boolean;
};

const MNEMONIC_INPUTS = [...Array(MNEMONIC_COUNT)].map((_, index) => ({
  id: index,
  label: `${index + 1}`,
}));

const SLIDE_ANIMATION_DURATION_MS = 250;

const AuthImportMnemonic = ({ isActive, isLoading, error }: OwnProps & StateProps) => {
  const {
    afterImportMnemonic,
    restartAuth,
  } = getActions();

  const lang = useLang();
  const [mnemonic, setMnemonic] = useState<Record<number, string>>({});
  const { isPortrait } = useDeviceScreen();

  const handlePasteMnemonic = useLastCallback((pastedText: string) => {
    const pastedMnemonic = parsePastedText(pastedText);

    if (pastedMnemonic.length === 1 && document.activeElement?.id.startsWith('import-mnemonic-')) {
      (document.activeElement as HTMLInputElement).value = pastedMnemonic[0];

      const event = new Event('input');
      (document.activeElement as HTMLInputElement).dispatchEvent(event);

      return;
    }

    if (pastedMnemonic.length !== MNEMONIC_COUNT) {
      return;
    }

    // RAF is a workaround for several Android browsers (e.g. Vivaldi)
    requestAnimationFrame(() => {
      setMnemonic(pastedMnemonic);
    });

    if (document.activeElement?.id.startsWith('import-mnemonic-')) {
      (document.activeElement as HTMLInputElement).blur();
    }
  });

  useClipboardPaste(Boolean(isActive), handlePasteMnemonic);

  const isSubmitDisabled = useMemo(() => {
    const mnemonicValues = Object.values(mnemonic);

    return mnemonicValues.length !== MNEMONIC_COUNT || mnemonicValues.some((word) => !word);
  }, [mnemonic]);

  const handleSetWord = useLastCallback((value: string, index: number) => {
    setMnemonic({
      ...mnemonic,
      [index]: value?.toLowerCase(),
    });
  });

  const handleCancel = useLastCallback(() => {
    setTimeout(() => {
      restartAuth();
    }, SLIDE_ANIMATION_DURATION_MS);
  });

  const handleSubmit = useLastCallback(() => {
    if (!isSubmitDisabled) {
      afterImportMnemonic({ mnemonic: Object.values(mnemonic) });
    }
  });

  useEffect(() => {
    return isSubmitDisabled
      ? undefined
      : captureKeyboardListeners({
        onEnter: handleSubmit,
      });
  }, [afterImportMnemonic, handleSubmit, isSubmitDisabled, mnemonic]);

  return (
    <div className={buildClassName(styles.container, styles.container_scrollable, 'custom-scroll')}>
      <AnimatedIconWithPreview
        play={isActive}
        size={ANIMATED_STICKER_SMALL_SIZE_PX}
        tgsUrl={ANIMATED_STICKERS_PATHS.snitch}
        previewUrl={ANIMATED_STICKERS_PATHS.snitchPreview}
        nonInteractive
        noLoop={false}
        className={styles.sticker}
      />
      <div className={buildClassName(styles.title, styles.title_afterSmallSticker)}>
        {lang('%1$d Secret Words', MNEMONIC_COUNT)}
      </div>
      <div className={buildClassName(styles.info, styles.info_pull)}>
        {renderText(lang('$auth_import_mnemonic_description', MNEMONIC_COUNT))}
      </div>

      <div className={styles.importingContent}>
        {MNEMONIC_INPUTS.map(({ id, label }) => (
          <InputMnemonic
            key={id}
            id={`import-mnemonic-${id}`}
            nextId={id + 1 < MNEMONIC_COUNT ? `import-mnemonic-${id + 1}` : undefined}
            labelText={label}
            value={mnemonic[id]}
            suggestionsPosition={getSuggestPosition(id, isPortrait)}
            inputArg={id}
            onInput={handleSetWord}
          />
        ))}
      </div>

      <div className={styles.buttons}>
        {error && <div className={styles.footerError}>{error}</div>}
        <div className={styles.buttons__inner}>
          <Button onClick={handleCancel} className={styles.footerButton}>
            {lang('Cancel')}
          </Button>
          <Button
            isPrimary
            isDisabled={isSubmitDisabled}
            isLoading={isLoading}
            className={styles.footerButton}
            onClick={handleSubmit}
          >
            {lang('Continue')}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default memo(withGlobal<OwnProps>((global): StateProps => {
  return {
    error: global.auth.error,
    isLoading: global.auth.isLoading,
  };
})(AuthImportMnemonic));

function parsePastedText(str: string) {
  return str.replace(/(?:\r\n)+|[\r\n\s;,\t]+/g, ' ').trim().split(' ');
}

function getSuggestPosition(id: number, isPortrait: boolean = false) {
  if (!isPortrait && ((id > 5 && id < 8) || (id > 13 && id < 16) || id > 21)) {
    return 'top';
  }

  return isPortrait && ((id > 7 && id < 12) || id > 19) ? 'top' : undefined;
}
