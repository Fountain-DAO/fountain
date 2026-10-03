import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { X_URL } from './env';
import { Logo } from './logo';
import { XLogo } from './x-logo';

export function Header(): ReactNode {
  return (
    <div className='site-header'>
      <Link to='/' className='site-header-home'>
        <Logo />
      </Link>
      <nav className='site-nav'>
        <Link to='/#faq'>FAQ</Link>
        <Link to={X_URL}>
          <XLogo size={12} />
          Follow on X
        </Link>
      </nav>
    </div>
  );
}
