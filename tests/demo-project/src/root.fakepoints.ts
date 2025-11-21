import { registerFakepoints } from '../../../src/fakepoints/fakepoints-registry.js';

registerFakepoints(() => {
  console.log('🔄 Root fakepoints registered');
});
