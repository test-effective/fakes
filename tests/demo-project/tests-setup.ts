import 'collected-fakepoints';
import { beforeAll } from 'vitest';
import { setupFakepoints } from '../../src/fakepoints/fakepoints-registry.js';

beforeAll(() => {
  setupFakepoints();
});
