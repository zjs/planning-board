import { useState } from 'react';
import { colorFor, initials, type CursorSetting, type Person } from '../commands/presence.ts';
import { myName, setMyName } from '../commands/sharing.ts';
import { HeaderField } from './HeaderField.tsx';
import { Menu } from './Menu.tsx';
import type { PresenceView } from './usePresence.ts';

const SHOWN = 4;

const SETTINGS: { value: CursorSetting; label: string }[] = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'driver', label: 'Driver only' },
  { value: 'none', label: 'None' },
];

/**
 * Who's on a shared plan (requirement 32, Q61, Q71): an avatar per person,
 * yours first, with a ring around the driver's. The row opens a menu to
 * drive, to choose whose pointers show, and to change your name. It stays
 * narrow, so the toolbar keeps to one row.
 */
export function Avatars({ view, onActivity }: { view: PresenceView; onActivity?: () => void }) {
  const [naming, setNaming] = useState(false);
  const name = myName() ?? 'You';
  const me: Pick<Person, 'id' | 'name' | 'color'> = { id: view.me, name, color: colorFor(view.me).hex };
  const driver = view.driver === null ? null : view.driver === view.me ? me : view.others.find((p) => p.id === view.driver);
  const note = driver ? (driver.id === view.me ? 'You’re driving' : `${driver.name} is driving`) : null;
  const avatar = (p: Pick<Person, 'id' | 'name' | 'color'>, you: boolean) => (
    <span
      key={p.id}
      className={`avatar${p.id === view.driver ? ' driving' : ''}`}
      style={{ background: p.color }}
      title={`${you ? `${p.name} (you)` : p.name}, ${colorFor(p.id).name}${p.id === view.driver ? ', driving' : ''}`}
      data-testid="avatar"
      data-person={p.name}
    >
      {initials(p.name)}
    </span>
  );
  if (naming) {
    return (
      <span className="avatars">
        <span className="avatar-name-field">
          <HeaderField
            initial={myName() ?? ''}
            label="Your name"
            onCommit={(text) => {
              if (text.trim() === '') return 'Type the name others will see.';
              setMyName(text);
              view.refresh();
              return null;
            }}
            onDone={() => setNaming(false)}
          />
        </span>
      </span>
    );
  }
  const everyone = [me, ...view.others];
  return (
    <span className="avatars" data-testid="avatars">
      <Menu
        className="avatars-button"
        testId="people-menu"
        ariaLabel={`${everyone.length} ${everyone.length === 1 ? 'person' : 'people'} on this plan${note ? `. ${note}` : ''}`}
        label={
          <>
            {everyone.slice(0, SHOWN).map((p, i) => avatar(p, i === 0))}
            {everyone.length > SHOWN && <span className="avatar more">+{everyone.length - SHOWN}</span>}
            {note && (
              <span className="visually-hidden" data-testid="driving-note">
                {note}
              </span>
            )}
          </>
        }
        entries={[
          ...(note ? [{ heading: note }] : []),
          ...view.others.slice(SHOWN - 1).map((p) => ({ heading: p.name })),
          {
            label: view.driving ? 'Stop driving' : 'I’m driving',
            onSelect: view.toggleDriving,
            title: view.driving ? 'Hand back the lead' : 'Take the lead: with Driver only, others see just your pointer',
          },
          { label: myName() ? 'Change your name…' : 'Add your name…', onSelect: () => setNaming(true) },
          ...(onActivity ? [{ label: 'Activity', onSelect: onActivity, title: 'Who changed what on this plan, and when' }] : []),
          'divider',
          { heading: 'Pointers to show' },
          ...SETTINGS.map((setting) => ({
            label: setting.label,
            current: view.setting === setting.value,
            onSelect: () => view.setSetting(setting.value),
          })),
        ]}
      />
    </span>
  );
}
