import React, { useEffect, useState } from 'react';
import { usePalomaStore } from '../store/usePalomaStore.js';
import { Star, Folder, Image, Clock, FolderPlus, Bookmark } from 'lucide-react';
import type { Folder as FolderType } from '../../../shared/types.js';

export const LeftSidebar: React.FC = () => {
  const { selectedFolderId, setSelectedFolderId, selectedFilter, setSelectedFilter } = usePalomaStore();
  const [foldersList, setFoldersList] = useState<FolderType[]>([]);

  const fetchFolders = async () => {
    try {
      const res = await fetch('/api/folders');
      if (res.ok) {
        const data = await res.json();
        setFoldersList(data);
      }
    } catch (err) {
      console.error('Failed to fetch folders:', err);
    }
  };

  useEffect(() => {
    fetchFolders();
    const interval = setInterval(fetchFolders, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <aside className="bg-white border-end h-100 p-3" style={{ width: '280px', flexShrink: 0, overflowY: 'auto' }}>
      <div className="mb-4">
        <h6 className="text-uppercase text-muted fw-bold mb-3 fs-6">Колекції</h6>
        <div className="list-group list-group-flush gap-1">
          <button
            className={`list-group-item list-group-item-action d-flex align-items-center gap-2 rounded fs-5 py-2 ${
              selectedFilter === 'all' && selectedFolderId === null ? 'active fw-bold' : ''
            }`}
            onClick={() => setSelectedFilter('all')}
          >
            <Image size={20} className="text-primary" />
            <span>Усі світлини</span>
          </button>

          <button
            className={`list-group-item list-group-item-action d-flex align-items-center gap-2 rounded fs-5 py-2 ${
              selectedFilter === 'starred' ? 'active fw-bold' : ''
            }`}
            onClick={() => setSelectedFilter('starred')}
          >
            <Star size={20} className="text-warning fill-warning" />
            <span>⭐ Обране</span>
          </button>

          <button
            className={`list-group-item list-group-item-action d-flex align-items-center gap-2 rounded fs-5 py-2 ${
              selectedFilter === 'recent' ? 'active fw-bold' : ''
            }`}
            onClick={() => setSelectedFilter('recent')}
          >
            <Clock size={20} className="text-info" />
            <span>📥 Останній імпорт</span>
          </button>
        </div>
      </div>

      <div>
        <div className="d-flex align-items-center justify-content-between mb-2">
          <h6 className="text-uppercase text-muted fw-bold mb-0 fs-6">Відстежувані папки</h6>
          <span className="badge bg-secondary fs-6">{foldersList.length}</span>
        </div>

        {foldersList.length === 0 ? (
          <p className="text-muted fs-6 fst-italic">Немає папок. Вкажіть папки з фотографіями в PALOMA_PHOTOS_DIRS у файлі .env і перезапустіть сервер.</p>
        ) : (
          <div className="list-group list-group-flush gap-1">
            {foldersList.map((f) => (
              <button
                key={f.id}
                className={`list-group-item list-group-item-action d-flex align-items-center justify-content-between rounded py-2 fs-5 ${
                  selectedFolderId === f.id ? 'active fw-bold' : ''
                }`}
                onClick={() => setSelectedFolderId(f.id)}
              >
                <div className="d-flex align-items-center gap-2 text-truncate">
                  <Folder size={20} className={selectedFolderId === f.id ? 'text-white' : 'text-warning'} />
                  <span className="text-truncate">{f.name}</span>
                </div>
                <span className={`badge rounded-pill ${selectedFolderId === f.id ? 'bg-light text-dark' : 'bg-secondary'}`}>
                  {f.photoCount || 0}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
};
