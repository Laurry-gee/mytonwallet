import React, {
  memo, useEffect, useState,
} from '../../lib/teact/teact';

import buildClassName from '../../util/buildClassName';
import { callApi } from '../../api';

import useFlag from '../../hooks/useFlag';
import useLastCallback from '../../hooks/useLastCallback';

import SuggestionList from '../ui/SuggestionList';

import styles from './InputMnemonic.module.scss';

type OwnProps = {
  id?: string;
  nextId?: string;
  labelText?: string;
  className?: string;
  value?: string;
  isInModal?: boolean;
  suggestionsPosition?: 'top' | 'bottom';
  inputArg?: any;
  onInput: (value: string, inputArg?: any) => void;
};

const SUGGESTION_WORDS_COUNT = 7;

function InputMnemonic({
  id, nextId, labelText, className, value = '', isInModal, suggestionsPosition, inputArg, onInput,
}: OwnProps) {
  const [hasFocus, markFocus, unmarkFocus] = useFlag();
  const [hasError, setHasError] = useState<boolean>(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([]);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState<number>(0);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const [wordlist, setWordlist] = useState<string[]>([]);
  const shouldRenderSuggestions = showSuggestions && value && filteredSuggestions.length > 0;

  useEffect(() => {
    (async () => {
      const words = await callApi('getMnemonicWordList');
      setWordlist(words ?? []);
    })();
  }, []);

  useEffect(() => {
    if (showSuggestions && value && filteredSuggestions.length === 0) {
      setHasError(true);
    } else if (!hasFocus && value && !isCorrectMnemonic(value, wordlist)) {
      setHasError(true);
    } else {
      setHasError(false);
    }
  }, [filteredSuggestions.length, hasFocus, showSuggestions, value, wordlist]);

  const processSuggestions = (userInput: string) => {
    // Filter our suggestions that don't contain the user's input
    const unLinked = wordlist.filter(
      (suggestion) => suggestion.toLowerCase().startsWith(userInput.toLowerCase()),
    ).slice(0, SUGGESTION_WORDS_COUNT);

    onInput(userInput, inputArg);
    setFilteredSuggestions(unLinked);
    setActiveSuggestionIndex(0);
    setShowSuggestions(true);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const userInput = e.target.value;

    processSuggestions(userInput);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pastedValue = e.clipboardData.getData('text');

    processSuggestions(pastedValue);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!value) {
      return;
    }

    if (e.code === 'Enter' || (e.code === 'Tab' && !(e.shiftKey || e.ctrlKey || e.altKey || e.metaKey))) {
      onInput(filteredSuggestions[activeSuggestionIndex], inputArg);
      setFilteredSuggestions([filteredSuggestions[activeSuggestionIndex]]);
      setActiveSuggestionIndex(0);
      setShowSuggestions(false);

      if (showSuggestions) {
        e.preventDefault();
      }

      if (nextId) {
        requestAnimationFrame(() => {
          const nextInput = document.getElementById(nextId);
          nextInput?.focus();
          (nextInput as HTMLInputElement)?.select();
        });
      }
    }

    if (e.code === 'ArrowUp') {
      if (activeSuggestionIndex === 0) {
        return;
      }
      setActiveSuggestionIndex(activeSuggestionIndex - 1);
    }

    if (e.code === 'ArrowDown') {
      if (activeSuggestionIndex === filteredSuggestions.length - 1) {
        return;
      }
      setActiveSuggestionIndex(activeSuggestionIndex + 1);
    }
  };

  const handleClick = useLastCallback((suggestion: string) => {
    onInput(suggestion, inputArg);
    setShowSuggestions(false);
    setActiveSuggestionIndex(0);
    setFilteredSuggestions([]);
  });

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    processSuggestions(e.target.value);
    markFocus();
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    // Remove focus from the input element to ensure correct blur handling, especially when triggered by window switching
    e.target.blur();

    unmarkFocus();
    requestAnimationFrame(() => {
      setShowSuggestions(false);
      setFilteredSuggestions([]);
    });
  };

  return (
    <div className={buildClassName(
      styles.wrapper,
      className,
      hasFocus && styles.wrapper_focus,
      hasError && styles.wrapper_error,
    )}
    >
      {shouldRenderSuggestions && (
        <SuggestionList
          suggestions={filteredSuggestions}
          activeIndex={activeSuggestionIndex}
          position={suggestionsPosition}
          isInModal={isInModal}
          onSelect={handleClick}
        />
      )}
      <label className={styles.label} htmlFor={id}>{labelText}.</label>
      <input
        id={id}
        className={buildClassName(styles.input, value !== '' && styles.touched)}
        type="text"
        autoComplete="off"
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onPaste={handlePaste}
        value={value}
        tabIndex={0}
      />
    </div>
  );
}

function isCorrectMnemonic(mnemonic: string, wordlist: string[]) {
  return wordlist.includes(mnemonic);
}

export default memo(InputMnemonic);
