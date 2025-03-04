import React, { memo } from '../../lib/teact/teact';

import buildClassName from '../../util/buildClassName';

import useLang from '../../hooks/useLang';

import Button from './Button';

import modalStyles from './Modal.module.scss';

type OwnProps = {
  title: string;
  className?: string;
  withBorder?: boolean;
  closeClassName?: string;
  onClose?: NoneToVoidFunction;
  onBackButtonClick?: () => void;
};

function ModalHeader({
  title, className, withBorder, closeClassName, onClose, onBackButtonClick,
}: OwnProps) {
  const lang = useLang();

  return (
    <div
      className={buildClassName(
        modalStyles.header,
        withBorder && modalStyles.header_bordered,
        !onBackButtonClick && modalStyles.header_wideContent,
        className,
      )}
    >
      {onBackButtonClick && (
        <Button isSimple isText onClick={onBackButtonClick} className={modalStyles.header_back}>
          <i className={buildClassName(modalStyles.header_backIcon, 'icon-chevron-left')} aria-hidden />
          <span>{lang('Back')}</span>
        </Button>
      )}
      <div className={modalStyles.title}>{title}</div>
      {onClose && (
        <Button
          isRound
          className={buildClassName(modalStyles.closeButton, closeClassName)}
          ariaLabel={lang('Close')}
          onClick={onClose}
        >
          <i className={buildClassName(modalStyles.closeIcon, 'icon-close')} aria-hidden />
        </Button>
      )}
    </div>
  );
}

export default memo(ModalHeader);
