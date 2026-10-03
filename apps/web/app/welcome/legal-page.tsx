import type { ReactNode } from 'react';
import { Footer } from './footer';
import { Header } from './header';

export function LegalPage(props: { title: string; updated: string; children: ReactNode }) {
  return (
    <div>
      <Header />
      <main className='page'>
        <article className='legal'>
          <h1 className='legal-title'>{props.title}</h1>
          <p className='legal-updated'>Last updated {props.updated}</p>
          {props.children}
        </article>
      </main>
      <Footer />
    </div>
  );
}
