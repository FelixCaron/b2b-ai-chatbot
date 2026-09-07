import React from 'react';
import Header from './Header';
import Footer from './Footer';

/**
 * The page chrome every view renders inside: header, content, footer.
 *
 * App.jsx used to spell this out inline around its view switch, which is why
 * the footer sat below a `{currentView === … ? … : …}` chain a hundred lines
 * long and the two headers were declared in two different places. The shell
 * owns the frame; the switch only decides what goes in the middle.
 */
export default function AppShell({ header = {}, children }) {
  return (
    <div className="min-h-screen bg-surface-100 pb-16">
      <Header {...header} />
      {children}
      <Footer onNavigate={header.onNavigate} />
    </div>
  );
}
