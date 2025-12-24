import { useState } from 'react';
import { Header } from './Header';
import { MessageComposer } from './MessageComposer';
import { Inbox } from './Inbox';
import '../styles/MessengerApp.css';

export function MessengerApp() {
  const [refreshToken, setRefreshToken] = useState(0);

  const handleSent = () => {
    setRefreshToken((value) => value + 1);
  };

  return (
    <div className="messenger-app">
      <Header />
      <section className="hero">
        <div className="hero-content">
          <h2 className="hero-title">Private messages, publicly verifiable.</h2>
          <p className="hero-description">
            Each message is encrypted with a one-time address key. The key itself is protected by Zama FHE so only
            the recipient can decrypt and read the content.
          </p>
        </div>
        <div className="hero-panel">
          <div>
            <p className="hero-panel-label">Flow summary</p>
            <ul className="hero-panel-list">
              <li>Generate a random address to encrypt the message.</li>
              <li>Send ciphertext + encrypted address key to the contract.</li>
              <li>Recipient decrypts the address, then unlocks the message.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="content-grid">
        <MessageComposer onSent={handleSent} />
        <Inbox refreshToken={refreshToken} />
      </section>
    </div>
  );
}
