import 'collected-fakepoints';
import { beforeAll } from 'vitest';
import { runAllFakepoints } from '../../src/fakepoints/fakepoints-registry.js';

beforeAll(() => {
  runAllFakepoints();
});
