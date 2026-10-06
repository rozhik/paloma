import React, { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Tag, X } from 'lucide-react';
import { chipKey, tagSuggestions, typedTags, addTags, removeTag } from './tagRules.js';

interface TagChipsProps {
  tags: string[];
  /** Called with the new list after every change */
  onChange: (tags: string[]) => void;
  /** Known tags offered while typing */
  suggestions: string[];
  disabled?: boolean;
  autoFocus?: boolean;
}

/** Tags as removable chips followed by a field to add more; Enter or a comma adds, Backspace removes the last. */
export const TagChips: React.FC<TagChipsProps> = ({ tags, onChange, suggestions, disabled, autoFocus }) => {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const listId = useId();
  const offered = tagSuggestions(suggestions, text, tags);

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const result = chipKey(event.key, text, tags);
    if (event.key === 'Enter' || event.key === ',') event.preventDefault();
    if (result.kind === 'none') return;
    event.preventDefault();
    if (result.kind === 'add') setText('');
    onChange(result.tags);
  };

  const choose = (tag: string) => {
    setText('');
    onChange(addTags(tags, [tag]));
  };

  return (
    <div className="tag-chips">
      <ul className="tag-chips-list list-unstyled d-flex flex-wrap gap-2 mb-2">
        {tags.map((tag) => (
          <li key={tag} className="tag-chip badge pal-badge rounded-pill d-inline-flex align-items-center gap-1 fs-6">
            <Tag size={14} aria-hidden="true" />
            <span dir="auto">{tag}</span>
            <button
              type="button"
              className="btn btn-sm p-0 border-0 tag-chip-remove"
              aria-label={t('tags.removeChip', { name: tag })}
              title={t('tags.removeChip', { name: tag })}
              disabled={disabled}
              onClick={() => onChange(removeTag(tags, tag))}
            >
              <X size={14} />
            </button>
          </li>
        ))}
      </ul>
      <input
        type="text"
        className="form-control"
        value={text}
        placeholder={t('tags.placeholder')}
        aria-label={t('tags.addChip')}
        aria-autocomplete="list"
        aria-controls={offered.length > 0 ? listId : undefined}
        disabled={disabled}
        autoFocus={autoFocus}
        onChange={(event) => {
          // A pasted "a, b" becomes chips at once; the text after the last comma stays in the field
          const value = event.target.value;
          if (value.includes(',')) {
            const parts = value.split(',');
            const rest = parts.pop() ?? '';
            const typed = typedTags(parts.join(','));
            if (typed.length > 0) onChange(addTags(tags, typed));
            setText(rest);
          } else {
            setText(value);
          }
        }}
        onKeyDown={onKeyDown}
      />
      {offered.length > 0 && (
        <ul id={listId} role="listbox" className="tag-chips-suggestions list-group mt-1">
          {offered.map((tag) => (
            <li key={tag} role="option" aria-selected={false} className="list-group-item list-group-item-action p-0">
              <button type="button" className="btn w-100 text-start" dir="auto" onClick={() => choose(tag)}>{tag}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
