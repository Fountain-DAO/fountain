import logoSvg from './logo.svg';

import type { ReactNode } from 'react';

export interface LogoProps {
  noText?: boolean;
  width?: number;
}

export function Logo(props: LogoProps): ReactNode {
  // The "threshold F": a claim's price rallies, stalls below the dashed
  // settlement threshold, then climbs through it and holds. Both up-strokes
  // share one slope. Drawn on a square 32-unit grid; public/favicon.svg is
  // the small-size cut with a solid threshold bar.
  const width: number = props.width || 28;
  return (
    <span className='logo'>
      <img
        alt='Fountain logo'
        src={logoSvg}
        style={{
          width,
          height: width,
          verticalAlign: 'middle',
          marginRight: props.noText ? 0 : 6,
        }}
      />
      {props.noText ? null : <span className='logo-text'>Fountain</span>}
    </span>
  );
}
