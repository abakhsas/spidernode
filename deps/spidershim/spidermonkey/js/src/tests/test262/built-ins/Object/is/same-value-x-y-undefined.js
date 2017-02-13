// Copyright (C) 2015 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
es6id: 19.1.2.10
description: >
    Object.is ( value1, value2 )

    7.2.9 SameValue(x, y)

    ...
    4. If Type(x) is Undefined, return true.
    ...

---*/

assert.sameValue(Object.is(undefined, undefined), true, "`Object.is(undefined, undefined)` returns `true`");
assert.sameValue(Object.is(undefined), true, "`Object.is(undefined)` returns `true`");

reportCompare(0, 0);
