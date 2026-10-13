/**
 * UserStorage tests: user storage is keyed by the account, not the executor.
 */

import '../setup';
import { UserStorage } from '../../collections/UserStorage';
import { clearStorage, setAccountId, setExecutorId } from '../setup';

const account = new Uint8Array(32).fill(7);
const device = new Uint8Array(32).fill(9);

describe('UserStorage account keying', () => {
  beforeEach(() => {
    clearStorage();
    setExecutorId(device);
    setAccountId(account);
  });

  it('sets and reads the current user by account when it differs from the executor', () => {
    const store = new UserStorage<string>();

    store.setForUser(account, 'hello');

    expect(store.get()).toBe('hello');
    expect(store.getForUser(account)).toBe('hello');
  });

  it('rejects setForUser for the executor key when it is not the account', () => {
    const store = new UserStorage<string>();

    expect(() => store.setForUser(device, 'nope')).toThrow('current account');
  });
});
