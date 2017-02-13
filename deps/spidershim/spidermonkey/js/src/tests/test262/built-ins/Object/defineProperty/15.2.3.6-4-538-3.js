// Copyright (c) 2012 Ecma International.  All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
es5id: 15.2.3.6-4-538-3
description: >
    ES5 Attributes - Updating a named accessor property 'P' whose
    [[Configurable]] attribute is true to a data property is
    successful, 'O' is the global object
includes: [propertyHelper.js]
---*/

var obj = this;

obj.verifySetFunc = "data";
var getFunc = function () {
    return obj.verifySetFunc;
};

var setFunc = function (value) {
    obj.verifySetFunc = value;
};
try {
    Object.defineProperty(obj, "prop", {
        get: getFunc,
        set: setFunc,
        enumerable: true,
        configurable: true
    });
    var desc1 = Object.getOwnPropertyDescriptor(obj, "prop");

    Object.defineProperty(obj, "prop", {
        value: 1001
    });
    var desc2 = Object.getOwnPropertyDescriptor(obj, "prop");

    if (!desc1.hasOwnProperty("get")) {
        $ERROR('Expected desc1.hasOwnProperty("get") to be true, actually ' + desc1.hasOwnProperty("get"));
    }

    if (!desc2.hasOwnProperty("value")) {
        $ERROR('Expected desc2.hasOwnProperty("value") to be true, actually ' + desc2.hasOwnProperty("value"));
    }
    
    if (typeof desc2.get !== "undefined") {
        $ERROR('Expected typeof desc2.get === "undefined", actually ' + typeof desc2.get);
    }

    if (typeof desc2.set !== "undefined") {
        $ERROR('Expected typeof desc2.set === "undefined", actually ' + typeof desc2.set);
    }

    verifyEqualTo(obj, "prop", 1001);

    verifyNotWritable(obj, "prop");

    verifyEnumerable(obj, "prop");

    verifyConfigurable(obj, "prop");

} finally {
    delete obj.prop;
    delete obj.verifySetFunc;
}


reportCompare(0, 0);
