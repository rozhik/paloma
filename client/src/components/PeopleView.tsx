import React, { useEffect, useState } from 'react';
import { usePalomaStore } from '../store/usePalomaStore.js';
import { ArrowLeft, UserPlus, Users } from 'lucide-react';
import type { Person } from '../../../shared/types.js';

export const PeopleView: React.FC = () => {
  const { setCurrentView } = usePalomaStore();
  const [people, setPeople] = useState<Person[]>([]);
  const [newPersonName, setNewPersonName] = useState('');

  const fetchPeople = async () => {
    try {
      const res = await fetch('/api/people');
      if (res.ok) {
        const data = await res.json();
        setPeople(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchPeople();
  }, []);

  const handleAddPerson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPersonName.trim()) return;

    try {
      const res = await fetch('/api/people', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newPersonName.trim() }),
      });

      if (res.ok) {
        setNewPersonName('');
        fetchPeople();
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="d-flex flex-column h-100 w-100 bg-dark text-white p-4">
      <div className="d-flex align-items-center justify-content-between mb-4 bg-secondary p-3 rounded">
        <div className="d-flex align-items-center gap-3">
          <button className="btn btn-outline-light btn-lg-custom" onClick={() => setCurrentView('library')}>
            <ArrowLeft size={20} />
            <span>Назад</span>
          </button>
          <h4 className="fw-bold mb-0">👤 Розпізнавання облич та Люди</h4>
        </div>
      </div>

      <div className="row g-4">
        <div className="col-md-4">
          <div className="bg-secondary p-4 rounded">
            <h5 className="fw-bold mb-3 d-flex align-items-center gap-2">
              <UserPlus size={24} />
              <span>Додати нову людину</span>
            </h5>
            <form onSubmit={handleAddPerson}>
              <div className="mb-3">
                <input
                  type="text"
                  className="form-control form-control-lg fs-5"
                  placeholder="Ім'я (наприклад: Бабуся Олена)"
                  value={newPersonName}
                  onChange={(e) => setNewPersonName(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="btn btn-primary btn-lg-custom w-100 py-2">
                Створити профіль
              </button>
            </form>
          </div>
        </div>

        <div className="col-md-8">
          <div className="bg-secondary p-4 rounded" style={{ minHeight: '400px' }}>
            <h5 className="fw-bold mb-3 d-flex align-items-center gap-2">
              <Users size={24} />
              <span>Каталог людей ({people.length})</span>
            </h5>

            {people.length === 0 ? (
              <p className="text-muted fs-5">Людей ще не додано. Введіть ім'я ліворуч або запустіть сканер облич.</p>
            ) : (
              <div className="row row-cols-2 row-cols-md-3 g-3">
                {people.map((person) => (
                  <div key={person.id} className="col">
                    <div className="card h-100 bg-dark text-white border-secondary text-center p-3">
                      <div className="fs-1 mb-2">👤</div>
                      <h5 className="fw-bold text-truncate">{person.name}</h5>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
