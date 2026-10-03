import { Link } from 'react-router';
import { GITHUB_URL, X_HANDLE, X_URL } from './env';
import { Logo } from './logo';

export function Footer() {
  return (
    <div className='site-footer'>
      <nav className='site-footer-nav'>
        <div className='site-footer-column site-footer-brand'>
          <Logo />
        </div>
        <div className='site-footer-column'>
          <h3>Fountain</h3>
          <ul>
            <li>
              <Link to='/'>About</Link>
            </li>
          </ul>
        </div>
        <div className='site-footer-column'>
          <h3>Connect</h3>
          <ul>
            <li>
              <a href={X_URL}>X (@{X_HANDLE})</a>
            </li>
            <li>
              <a href={GITHUB_URL}>GitHub</a>
            </li>
          </ul>
        </div>
        <div className='site-footer-column'>
          <h3>Legal</h3>
          <ul>
            <li>
              <a href='/terms-and-conditions'>Terms of Service</a>
            </li>
            <li>
              <a href='/privacy-policy'>Privacy Policy</a>
            </li>
          </ul>
        </div>
      </nav>
    </div>
  );
}
