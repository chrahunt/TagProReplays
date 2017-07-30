let {toStream} = require('util/promise-ext');

function resolveValIn(val, ms) {
  return new Promise((resolve) => {
    setTimeout(() => resolve(val), ms);
  });
}

function runIn(fn, ms) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        resolve(fn());
      } catch(e) {
        reject(e);
      }
    }, ms);
  });
}

describe('toStream behavior', () => {
  it('should output results in input order', () => {
    let input = [
      resolveValIn(0, 300),
      resolveValIn(1, 200),
      resolveValIn(2, 100)
    ];
    let concurrencies = [];
    for (let i = 0; i < input.length; i++) {
      let current = 0;
      concurrencies.push(toStream(input[Symbol.iterator](), (v) => {
        if (v != current) {
          throw new Error(`Received ${v} but expected ${current}`
            + `, concurrency ${i}`);
        }
        current++;
      }, { concurrency: i }));
    }
    return Promise.all(concurrencies);
  });

  it('should match provided concurrency', () => {
    function startEndPromise(start, end, time) {
      return Promise.resolve(start())
      .then(() => runIn(end, time));
    }
    function* startEndPromises(iterable, start, end) {
      for (let i = 0; i < iterable.length; i++) {
        let [val, time] = iterable[i];
        yield startEndPromise(start, () => end(val), time);
      }
    }
    // Key gives amount of concurrency, values are
    // [
    //   expected number of running tasks at the end of the timeout,
    //   timeout length
    // ]
    let cases = {
      1: [
        [1, 50],
        [1, 50],
        [1, 50]
      ],
      2: [
        [2, 50],
        [2, 50],
        [2, 50],
        [1, 100]
      ],
      3: [
        [3, 50],
        [3, 50],
        [3, 50],
        [2, 100],
        [1, 150]
      ]
    };

    let results = [];
    // We'll compare actual checks to expected checks to sanity check
    // the test itself is doing what we want.
    let checks = 0;
    let expected_checks = 0;
    for (let i = 1; i < 3; i++) {
      let running = 0;
      let this_case = cases[i];
      expected_checks += this_case.length;
      results.push(toStream(startEndPromises(this_case, () => {
        running++;
      }, (expected_running) => {
        checks++;
        if (running != expected_running) {
          throw new Error(
            `Expected: ${expected_running}, actual: ${running}`
            + ` (concurrency: ${i})`);
        }
        running--;
      // noop for interface
      }), () => 0, { concurrency: i }));
    }

    return Promise.all(results)
    .then(() => {
      if (checks != expected_checks) {
        throw new Error(`Checks (${checks}) did not match expected`
          + ` (${expected_checks})`);
      }
    })
  });

  it('should abort on first failure, without executing further', () => {
    let executed = 0;
    function count() {
      executed++;
    }

    function doAbort() {
      let err = new Error('Expected error');
      err.name = 'expected';
      throw err;
    }

    let vals = [
      // shouldexecute, abort, timeout
      [count, 100],
      [doAbort, 50],
      [count, 100]
    ];

    function* source(descriptors) {
      for (let descriptor of descriptors) {
        let [fn, timeout] = descriptor;
        yield runIn(fn, timeout);
      }
    }

    return toStream(source(vals), () => 0, { concurrency: 2 })
    // unexpected error
    .then(() => {
      throw new Error('toStream did not throw, but should have');
    })
    .catch((err) => {
      // expected error
      if (err.name != 'expected') throw err;
      return runIn(() => {
        if (executed != 1)
          throw new Error(`Executed should have been 1 but was ${executed}`);
      }, 200);
    });
  });
});