import { makeEntry, makeFragrance } from '@/domain/fixtures';
import { mergeByUpdatedAt, mergeEntries } from './sync';

describe('mergeByUpdatedAt', () => {
  it('keeps whichever side was written last', () => {
    const local = [makeFragrance({ id: 'a', name: 'Local name', updatedAt: '2026-07-28T10:00:00Z' })];
    const remote = [makeFragrance({ id: 'a', name: 'Remote name', updatedAt: '2026-07-28T12:00:00Z' })];
    expect(mergeByUpdatedAt(local, remote)[0].name).toBe('Remote name');
  });

  it('does not let an older remote row clobber a newer local edit', () => {
    // The failure this guards: you edit on the plane, sync on landing, and the
    // stale server copy overwrites the edit you just made.
    const local = [makeFragrance({ id: 'a', name: 'Just edited', updatedAt: '2026-07-28T12:00:00Z' })];
    const remote = [makeFragrance({ id: 'a', name: 'Stale', updatedAt: '2026-07-28T09:00:00Z' })];
    expect(mergeByUpdatedAt(local, remote)[0].name).toBe('Just edited');
  });

  it('brings down rows the device has never seen', () => {
    const merged = mergeByUpdatedAt(
      [makeFragrance({ id: 'a' })],
      [makeFragrance({ id: 'b', name: 'From another device' })],
    );
    expect(merged.map((f) => f.id).sort()).toEqual(['a', 'b']);
  });

  it('keeps local-only rows that are not yet on the server', () => {
    const merged = mergeByUpdatedAt([makeFragrance({ id: 'offline-add' })], []);
    expect(merged).toHaveLength(1);
  });

  it('handles both sides being empty', () => {
    expect(mergeByUpdatedAt([], [])).toEqual([]);
  });
});

describe('mergeEntries', () => {
  it('unions by id — diary entries are immutable once written', () => {
    const merged = mergeEntries(
      [makeEntry({ id: '1', fragranceId: 'a', date: '2026-07-28' })],
      [makeEntry({ id: '2', fragranceId: 'a', date: '2026-07-27' })],
    );
    expect(merged).toHaveLength(2);
  });

  it('prefers the local copy on an id collision rather than duplicating', () => {
    const merged = mergeEntries(
      [makeEntry({ id: '1', fragranceId: 'a', date: '2026-07-28', note: 'local' })],
      [makeEntry({ id: '1', fragranceId: 'a', date: '2026-07-28', note: 'remote' })],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].note).toBe('local');
  });
});
