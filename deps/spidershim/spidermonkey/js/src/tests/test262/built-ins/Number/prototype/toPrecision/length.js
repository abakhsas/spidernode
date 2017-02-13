// Copyright (C) 2015 André Bargull. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
es6id: 20.1.3.5
description: >
  Number.prototype.toPrecision.length is 1.
info: >
  Number.prototype.toPrecision ( precision )

  17 ECMAScript Standard Built-in Objects:
    Every built-in Function object, including constructors, has a length
    property whose value is an integer. Unless otherwise specified, this
    value is equal to the largest number of named arguments shown in the
    subclause headings for the function description, including optional
    parameters. However, rest parameters shown using the form “...name”
    are not included in the default argument count.

    Unless otherwise specified, the length property of a built-in Function
    object has the attributes { [[Writable]]: false, [[Enumerable]]: false,
    [[Configurable]]: true }.
includes: [propertyHelper.js]
---*/

assert.sameValue(Number.prototype.toPrecision.length, 1);

verifyNotEnumerable(Number.prototype.toPrecision, "length");
verifyNotWritable(Number.prototype.toPrecision, "length");
verifyConfigurable(Number.prototype.toPrecision, "length");

reportCompare(0, 0);
