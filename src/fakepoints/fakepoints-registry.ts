const fakepointsToRun: (() => void)[] = [];

export function registerFakepoints(fakepointsFn: () => void) {
  fakepointsToRun.push(fakepointsFn);
}

export function runAllFakepoints() {
  fakepointsToRun.forEach(fakepointsFn => fakepointsFn());
}
