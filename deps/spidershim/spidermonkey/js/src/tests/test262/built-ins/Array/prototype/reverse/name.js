// Copyright (C) 2015 André Bargull. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
es6id: 22.1.3.20
description: >
  Array.prototype.reverse.name is "reverse".
info: >
  Array.prototype.reverse ( )

  17 ECMAScript Standard Built-in Objects:
    Every built-in Function object, including constructors, that is not
    identified as an anonymous function has a name property whose value
    is a String.

    Unless otherwise specified, the name property of a built-in Function
    object, if it exists, has the attributes { [[Writable]]: false,
    [[Enumerable]]: false, [[Configurable]]: true }.
includes: [propertyHelper.js]
---*/

assert.sameValue(Array.prototype.reverse.name, "reverse");

verifyNotEnumerable(Array.prototype.reverse, "name");
verifyNotWritable(Array.prototype.reverse, "name");
verifyConfigurable(Array.prototype.reverse, "name");

reportCompare(0, 0);
