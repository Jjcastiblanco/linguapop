import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME } from './index';

describe('@linguapop/domain', () => {
  it('expone su nombre de paquete', () => {
    expect(PACKAGE_NAME).toBe('@linguapop/domain');
  });
});
