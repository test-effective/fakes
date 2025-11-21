const fakepointsToRun: (() => void)[] = [];

export function registerFakepoints(fakepointsFn: () => void) {
  fakepointsToRun.push(fakepointsFn);
}

export function setupFakepoints(debug: boolean = false) {
  if (debug) {
    console.log('🔄 Amount of fakepoints to setup: ', fakepointsToRun.length);
  }
  fakepointsToRun.forEach(fakepointsFn => fakepointsFn());
}
