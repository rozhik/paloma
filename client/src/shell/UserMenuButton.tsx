import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Dropdown } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { UserRound } from 'lucide-react';
import { useAllows } from '../levels/controls.js';
import { useUserMenu } from './userMenu.js';

/** The menu's toggle: a round avatar, without the dropdown caret. */
const Toggle = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ className, ...props }, ref) => <button ref={ref} type="button" {...props} className={`user-menu-btn ${className ?? ''}`} />,
);
Toggle.displayName = 'UserMenuToggle';

/**
 * The avatar at the end of the main navigation, in every skin: the user's initials (a person icon with users
 * off), opening the menu with the account, Admin, Server settings and Log out. The open menu is drawn over the
 * page, so no toolbar clips it.
 */
export const UserMenuButton: React.FC<{ className?: string; size?: number }> = ({ className, size = 40 }) => {
  const { t } = useTranslation();
  const allowed = useAllows('user.menu');
  const { user, label, initials, imageUrl, items } = useUserMenu();
  const [show, setShow] = useState(false);
  if (!allowed) return null;

  return (
    <Dropdown show={show} onToggle={(next) => setShow(next)} align="end" className="user-menu flex-shrink-0">
      <Dropdown.Toggle
        as={Toggle}
        className={className}
        aria-label={t('userMenu.open', { name: label })}
        title={label}
        style={{ width: size, height: size }}
      >
        {imageUrl
          ? <img src={imageUrl} alt="" className="user-menu-avatar" draggable={false} />
          : initials ?? <UserRound size={Math.round(size * 0.55)} aria-hidden="true" />}
      </Dropdown.Toggle>
      {show && createPortal(
        <Dropdown.Menu className="user-menu-items shadow" popperConfig={{ strategy: 'fixed' }}>
          <Dropdown.Header className="user-menu-header">
            <div className="fs-5 fw-semibold text-body">{label}</div>
            {user && <div className="text-secondary">{user.username} · {user.roleName}</div>}
          </Dropdown.Header>
          {items.length > 0 && <Dropdown.Divider />}
          {items.map(({ id, icon: Icon, label: itemLabel, select }) => (
            <React.Fragment key={id}>
              {id === 'logout' && items.length > 1 && <Dropdown.Divider />}
              <Dropdown.Item as="button" type="button" className="d-flex align-items-center gap-2 fs-5" onClick={select}>
                <Icon size={20} aria-hidden="true" />
                <span>{itemLabel}</span>
              </Dropdown.Item>
            </React.Fragment>
          ))}
        </Dropdown.Menu>,
        document.body,
      )}
    </Dropdown>
  );
};
