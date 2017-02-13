// Copyright (c) 2012 Ecma International.  All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
es5id: 15.2.3.6-4-315-1
description: >
    Object.defineProperty - 'O' is an Arguments object of a function
    that has formal parameters, 'P' is own accessor property of 'O',
    and 'desc' is accessor descriptor, test updating multiple
    attribute values of 'P' (10.6 [[DefineOwnProperty]] step 3)
includes: [propertyHelper.js]
---*/

(function (a, b, c) {
    Object.defineProperty(arguments, "genericProperty", {
        get: function () {
            return 1001;
        },
        set: function (value) {
            this.testgetFunction1 = value;
        },
        enumerable: true,
        configurable: true
    });
    function getFunc() {
        return "getFunctionString";
    }
    function setFunc(value) {
        this.testgetFunction = value;
    }
    Object.defineProperty(arguments, "genericProperty", {
        get: getFunc,
        set: setFunc,
        enumerable: false,
        configurable: false
    });
    if (c !== 3) {
        $ERROR('Expected c === 3, actually ' + c);
    }

    verifyEqualTo(arguments, "genericProperty", getFunc());

    verifyWritable(arguments, "genericProperty", "testgetFunction");

    verifyNotEnumerable(arguments, "genericProperty");

    verifyNotConfigurable(arguments, "genericProperty");
}(1, 2, 3));

reportCompare(0, 0);
