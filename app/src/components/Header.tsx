import { ConnectButton } from '@rainbow-me/rainbowkit';
import '../styles/Header.css';

export function Header() {
  return (
    <header className="header">
      <div className="header-container">
        <div className="header-content">
          <div className="brand">
            <div className="brand-mark">NC</div>
            <div>
              <p className="brand-title">NullComm</p>
              <p className="brand-subtitle">Encrypted messaging over FHE</p>
            </div>
          </div>
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
