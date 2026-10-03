import logoSvg from './logo.svg';
// import logoOnDarkSvg from '../images/logo-on-dark.svg';

import type { ReactNode } from 'react';

export interface LogoProps {
  noText?: boolean;
  width?: number;
}

const heightOverWidth = 27 / 33;

export function Logo(props: LogoProps): ReactNode {
  const width: number = props.width || 33;
  return (
    <span className='logo'>
      <img
        alt='Fountain logo'
        src={logoSvg}
        style={{
          width,
          height: heightOverWidth * width,
          verticalAlign: 'middle',
          marginRight: props.noText ? 0 : 6,
        }}
      />
      {props.noText ? null : <span className='logo-text'>Fountain</span>}
    </span>
  );
}
