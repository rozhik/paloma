import React from 'react';
import { useFormat } from '../../../i18n/format.js';
import { SidebarSection, useSidebarSections, type SidebarItem } from '../../../shell/sidebar.js';

/** A list entry: icon or cover, label, and the number of photos. */
const Entry: React.FC<{ item: SidebarItem }> = ({ item }) => {
  const { formatNumber } = useFormat();
  const Icon = item.icon;
  return (
    <button
      type="button"
      className={`list-group-item list-group-item-action d-flex align-items-center justify-content-between gap-2 rounded fs-5 py-2 ${item.active ? 'active fw-bold' : ''}`}
      aria-current={item.active ? 'true' : undefined}
      onClick={item.select}
      title={item.title}
    >
      <span className="d-flex align-items-center gap-2 text-truncate">
        {item.thumbnailUrl ? (
          <img src={item.thumbnailUrl} alt="" className="classic-sidebar-cover rounded flex-shrink-0" />
        ) : (
          <Icon size={20} className={`flex-shrink-0 ${item.active ? '' : item.iconClass}`} />
        )}
        <span dir="auto" className={`text-truncate ${item.placeholder ? 'fst-italic' : ''}`}>{item.label}</span>
      </span>
      {item.count !== undefined && (
        <span className={`badge rounded-pill ${item.active ? 'pal-badge-on-accent' : 'pal-badge'}`}>{formatNumber(item.count)}</span>
      )}
    </button>
  );
};

/** Classic sidebar: shortcuts, albums and folders, each a collapsible list. */
export const ClassicSidebar: React.FC = () => {
  const sections = useSidebarSections();
  const { formatNumber } = useFormat();
  return (
    <aside className="classic-sidebar h-100 p-3">
      {sections.map((section) => (
        <SidebarSection
          key={section.id}
          section={section}
          className="mb-3"
          badge={section.count !== undefined && <span className="badge pal-badge fs-6">{formatNumber(section.count)}</span>}
        >
          {section.items.length === 0 && section.emptyText ? (
            <p className="text-muted fs-6 fst-italic">{section.emptyText}</p>
          ) : (
            <div className="list-group list-group-flush gap-1">
              {section.items.map((item) => <Entry key={item.key} item={item} />)}
            </div>
          )}
        </SidebarSection>
      ))}
    </aside>
  );
};
