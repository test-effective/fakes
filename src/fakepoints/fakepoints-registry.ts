const fakepointsToRun: (() => void)[] = [];

export function registerFakepoints(fakepointsFn: () => void) {
  fakepointsToRun.push(fakepointsFn);
}

export function runAllFakepoints(debug: boolean = false) {
  if (debug) {
    console.log(
      '🔄 Amount of fakepoints files to run: ',
      fakepointsToRun.length,
    );
  }
  fakepointsToRun.forEach(fakepointsFn => fakepointsFn());
}
