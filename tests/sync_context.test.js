import { describe, it, expect } from 'vitest';
const { resolveSyncAccount, toSyncFriendlyMessage } = require('../services/sync-context');

describe('Sync Context Service', () => {
  it('resolveSyncAccount should prefer selected account id', () => {
    const accounts = [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ];

    const selected = resolveSyncAccount({
      accounts,
      selectedAccountId: 'b',
      defaultAccountId: 'a',
    });

    expect(selected).toEqual({ id: 'b', name: 'B' });
  });

  it('resolveSyncAccount should fallback to default account id', () => {
    const accounts = [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ];

    const selected = resolveSyncAccount({
      accounts,
      selectedAccountId: '',
      defaultAccountId: 'a',
    });

    expect(selected).toEqual({ id: 'a', name: 'A' });
  });

  it('resolveSyncAccount should fallback to default when selected id is invalid', () => {
    const accounts = [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ];

    const selected = resolveSyncAccount({
      accounts,
      selectedAccountId: 'missing',
      defaultAccountId: 'a',
    });

    expect(selected).toEqual({ id: 'a', name: 'A' });
  });

  it('resolveSyncAccount should fallback to first account when selected/default are invalid', () => {
    const accounts = [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ];

    const selected = resolveSyncAccount({
      accounts,
      selectedAccountId: 'missing-selected',
      defaultAccountId: 'missing-default',
    });

    expect(selected).toEqual({ id: 'a', name: 'A' });
  });

  it('resolveSyncAccount should return null when account list is empty', () => {
    const selected = resolveSyncAccount({
      accounts: [],
      selectedAccountId: 'a',
      defaultAccountId: 'b',
    });

    expect(selected).toBeNull();
  });

  it('toSyncFriendlyMessage should map 45002 to user friendly message', () => {
    const msg = toSyncFriendlyMessage('create draft failed (45002)');
    expect(msg).toContain('文章太长，微信接口拒收');
  });

  it('toSyncFriendlyMessage should map invalid content errors to user friendly message', () => {
    const msg = toSyncFriendlyMessage('创建草稿失败:invalld content hint: [x] (45166)');
    expect(msg).toContain('微信接口拒收正文内容');
  });

  it('toSyncFriendlyMessage should keep other errors unchanged', () => {
    expect(toSyncFriendlyMessage('network error')).toBe('network error');
  });
});
