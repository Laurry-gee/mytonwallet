import React, {
  memo, useState,
} from '../../lib/teact/teact';

import buildClassName from '../../util/buildClassName';

import useFlag from '../../hooks/useFlag';
import useLastCallback from '../../hooks/useLastCallback';
import useMediaTransition from '../../hooks/useMediaTransition';

import type { OwnProps as AnimatedStickerProps } from './AnimatedSticker';
import AnimatedSticker from './AnimatedSticker';

export type OwnProps =
  Partial<AnimatedStickerProps>
  & { noTransition?: boolean; nonInteractive?: boolean; size: number };

function AnimatedIcon(props: OwnProps) {
  const {
    size,
    play = true,
    noLoop = true,
    className,
    noTransition,
    nonInteractive,
    onLoad,
    onClick,
    ...otherProps
  } = props;
  const [isAnimationLoaded, markAnimationLoaded] = useFlag(false);
  const transitionClassNames = useMediaTransition(noTransition || isAnimationLoaded);

  const handleLoad = useLastCallback(() => {
    markAnimationLoaded();
    onLoad?.();
  });

  const [playKey, setPlayKey] = useState(String(Math.random()));

  const handleClick = useLastCallback(() => {
    if (play === true) {
      setPlayKey(String(Math.random()));
    }

    onClick?.();
  });

  return (
    <AnimatedSticker
      className={buildClassName(className, transitionClassNames)}
      size={size}
      play={play === true ? playKey : play}
      noLoop={noLoop}
      onClick={!nonInteractive ? handleClick : undefined}
      onLoad={handleLoad}
      /* eslint-disable-next-line react/jsx-props-no-spreading */
      {...otherProps}
    />
  );
}

export default memo(AnimatedIcon);
