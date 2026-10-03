import { useEffect, useState, type ReactNode } from 'react';

const INTERVAL_MS = 2000;
const FADE_MS = 200;

// Cycles through `words` inside a sentence. Every variant of the sentence is rendered in the same
// grid cell and only the active one is visible, so the element is always as tall as the longest
// variant at the current width and the page doesn't reflow when a phrase wraps. Only the word
// fades; the prefix is identical in every variant, so it doesn't appear to change.
export function WordCycle(props: { prefix: string; words: string[]; suffix: string }): ReactNode {
  const { prefix, words, suffix } = props;
  const [index, setIndex] = useState(0);
  const [shown, setShown] = useState(true);

  useEffect(() => {
    let fade: ReturnType<typeof setTimeout> | undefined;
    const interval = setInterval(() => {
      setShown(false);
      fade = setTimeout(() => {
        setIndex(i => (i + 1) % words.length);
        setShown(true);
      }, FADE_MS);
    }, INTERVAL_MS);
    return () => {
      clearInterval(interval);
      clearTimeout(fade);
    };
  }, [words.length]);

  return (
    <span className='word-cycle'>
      {words.map((word, i) => {
        const active = i === index;
        const className = `word-cycle-item${active ? ' is-active' : ''}${active && shown ? ' is-shown' : ''}`;
        return (
          <span key={word} className={className}>
            {prefix} <span className='word-cycle-word'>{word}</span>
            {suffix}
          </span>
        );
      })}
    </span>
  );
}
