import { registerFakepoints } from '../../../../src/fakepoints/fakepoints-registry.js';

registerFakepoints(() => {
  console.log('🔄 Nested fakepoints registered');
});
