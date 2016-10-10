/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "TypedObjectConstants.h"

function ViewedArrayBufferIfReified(tarray) {
    assert(IsTypedArray(tarray), "non-typed array asked for its buffer");

    var buf = UnsafeGetReservedSlot(tarray, JS_TYPEDARRAYLAYOUT_BUFFER_SLOT);
    assert(buf === null || (IsObject(buf) && (IsArrayBuffer(buf) || IsSharedArrayBuffer(buf))),
           "unexpected value in buffer slot");
    return buf;
}

function IsDetachedBuffer(buffer) {
    // A typed array with a null buffer has never had its buffer exposed to
    // become detached.
    if (buffer === null)
        return false;

    assert(IsArrayBuffer(buffer) || IsSharedArrayBuffer(buffer),
           "non-ArrayBuffer passed to IsDetachedBuffer");

    // Shared array buffers are not detachable.
    //
    // This check is more expensive than desirable, but IsDetachedBuffer is
    // only hot for non-shared memory in SetFromNonTypedArray, so there is an
    // optimization in place there to avoid incurring the cost here.  An
    // alternative is to give SharedArrayBuffer the same layout as ArrayBuffer.
    if (IsSharedArrayBuffer(buffer))
        return false;

    var flags = UnsafeGetInt32FromReservedSlot(buffer, JS_ARRAYBUFFER_FLAGS_SLOT);
    return (flags & JS_ARRAYBUFFER_DETACHED_FLAG) !== 0;
}

function GetAttachedArrayBuffer(tarray) {
    var buffer = ViewedArrayBufferIfReified(tarray);
    if (IsDetachedBuffer(buffer))
        ThrowTypeError(JSMSG_TYPED_ARRAY_DETACHED);
    return buffer;
}

// A function which ensures that the argument is either a typed array or a
// cross-compartment wrapper for a typed array and that the typed array involved
// has an attached array buffer.  If one of those conditions doesn't hold (wrong
// kind of argument, or detached array buffer), an exception is thrown.  The
// return value is `true` if the argument is a typed array, `false` if it's a
// cross-compartment wrapper for a typed array.
function IsTypedArrayEnsuringArrayBuffer(arg) {
    if (IsObject(arg) && IsTypedArray(arg)) {
        GetAttachedArrayBuffer(arg);
        return true;
    }

    // This is a bit hacky but gets the job done: the first `arg` is used to
    // test for a wrapped typed array, the second as an argument to
    // GetAttachedArrayBuffer.
    callFunction(CallTypedArrayMethodIfWrapped, arg, arg, "GetAttachedArrayBuffer");
    return false;
}

// ES6 draft 20150304 %TypedArray%.prototype.copyWithin
function TypedArrayCopyWithin(target, start, end = undefined) {
    // This function is not generic.
    if (!IsObject(this) || !IsTypedArray(this)) {
        return callFunction(CallTypedArrayMethodIfWrapped, this, target, start, end,
                            "TypedArrayCopyWithin");
    }

    GetAttachedArrayBuffer(this);

    // Steps 1-2.
    var obj = this;

    // Steps 3-4, modified for the typed array case.
    var len = TypedArrayLength(obj);

    assert(0 <= len && len <= 0x7FFFFFFF,
           "assumed by some of the math below, see also the other assertions");

    // Steps 5-7.
    var relativeTarget = ToInteger(target);

    var to = relativeTarget < 0 ? std_Math_max(len + relativeTarget, 0)
                                : std_Math_min(relativeTarget, len);

    // Steps 8-10.
    var relativeStart = ToInteger(start);

    var from = relativeStart < 0 ? std_Math_max(len + relativeStart, 0)
                                 : std_Math_min(relativeStart, len);

    // Steps 11-13.
    var relativeEnd = end === undefined ? len
                                        : ToInteger(end);

    var final = relativeEnd < 0 ? std_Math_max(len + relativeEnd, 0)
                                : std_Math_min(relativeEnd, len);

    // Step 14.
    var count = std_Math_min(final - from, len - to);

    assert(0 <= to && to <= 0x7FFFFFFF,
           "typed array |to| index assumed int32_t");
    assert(0 <= from && from <= 0x7FFFFFFF,
           "typed array |from| index assumed int32_t");

    // Negative counts are possible for cases like tarray.copyWithin(0, 3, 0)
    // where |count === final - from|.  As |to| is within the [0, len] range,
    // only |final - from| may underflow; with |final| in the range [0, len]
    // and |from| in the range [0, len] the overall subtraction range is
    // [-len, len] for |count| -- and with |len| bounded by implementation
    // limits to 2**31 - 1, there can be no exceeding int32_t.
    assert(-0x7FFFFFFF - 1 <= count && count <= 0x7FFFFFFF,
           "typed array element count assumed int32_t");

    // Steps 15-17.
    //
    // Note that getting or setting a typed array element must throw if the
    // underlying buffer is detached, so the intrinsic below checks for
    // detachment.  This happens *only* if a get/set occurs, i.e. when
    // |count > 0|.
    //
    // Also note that this copies elements effectively by memmove, *not* in
    // step 17's specified order.  This is unobservable, but it would be if we
    // used this method to implement shared typed arrays' copyWithin.
    if (count > 0)
        MoveTypedArrayElements(obj, to | 0, from | 0, count | 0);

    // Step 18.
    return obj;
}

// ES6 draft rev30 (2014/12/24) 22.2.3.6 %TypedArray%.prototype.entries()
function TypedArrayEntries() {
    // Step 1.
    var O = this;

    // We need to be a bit careful here, because in the Xray case we want to
    // create the iterator in our current compartment.
    //
    // Before doing that, though, we want to check that we have a typed array
    // and it does not have a detached array buffer.  We do the latter by just
    // calling GetAttachedArrayBuffer() and letting it throw if there isn't one.
    // In the case when we're not sure we have a typed array (e.g. we might have
    // a cross-compartment wrapper for one), we can go ahead and call
    // GetAttachedArrayBuffer via IsTypedArrayEnsuringArrayBuffer; that will
    // throw if we're not actually a wrapped typed array, or if we have a
    // detached array buffer.

    // Step 2-6.
    IsTypedArrayEnsuringArrayBuffer(O);

    // Step 7.
    return CreateArrayIterator(O, ITEM_KIND_KEY_AND_VALUE);
}

// ES6 draft rev30 (2014/12/24) 22.2.3.7 %TypedArray%.prototype.every(callbackfn[, thisArg]).
function TypedArrayEvery(callbackfn/*, thisArg*/) {
    // Steps 1-2.
    var O = this;

    // This function is not generic.
    // We want to make sure that we have an attached buffer, per spec prose.
    var isTypedArray = IsTypedArrayEnsuringArrayBuffer(O);

    // If we got here, `this` is either a typed array or a cross-compartment
    // wrapper for one.

    // Steps 3-5.
    var len;
    if (isTypedArray)
        len = TypedArrayLength(O);
    else
        len = callFunction(CallTypedArrayMethodIfWrapped, O, O, "TypedArrayLength");

    // Step 6.
    if (arguments.length === 0)
        ThrowTypeError(JSMSG_MISSING_FUN_ARG, 0, "%TypedArray%.prototype.every");
    if (!IsCallable(callbackfn))
        ThrowTypeError(JSMSG_NOT_FUNCTION, DecompileArg(0, callbackfn));

    // Step 7.
    var T = arguments.length > 1 ? arguments[1] : void 0;

    // Steps 8-9.
    // Omit steps 9.a-9.c and the 'if' clause in step 9.d, since there are no holes in typed arrays.
    for (var k = 0; k < len; k++) {
        // Steps 9.d.i-9.d.ii.
        var kValue = O[k];

        // Steps 9.d.iii-9.d.iv.
        var testResult = callContentFunction(callbackfn, T, kValue, k, O);

        // Step 9.d.v.
        if (!testResult)
            return false;
    }

    // Step 10.
    return true;
}

// ES6 draft rev29 (2014/12/06) 22.2.3.8 %TypedArray%.prototype.fill(value [, start [, end ]])
function TypedArrayFill(value, start = 0, end = undefined) {
    // This function is not generic.
    if (!IsObject(this) || !IsTypedArray(this)) {
        return callFunction(CallTypedArrayMethodIfWrapped, this, value, start, end,
                            "TypedArrayFill");
    }

    GetAttachedArrayBuffer(this);

    // Steps 1-2.
    var O = this;

    // Steps 3-5.
    var len = TypedArrayLength(O);

    // Steps 6-7.
    var relativeStart = ToInteger(start);

    // Step 8.
    var k = relativeStart < 0
            ? std_Math_max(len + relativeStart, 0)
            : std_Math_min(relativeStart, len);

    // Steps 9-10.
    var relativeEnd = end === undefined ? len : ToInteger(end);

    // Step 11.
    var final = relativeEnd < 0
                ? std_Math_max(len + relativeEnd, 0)
                : std_Math_min(relativeEnd, len);

    // Step 12.
    for (; k < final; k++) {
        O[k] = value;
    }

    // Step 13.
    return O;
}

// ES6 draft 32 (2015-02-02) 22.2.3.9 %TypedArray%.prototype.filter(callbackfn[, thisArg])
function TypedArrayFilter(callbackfn/*, thisArg*/) {
    // Step 1.
    var O = this;

    // Steps 2-3.
    // This function is not generic.
    // We want to make sure that we have an attached buffer, per spec prose.
    var isTypedArray = IsTypedArrayEnsuringArrayBuffer(O);

    // If we got here, `this` is either a typed array or a cross-compartment
    // wrapper for one.

    // Step 4.
    var len;
    if (isTypedArray)
        len = TypedArrayLength(O);
    else
        len = callFunction(CallTypedArrayMethodIfWrapped, O, O, "TypedArrayLength");

    // Step 5.
    if (arguments.length === 0)
        ThrowTypeError(JSMSG_MISSING_FUN_ARG, 0, "%TypedArray%.prototype.filter");
    if (!IsCallable(callbackfn))
        ThrowTypeError(JSMSG_NOT_FUNCTION, DecompileArg(0, callbackfn));

    // Step 6.
    var T = arguments.length > 1 ? arguments[1] : void 0;

    // Step 7.
    var defaultConstructor = _ConstructorForTypedArray(O);

    // Steps 8-9.
    var C = SpeciesConstructor(O, defaultConstructor);

    // Step 10.
    var kept = new List();

    // Step 12.
    var captured = 0;

    // Steps 11, 13 and 13.g.
    for (var k = 0; k < len; k++) {
        // Steps 13.b-c.
        var kValue = O[k];
        // Steps 13.d-e.
        var selected = ToBoolean(callContentFunction(callbackfn, T, kValue, k, O));
        // Step 13.f.
        if (selected) {
            // Steps 13.f.i-ii.
            kept[captured++] = kValue;
        }
    }

    // Steps 14-15.
    var A = new C(captured);

    // Steps 16 and 17.c.
    for (var n = 0; n < captured; n++) {
        // Steps 17.a-b.
        A[n] = kept[n];
    }

    // Step 18.
    return A;
}

// ES6 draft rev28 (2014/10/14) 22.2.3.10 %TypedArray%.prototype.find(predicate[, thisArg]).
function TypedArrayFind(predicate/*, thisArg*/) {
    // Steps 1-2.
    var O = this;

    // This function is not generic.
    // We want to make sure that we have an attached buffer, per spec prose.
    var isTypedArray = IsTypedArrayEnsuringArrayBuffer(O);

    // If we got here, `this` is either a typed array or a cross-compartment
    // wrapper for one.

    // Steps 3-5.
    var len;
    if (isTypedArray)
        len = TypedArrayLength(O);
    else
        len = callFunction(CallTypedArrayMethodIfWrapped, O, O, "TypedArrayLength");

    // Step 6.
    if (arguments.length === 0)
        ThrowTypeError(JSMSG_MISSING_FUN_ARG, 0, "%TypedArray%.prototype.find");
    if (!IsCallable(predicate))
        ThrowTypeError(JSMSG_NOT_FUNCTION, DecompileArg(0, predicate));

    // Step 7.
    var T = arguments.length > 1 ? arguments[1] : void 0;

    // Steps 8-9.
    // Steps a (implicit), and g.
    for (var k = 0; k < len; k++) {
        // Steps a-c.
        var kValue = O[k];
        // Steps d-f.
        if (callContentFunction(predicate, T, kValue, k, O))
            return kValue;
    }

    // Step 10.
    return undefined;
}

// ES6 draft rev28 (2014/10/14) 22.2.3.11 %TypedArray%.prototype.findIndex(predicate[, thisArg]).
function TypedArrayFindIndex(predicate/*, thisArg*/) {
    // Steps 1-2.
    var O = this;

    // This function is not generic.
    // We want to make sure that we have an attached buffer, per spec prose.
    var isTypedArray = IsTypedArrayEnsuringArrayBuffer(O);

    // If we got here, `this` is either a typed array or a cross-compartment
    // wrapper for one.

    // Steps 3-5.
    var len;
    if (isTypedArray)
        len = TypedArrayLength(O);
    else
        len = callFunction(CallTypedArrayMethodIfWrapped, O, O, "TypedArrayLength");

    // Step 6.
    if (arguments.length === 0)
        ThrowTypeError(JSMSG_MISSING_FUN_ARG, 0, "%TypedArray%.prototype.findIndex");
    if (!IsCallable(predicate))
        ThrowTypeError(JSMSG_NOT_FUNCTION, DecompileArg(0, predicate));

    // Step 7.
    var T = arguments.length > 1 ? arguments[1] : void 0;

    // Steps 8-9.
    // Steps a (implicit), and g.
    for (var k = 0; k < len; k++) {
        // Steps a-f.
        if (callContentFunction(predicate, T, O[k], k, O))
            return k;
    }

    // Step 10.
    return -1;
}

// ES6 draft rev31 (2015-01-15) 22.1.3.10 %TypedArray%.prototype.forEach(callbackfn[,thisArg])
function TypedArrayForEach(callbackfn/*, thisArg*/) {
    // Step 1-2.
    var O = this;

    // This function is not generic.
    // We want to make sure that we have an attached buffer, per spec prose.
    var isTypedArray = IsTypedArrayEnsuringArrayBuffer(O);

    // If we got here, `this` is either a typed array or a cross-compartment
    // wrapper for one.

    // Step 3-4.
    var len;
    if (isTypedArray)
        len = TypedArrayLength(O);
    else
        len = callFunction(CallTypedArrayMethodIfWrapped, O, O, "TypedArrayLength");

    // Step 5.
    if (arguments.length === 0)
        ThrowTypeError(JSMSG_MISSING_FUN_ARG, 0, 'TypedArray.prototype.forEach');
    if (!IsCallable(callbackfn))
        ThrowTypeError(JSMSG_NOT_FUNCTION, DecompileArg(0, callbackfn));

    // Step 6.
    var T = arguments.length > 1 ? arguments[1] : void 0;

    // Step 7-8.
    // Step 7, 8a (implicit) and 8e.
    for (var k = 0; k < len; k++) {
        // Step 8b-8c are unnecessary since the condition always holds true for TypedArray.
        // Step 8d.
        callContentFunction(callbackfn, T, O[k], k, O);
    }

    // Step 9.
    return undefined;
}

// ES6 draft rev29 (2014/12/06) 22.2.3.13 %TypedArray%.prototype.indexOf(searchElement[, fromIndex]).
function TypedArrayIndexOf(searchElement, fromIndex = 0) {
    // This function is not generic.
    if (!IsObject(this) || !IsTypedArray(this)) {
        return callFunction(CallTypedArrayMethodIfWrapped, this, searchElement, fromIndex,
                            "TypedArrayIndexOf");
    }

    GetAttachedArrayBuffer(this);

    // Steps 1-2.
    var O = this;

    // Steps 3-5.
    var len = TypedArrayLength(O);

    // Step 6.
    if (len === 0)
        return -1;

    // Steps 7-8.  Add zero to convert -0 to +0, per ES6 5.2.
    var n = ToInteger(fromIndex) + 0;

    // Step 9.
    if (n >= len)
        return -1;

    var k;
    // Step 10.
    if (n >= 0) {
        k = n;
    }
    // Step 11.
    else {
        // Step a.
        k = len + n;
        // Step b.
        if (k < 0)
            k = 0;
    }

    // Step 12.
    // Omit steps a-b, since there are no holes in typed arrays.
    for (; k < len; k++) {
        if (O[k] === searchElement)
            return k;
    }

    // Step 13.
    return -1;
}

// ES6 draft rev30 (2014/12/24) 22.2.3.14 %TypedArray%.prototype.join(separator).
function TypedArrayJoin(separator) {
    // This function is not generic.
    if (!IsObject(this) || !IsTypedArray(this)) {
        return callFunction(CallTypedArrayMethodIfWrapped, this, separator, "TypedArrayJoin");
    }

    GetAttachedArrayBuffer(this);

    // Steps 1-2.
    var O = this;

    // Steps 3-5.
    var len = TypedArrayLength(O);

    // Steps 6-7.
    var sep = separator === undefined ? "," : ToString(separator);

    // Step 8.
    if (len === 0)
        return "";

    // Step 9.
    var element0 = O[0];

    // Steps 10-11.
    // Omit the 'if' clause in step 10, since typed arrays can't have undefined or null elements.
    var R = ToString(element0);

    // Steps 12-13.
    for (var k = 1; k < len; k++) {
        // Step 13.a.
        var S = R + sep;

        // Step 13.b.
        var element = O[k];

        // Steps 13.c-13.d.
        // Omit the 'if' clause in step 13.c, since typed arrays can't have undefined or null elements.
        var next = ToString(element);

        // Step 13.e.
        R = S + next;
    }

    // Step 14.
    return R;
}

// ES6 draft (2016/1/11) 22.2.3.15 %TypedArray%.prototype.keys()
function TypedArrayKeys() {
    // Step 1.
    var O = this;

    // See the big comment in TypedArrayEntries for what we're doing here.

    // Step 2.
    IsTypedArrayEnsuringArrayBuffer(O);

    // Step 3.
    return CreateArrayIterator(O, ITEM_KIND_KEY);
}

// ES6 draft rev29 (2014/12/06) 22.2.3.16 %TypedArray%.prototype.lastIndexOf(searchElement [,fromIndex]).
function TypedArrayLastIndexOf(searchElement, fromIndex = undefined) {
    // This function is not generic.
    if (!IsObject(this) || !IsTypedArray(this)) {
        return callFunction(CallTypedArrayMethodIfWrapped, this, searchElement, fromIndex,
                            "TypedArrayLastIndexOf");
    }

    GetAttachedArrayBuffer(this);

    // Steps 1-2.
    var O = this;

    // Steps 3-5.
    var len = TypedArrayLength(O);

    // Step 6.
    if (len === 0)
        return -1;

    // Steps 7-8.  Add zero to convert -0 to +0, per ES6 5.2.
    var n = fromIndex === undefined ? len - 1 : ToInteger(fromIndex) + 0;

    // Steps 9-10.
    var k = n >= 0 ? std_Math_min(n, len - 1) : len + n;

    // Step 11.
    // Omit steps a-b, since there are no holes in typed arrays.
    for (; k >= 0; k--) {
        if (O[k] === searchElement)
            return k;
    }

    // Step 12.
    return -1;
}

// ES6 draft rev32 (2015-02-02) 22.2.3.18 %TypedArray%.prototype.map(callbackfn [, thisArg]).
function TypedArrayMap(callbackfn/*, thisArg*/) {
    // Step 1.
    var O = this;

    // Steps 2-3.
    // This function is not generic.
    // We want to make sure that we have an attached buffer, per spec prose.
    var isTypedArray = IsTypedArrayEnsuringArrayBuffer(O);

    // If we got here, `this` is either a typed array or a cross-compartment
    // wrapper for one.

    // Step 4.
    var len;
    if (isTypedArray)
        len = TypedArrayLength(O);
    else
        len = callFunction(CallTypedArrayMethodIfWrapped, O, O, "TypedArrayLength");

    // Step 5.
    if (arguments.length === 0)
        ThrowTypeError(JSMSG_MISSING_FUN_ARG, 0, '%TypedArray%.prototype.map');
    if (!IsCallable(callbackfn))
        ThrowTypeError(JSMSG_NOT_FUNCTION, DecompileArg(0, callbackfn));

    // Step 6.
    var T = arguments.length > 1 ? arguments[1] : void 0;

    // Step 7.
    var defaultConstructor = _ConstructorForTypedArray(O);

    // Steps 8-9.
    var C = SpeciesConstructor(O, defaultConstructor);

    // Steps 10-11.
    var A = new C(len);

    // Steps 12, 13.a (implicit) and 13.h.
    for (var k = 0; k < len; k++) {
        // Steps 13.d-e.
        var mappedValue = callContentFunction(callbackfn, T, O[k], k, O);
        // Steps 13.f-g.
        A[k] = mappedValue;
    }

    // Step 14.
    return A;
}

// ES6 draft rev30 (2014/12/24) 22.2.3.19 %TypedArray%.prototype.reduce(callbackfn[, initialValue]).
function TypedArrayReduce(callbackfn/*, initialValue*/) {
    // Steps 1-2.
    var O = this;

    // This function is not generic.
    // We want to make sure that we have an attached buffer, per spec prose.
    var isTypedArray = IsTypedArrayEnsuringArrayBuffer(O);

    // If we got here, `this` is either a typed array or a cross-compartment
    // wrapper for one.

    // Steps 3-5.
    var len;
    if (isTypedArray)
        len = TypedArrayLength(O);
    else
        len = callFunction(CallTypedArrayMethodIfWrapped, O, O, "TypedArrayLength");

    // Step 6.
    if (arguments.length === 0)
        ThrowTypeError(JSMSG_MISSING_FUN_ARG, 0, "%TypedArray%.prototype.reduce");
    if (!IsCallable(callbackfn))
        ThrowTypeError(JSMSG_NOT_FUNCTION, DecompileArg(0, callbackfn));

    // Step 7.
    if (len === 0 && arguments.length === 1)
        ThrowTypeError(JSMSG_EMPTY_ARRAY_REDUCE);

    // Step 8.
    var k = 0;

    // Steps 9-10.
    // Omit some steps, since 'accumulator' should always be O[0] in step 10 for typed arrays.
    var accumulator = arguments.length > 1 ? arguments[1] : O[k++];

    // Step 11.
    // Omit steps 11.b-11.c and the 'if' clause in step 11.d, since there are no holes in typed arrays.
    for (; k < len; k++) {
        accumulator = callContentFunction(callbackfn, undefined, accumulator, O[k], k, O);
    }

    // Step 12.
    return accumulator;
}

// ES6 draft rev30 (2014/12/24) 22.2.3.20 %TypedArray%.prototype.reduceRight(callbackfn[, initialValue]).
function TypedArrayReduceRight(callbackfn/*, initialValue*/) {
    // Steps 1-2.
    var O = this;

    // This function is not generic.
    // We want to make sure that we have an attached buffer, per spec prose.
    var isTypedArray = IsTypedArrayEnsuringArrayBuffer(O);

    // If we got here, `this` is either a typed array or a cross-compartment
    // wrapper for one.

    // Steps 3-5.
    var len;
    if (isTypedArray)
        len = TypedArrayLength(O);
    else
        len = callFunction(CallTypedArrayMethodIfWrapped, O, O, "TypedArrayLength");

    // Step 6.
    if (arguments.length === 0)
        ThrowTypeError(JSMSG_MISSING_FUN_ARG, 0, "%TypedArray%.prototype.reduceRight");
    if (!IsCallable(callbackfn))
        ThrowTypeError(JSMSG_NOT_FUNCTION, DecompileArg(0, callbackfn));

    // Step 7.
    if (len === 0 && arguments.length === 1)
        ThrowTypeError(JSMSG_EMPTY_ARRAY_REDUCE);

    // Step 8.
    var k = len - 1;

    // Steps 9-10.
    // Omit some steps, since 'accumulator' should always be O[len-1] in step 10 for typed arrays.
    var accumulator = arguments.length > 1 ? arguments[1] : O[k--];

    // Step 11.
    // Omit steps 11.b-11.c and the 'if' clause in step 11.d, since there are no holes in typed arrays.
    for (; k >= 0; k--) {
        accumulator = callContentFunction(callbackfn, undefined, accumulator, O[k], k, O);
    }

    // Step 12.
    return accumulator;
}

// ES6 draft rev29 (2014/12/06) 22.2.3.21 %TypedArray%.prototype.reverse().
function TypedArrayReverse() {
    // This function is not generic.
    if (!IsObject(this) || !IsTypedArray(this)) {
        return callFunction(CallTypedArrayMethodIfWrapped, this, "TypedArrayReverse");
    }

    GetAttachedArrayBuffer(this);

    // Steps 1-2.
    var O = this;

    // Steps 3-5.
    var len = TypedArrayLength(O);

    // Step 6.
    var middle = std_Math_floor(len / 2);

    // Steps 7-8.
    // Omit some steps, since there are no holes in typed arrays.
    // Especially all the HasProperty/*exists checks always succeed.
    for (var lower = 0; lower !== middle; lower++) {
        // Step 8.a.
        var upper = len - lower - 1;

        // Step 8.f.i.
        var lowerValue = O[lower];

        // Step 8.i.i.
        var upperValue = O[upper];

        // We always end up in the step 8.j. case.
        O[lower] = upperValue;
        O[upper] = lowerValue;
    }

    // Step 9.
    return O;
}

// ES6 draft 20150220 22.2.3.22.1 %TypedArray%.prototype.set(array [, offset])
function SetFromNonTypedArray(target, array, targetOffset, targetLength, targetBuffer) {
    assert(!IsPossiblyWrappedTypedArray(array),
           "typed arrays must be passed to SetFromTypedArray");

    // Steps 1-11 provided by caller.

    // Steps 16-17.
    var src = ToObject(array);

    // Steps 18-19.
    var srcLength = ToLength(src.length);

    // Step 20.
    var limitOffset = targetOffset + srcLength;
    if (limitOffset > targetLength)
        ThrowRangeError(JSMSG_BAD_INDEX);

    // Step 22.
    var k = 0;

    // Optimization: if the buffer is shared then it is not detachable
    // and also not inline, so avoid checking overhead inside the loop in
    // that case.
    var isShared = targetBuffer !== null && IsSharedArrayBuffer(targetBuffer);

    // Steps 12-15, 21, 23-24.
    while (targetOffset < limitOffset) {
        // Steps 24a-c.
        var kNumber = ToNumber(src[k]);

        // Step 24d.  This explicit check will be unnecessary when we implement
        // throw-on-getting/setting-element-in-detached-buffer semantics.
        if (!isShared) {
            if (targetBuffer === null) {
                // A typed array previously using inline storage may acquire a
                // buffer, so we must check with the source.
                targetBuffer = ViewedArrayBufferIfReified(target);
            }
            if (IsDetachedBuffer(targetBuffer))
                ThrowTypeError(JSMSG_TYPED_ARRAY_DETACHED);
        }

        // Step 24e.
        target[targetOffset] = kNumber;

        // Steps 24f-g.
        k++;
        targetOffset++;
    }

    // Step 25.
    return undefined;
}

// ES6 draft 20150220 22.2.3.22.2 %TypedArray%.prototype.set(typedArray [, offset])
function SetFromTypedArray(target, typedArray, targetOffset, targetLength) {
    assert(IsPossiblyWrappedTypedArray(typedArray),
           "only typed arrays may be passed to this method");

    // Steps 1-11 provided by caller.

    // Steps 12-24.
    var res = SetFromTypedArrayApproach(target, typedArray, targetOffset,
                                        targetLength | 0);
    assert(res === JS_SETTYPEDARRAY_SAME_TYPE ||
           res === JS_SETTYPEDARRAY_OVERLAPPING ||
           res === JS_SETTYPEDARRAY_DISJOINT,
           "intrinsic didn't return one of its enumerated return values");

    // If the elements had the same type, then SetFromTypedArrayApproach also
    // performed step 29.
    if (res == JS_SETTYPEDARRAY_SAME_TYPE)
        return undefined; // Step 25: done.

    // Otherwise, all checks and side effects except the actual element-writing
    // happened.  Either we're assigning from one range to a non-overlapping
    // second range, or we're not.

    if (res === JS_SETTYPEDARRAY_DISJOINT) {
        SetDisjointTypedElements(target, targetOffset | 0, typedArray);
        return undefined; // Step 25: done.
    }

    // Now the hard case: overlapping memory ranges.  Delegate to yet another
    // intrinsic.
    SetOverlappingTypedElements(target, targetOffset | 0, typedArray);

    // Step 25.
    return undefined;
}

// ES6 draft 20150304 %TypedArray%.prototype.set
function TypedArraySet(overloaded, offset = 0) {
    // Steps 2-5, either algorithm.
    var target = this;
    if (!IsObject(target) || !IsTypedArray(target)) {
        return callFunction(CallTypedArrayMethodIfWrapped,
                            target, overloaded, offset, "TypedArraySet");
    }

    // Steps 6-8, either algorithm.
    var targetOffset = ToInteger(offset);
    if (targetOffset < 0)
        ThrowRangeError(JSMSG_TYPED_ARRAY_NEGATIVE_ARG, "2");

    // Steps 9-10.
    var targetBuffer = GetAttachedArrayBuffer(target);

    // Step 11.
    var targetLength = TypedArrayLength(target);

    // Steps 12 et seq.
    if (IsPossiblyWrappedTypedArray(overloaded))
        return SetFromTypedArray(target, overloaded, targetOffset, targetLength);

    return SetFromNonTypedArray(target, overloaded, targetOffset, targetLength, targetBuffer);
}

// ES6 draft rev32 (2015-02-02) 22.2.3.23 %TypedArray%.prototype.slice(start, end).
function TypedArraySlice(start, end) {

    // Step 1.
    var O = this;

    // Step 2-3.
    if (!IsObject(O) || !IsTypedArray(O)) {
        return callFunction(CallTypedArrayMethodIfWrapped, O, start, end, "TypedArraySlice");
    }

    GetAttachedArrayBuffer(O);

    // Step 4.
    var len = TypedArrayLength(O);

    // Steps 5-6.
    var relativeStart = ToInteger(start);

    // Step 7.
    var k = relativeStart < 0
            ? std_Math_max(len + relativeStart, 0)
            : std_Math_min(relativeStart, len);

    // Steps 8-9.
    var relativeEnd = end === undefined ? len : ToInteger(end);

    // Step 10.
    var final = relativeEnd < 0
                ? std_Math_max(len + relativeEnd, 0)
                : std_Math_min(relativeEnd, len);

    // Step 11.
    var count = std_Math_max(final - k, 0);

    // Step 12.
    var defaultConstructor = _ConstructorForTypedArray(O);

    // Steps 13-14.
    var C = SpeciesConstructor(O, defaultConstructor);

    // Steps 15-16.
    var A = new C(count);

    // Step 17.
    var n = 0;

    // Step 18.
    while (k < final) {
        // Steps 18.a-e.
        A[n] = O[k];
        // Step 18f.
        k++;
        // Step 18g.
        n++;
    }

    // Step 19.
    return A;
}

// ES6 draft rev30 (2014/12/24) 22.2.3.25 %TypedArray%.prototype.some(callbackfn[, thisArg]).
function TypedArraySome(callbackfn/*, thisArg*/) {
    // Steps 1-2.
    var O = this;

    // This function is not generic.
    // We want to make sure that we have an attached buffer, per spec prose.
    var isTypedArray = IsTypedArrayEnsuringArrayBuffer(O);

    // If we got here, `this` is either a typed array or a cross-compartment
    // wrapper for one.

    // Steps 3-5.
    var len;
    if (isTypedArray)
        len = TypedArrayLength(O);
    else
        len = callFunction(CallTypedArrayMethodIfWrapped, O, O, "TypedArrayLength");

    // Step 6.
    if (arguments.length === 0)
        ThrowTypeError(JSMSG_MISSING_FUN_ARG, 0, "%TypedArray%.prototype.some");
    if (!IsCallable(callbackfn))
        ThrowTypeError(JSMSG_NOT_FUNCTION, DecompileArg(0, callbackfn));

    // Step 7.
    var T = arguments.length > 1 ? arguments[1] : void 0;

    // Steps 8-9.
    // Omit steps 9.a-9.c and the 'if' clause in step 9.d, since there are no holes in typed arrays.
    for (var k = 0; k < len; k++) {
        // Steps 9.d.i-9.d.ii.
        var kValue = O[k];

        // Steps 9.d.iii-9.d.iv.
        var testResult = callContentFunction(callbackfn, T, kValue, k, O);

        // Step 9.d.v.
        if (testResult)
            return true;
    }

    // Step 10.
    return false;
}

// ES6 draft 20151210 22.2.3.26
// Cases are ordered according to likelihood of occurrence
// as opposed to the ordering in the spec.
function TypedArrayCompare(x, y) {
    // Step 1.
    assert(typeof x === "number" && typeof y === "number",
           "x and y are not numbers.");

    // Steps 6 - 7.
    var diff = x - y;
    if (diff)
        return diff;

    // Steps 8 - 10.
    if (x === 0 && y === 0)
        return (1/x > 0 ? 1 : 0) - (1/y > 0 ? 1 : 0);

    // Step 2. Implemented in TypedArraySort

    // Step 3.
    if (Number_isNaN(x) && Number_isNaN(y))
        return 0;

    // Steps 4 - 5.
    if (Number_isNaN(x) || Number_isNaN(y))
        return Number_isNaN(x) ? 1 : -1;

}

// ES6 draft 20151210 22.2.3.26 %TypedArray%.prototype.sort ( comparefn ).
function TypedArraySort(comparefn) {
    // This function is not generic.

    // Step 1.
    var obj = this;

    // Step 2.
    var isTypedArray = IsObject(obj) && IsTypedArray(obj);

    var buffer;
    if (isTypedArray) {
        buffer = GetAttachedArrayBuffer(obj);
    }
    else {
        buffer = callFunction(CallTypedArrayMethodIfWrapped, obj, obj, "GetAttachedArrayBuffer");
    }

    // Step 3.
    var len;
    if (isTypedArray) {
        len = TypedArrayLength(obj);
    } else {
        len = callFunction(CallTypedArrayMethodIfWrapped, obj, obj, "TypedArrayLength");
    }

    if (comparefn === undefined) {
        comparefn = TypedArrayCompare;
        // CountingSort doesn't invoke the comparefn
        if (IsUint8TypedArray(obj)) {
            return CountingSort(obj, len, false /* signed */);
        } else if (IsInt8TypedArray(obj)) {
            return CountingSort(obj, len, true /* signed */);
        } else if (IsUint16TypedArray(obj)) {
            return RadixSort(obj, len, buffer, 2 /* nbytes */, false /* signed */, false /* floating */, comparefn);
        } else if (IsInt16TypedArray(obj)) {
            return RadixSort(obj, len, buffer, 2 /* nbytes */, true /* signed */, false /* floating */, comparefn);
        } else if (IsUint32TypedArray(obj)) {
            return RadixSort(obj, len, buffer, 4 /* nbytes */, false /* signed */, false /* floating */, comparefn);
        } else if (IsInt32TypedArray(obj)) {
            return RadixSort(obj, len, buffer, 4 /* nbytes */, true /* signed */, false /* floating */, comparefn);
        } else if (IsFloat32TypedArray(obj)) {
            return RadixSort(obj, len, buffer, 4 /* nbytes */, true /* signed */, true /* floating */, comparefn);
        }
    }

    // To satisfy step 2 from TypedArray SortCompare described in 22.2.3.26
    // the user supplied comparefn is wrapped.
    var wrappedCompareFn = comparefn;
    comparefn = function(x, y) {
        // Step a.
        var v = wrappedCompareFn(x, y);
        // Step b.
        var bufferDetached;
        if (isTypedArray) {
            bufferDetached = IsDetachedBuffer(buffer);
        } else {
            // This is totally cheating and only works because we know `this`
            // and `buffer` are same-compartment".
            bufferDetached = callFunction(CallTypedArrayMethodIfWrapped, this,
                                          buffer, "IsDetachedBuffer");
        }
        if (bufferDetached)
            ThrowTypeError(JSMSG_TYPED_ARRAY_DETACHED);
        // Step c. is redundant, see:
        // https://bugzilla.mozilla.org/show_bug.cgi?id=1121937#c36
        // Step d.
        return v;
    }

    return QuickSort(obj, len, comparefn);
}

// ES2017 draft rev f8a9be8ea4bd97237d176907a1e3080dce20c68f
//   22.2.3.28 %TypedArray%.prototype.toLocaleString ([ reserved1 [ , reserved2 ] ])
// ES2017 Intl draft rev 78bbe7d1095f5ff3760ac4017ed366026e4cb276
//   13.4.1 Array.prototype.toLocaleString ([ locales [ , options ]])
function TypedArrayToLocaleString(locales = undefined, options = undefined) {
    // ValidateTypedArray, then step 1.
    var array = this;

    // This function is not generic.
    // We want to make sure that we have an attached buffer, per spec prose.
    var isTypedArray = IsTypedArrayEnsuringArrayBuffer(array);

    // If we got here, `this` is either a typed array or a cross-compartment
    // wrapper for one.

    // Step 2.
    var len;
    if (isTypedArray)
        len = TypedArrayLength(array);
    else
        len = callFunction(CallTypedArrayMethodIfWrapped, array, array, "TypedArrayLength");

    // Step 4.
    if (len === 0)
        return "";

    // Step 5.
    var firstElement = array[0];

    // Steps 6-7.
    // Omit the 'if' clause in step 6, since typed arrays can't have undefined
    // or null elements.
#if EXPOSE_INTL_API
    var R = ToString(callContentFunction(firstElement.toLocaleString, firstElement, locales, options));
#else
    var R = ToString(callContentFunction(firstElement.toLocaleString, firstElement));
#endif

    // Step 3 (reordered).
    // We don't (yet?) implement locale-dependent separators.
    var separator = ",";

    // Steps 8-9.
    for (var k = 1; k < len; k++) {
        // Step 9.a.
        var S = R + separator;

        // Step 9.b.
        var nextElement = array[k];

        // Step 9.c *should* be unreachable: typed array elements are numbers.
        // But bug 1079853 means |nextElement| *could* be |undefined|, if the
        // previous iteration's step 9.d or step 7 detached |array|'s buffer.
        // Conveniently, if this happens, evaluating |nextElement.toLocaleString|
        // throws the required TypeError, and the only observable difference is
        // the error message. So despite bug 1079853, we can skip step 9.c.

        // Step 9.d.
#if EXPOSE_INTL_API
        R = ToString(callContentFunction(nextElement.toLocaleString, nextElement, locales, options));
#else
        R = ToString(callContentFunction(nextElement.toLocaleString, nextElement));
#endif

        // Step 9.e.
        R = S + R;
    }

    // Step 10.
    return R;
}

// ES6 draft 20150304 %TypedArray%.prototype.subarray
function TypedArraySubarray(begin, end) {
    // Step 1.
    var obj = this;

    // Steps 2-3.
    // This function is not generic.
    if (!IsObject(obj) || !IsTypedArray(obj)) {
        return callFunction(CallTypedArrayMethodIfWrapped, this, begin, end,
                            "TypedArraySubarray");
    }

    // Steps 4-6.
    var buffer = TypedArrayBuffer(obj);
    var srcLength = TypedArrayLength(obj);

    // Steps 7-9.
    var relativeBegin = ToInteger(begin);
    var beginIndex = relativeBegin < 0 ? std_Math_max(srcLength + relativeBegin, 0)
                                       : std_Math_min(relativeBegin, srcLength);

    // Steps 10-12.
    var relativeEnd = end === undefined ? srcLength : ToInteger(end);
    var endIndex = relativeEnd < 0 ? std_Math_max(srcLength + relativeEnd, 0)
                                   : std_Math_min(relativeEnd, srcLength);

    // Step 13.
    var newLength = std_Math_max(endIndex - beginIndex, 0);

    // Steps 14-15, altered to use a shift instead of a size for performance.
    var elementShift = TypedArrayElementShift(obj);

    // Step 16.
    var srcByteOffset = TypedArrayByteOffset(obj);

    // Step 17.
    var beginByteOffset = srcByteOffset + (beginIndex << elementShift);

    // Steps 18-20.
    var defaultConstructor = _ConstructorForTypedArray(obj);
    var constructor = SpeciesConstructor(obj, defaultConstructor);

    // Steps 21-22.
    return new constructor(buffer, beginByteOffset, newLength);
}

// ES6 draft rev30 (2014/12/24) 22.2.3.30 %TypedArray%.prototype.values()
function TypedArrayValues() {
    // Step 1.
    var O = this;

    // See the big comment in TypedArrayEntries for what we're doing here.
    IsTypedArrayEnsuringArrayBuffer(O);

    // Step 7.
    return CreateArrayIterator(O, ITEM_KIND_VALUE);
}
_SetCanonicalName(TypedArrayValues, "values");

// Proposed for ES7:
// https://github.com/tc39/Array.prototype.includes/blob/7c023c19a0/spec.md
function TypedArrayIncludes(searchElement, fromIndex = 0) {
    // This function is not generic.
    if (!IsObject(this) || !IsTypedArray(this)) {
        return callFunction(CallTypedArrayMethodIfWrapped, this, searchElement,
                            fromIndex, "TypedArrayIncludes");
    }

    GetAttachedArrayBuffer(this);

    // Steps 1-2.
    var O = this;

    // Steps 3-4.
    var len = TypedArrayLength(O);

    // Step 5.
    if (len === 0)
        return false;

    // Steps 6-7.
    var n = ToInteger(fromIndex);

    var k;
    // Step 8.
    if (n >= 0) {
        k = n;
    }
    // Step 9.
    else {
        // Step a.
        k = len + n;
        // Step b.
        if (k < 0)
            k = 0;
    }

    // Step 10.
    while (k < len) {
        // Steps a-c.
        if (SameValueZero(searchElement, O[k]))
            return true;

        // Step d.
        k++;
    }

    // Step 11.
    return false;
}

// ES6 draft rev30 (2014/12/24) 22.2.2.1 %TypedArray%.from(source[, mapfn[, thisArg]]).
function TypedArrayStaticFrom(source, mapfn = undefined, thisArg = undefined) {
    // Step 1.
    var C = this;

    // Step 2.
    if (!IsConstructor(C))
        ThrowTypeError(JSMSG_NOT_CONSTRUCTOR, DecompileArg(1, C));

    // Step 3.
    var f = mapfn;

    // Step 4.
    if (f !== undefined && !IsCallable(f))
        ThrowTypeError(JSMSG_NOT_FUNCTION, DecompileArg(1, f));

    // Steps 5-6.
    return TypedArrayFrom(C, undefined, source, f, thisArg);
}

// ES6 draft rev30 (2014/12/24) 22.2.2.1.1 TypedArrayFrom().
function TypedArrayFrom(constructor, target, items, mapfn, thisArg) {
    // Step 1.
    var C = constructor;

    // Step 2.
    assert(C === undefined || target === undefined,
           "Neither of 'constructor' and 'target' is undefined");

    // Step 3.
    assert(IsConstructor(C) || C === undefined,
           "'constructor' is neither an constructor nor undefined");

    // Step 4.
    assert(target === undefined || IsTypedArray(target),
           "'target' is neither a typed array nor undefined");

    // Step 5.
    assert(IsCallable(mapfn) || mapfn === undefined,
           "'target' is neither a function nor undefined");

    // Steps 6-7.
    var mapping = mapfn !== undefined;
    var T = thisArg;

    // Steps 8-9.
    var usingIterator = GetMethod(items, std_iterator);

    // Step 10.
    if (usingIterator !== undefined) {
        // Steps 10.a-b.
        var iterator = GetIterator(items, usingIterator);

        // Step 10.c.
        var values = new List();

        // Steps 10.d-e.
        var i = 0;
        while (true) {
            // Steps 10.e.i-ii.
            var next = callContentFunction(iterator.next, iterator);
            if (!IsObject(next))
                ThrowTypeError(JSMSG_NEXT_RETURNED_PRIMITIVE);

            // Steps 10.e.iii-vi.
            if (next.done)
                break;
            values[i++] = next.value;
        }

        // Step 10.f.
        var len = i;

        // Steps 10.g-h.
        // There is no need to implement the 22.2.2.1.2 - TypedArrayAllocOrInit() method,
        // since `%TypedArray%(object)` currently doesn't call this self-hosted TypedArrayFrom().
        var targetObj = new C(len);

        // Steps 10.i-j.
        for (var k = 0; k < len; k++) {
            // Steps 10.j.i-ii.
            var kValue = values[k];

            // Steps 10.j.iii-iv.
            var mappedValue = mapping ? callContentFunction(mapfn, T, kValue, k) : kValue;

            // Steps 10.j.v-vi.
            targetObj[k] = mappedValue;
        }

        // Step 10.k.
        // asserting that `values` is empty here would require removing them one by one from
        // the list's start in the loop above. That would introduce unacceptable overhead.
        // Additionally, the loop's logic is simple enough not to require the assert.

        // Step 10.l.
        return targetObj;
    }

    // Step 11 is an assertion: items is not an Iterator. Testing this is
    // literally the very last thing we did, so we don't assert here.

    // Steps 12-13.
    var arrayLike = ToObject(items);

    // Steps 14-16.
    var len = ToLength(arrayLike.length);

    // Steps 17-18.
    // See comment for steps 10.g-h.
    var targetObj = new C(len);

    // Steps 19-20.
    for (var k = 0; k < len; k++) {
        // Steps 20.a-c.
        var kValue = arrayLike[k];

        // Steps 20.d-e.
        var mappedValue = mapping ? callContentFunction(mapfn, T, kValue, k) : kValue;

        // Steps 20.f-g.
        targetObj[k] = mappedValue;
    }

    // Step 21.
    return targetObj;
}

// ES6 draft rev30 (2014/12/24) 22.2.2.2 %TypedArray%.of(...items).
function TypedArrayStaticOf(/*...items*/) {
    // Step 1.
    var len = arguments.length;

    // Step 2.
    var items = arguments;

    // Step 3.
    var C = this;

    // Steps 4-5.
    if (!IsConstructor(C))
        ThrowTypeError(JSMSG_NOT_CONSTRUCTOR, typeof C);

    var newObj = new C(len);

    // Steps 6-7.
    for (var k = 0; k < len; k++)
        newObj[k] = items[k]

    // Step 8.
    return newObj;
}

// ES 2016 draft Mar 25, 2016 22.2.2.4.
function TypedArraySpecies() {
    // Step 1.
    return this;
}

// ES 2017 draft June 2, 2016 22.2.3.32
function TypedArrayToStringTag() {
    // Step 1.
    var O = this;

    // Steps 2-3.
    if (!IsObject(O) || !IsTypedArray(O))
        return undefined;

    // Steps 4-6.
    // Modified to retrieve the [[TypedArrayName]] from the constructor.
    return _NameForTypedArray(O);
}
_SetCanonicalName(TypedArrayToStringTag, "get [Symbol.toStringTag]");

// ES 2016 draft Mar 25, 2016 24.1.4.3.
function ArrayBufferSlice(start, end) {
    // Step 1.
    var O = this;

    // Steps 2-3,
    // This function is not generic.
    if (!IsObject(O) || !IsArrayBuffer(O)) {
        return callFunction(CallArrayBufferMethodIfWrapped, O, start, end,
                            "ArrayBufferSlice");
    }

    // Step 4.
    if (IsDetachedBuffer(O))
        ThrowTypeError(JSMSG_TYPED_ARRAY_DETACHED);

    // Step 5.
    var len = ArrayBufferByteLength(O);

    // Step 6.
    var relativeStart = ToInteger(start);

    // Step 7.
    var first = relativeStart < 0 ? std_Math_max(len + relativeStart, 0)
                                  : std_Math_min(relativeStart, len);

    // Step 8.
    var relativeEnd = end === undefined ? len
                                        : ToInteger(end);

    // Step 9.
    var final = relativeEnd < 0 ? std_Math_max(len + relativeEnd, 0)
                                : std_Math_min(relativeEnd, len);

    // Step 10.
    var newLen = std_Math_max(final - first, 0);

    // Step 11
    var ctor = SpeciesConstructor(O, GetBuiltinConstructor("ArrayBuffer"));

    // Step 12.
    var new_ = new ctor(newLen);

    var isWrapped = false;
    if (IsArrayBuffer(new_)) {
        // Step 14.
        if (IsDetachedBuffer(new_))
            ThrowTypeError(JSMSG_TYPED_ARRAY_DETACHED);
    } else {
        // Step 13.
        if (!IsWrappedArrayBuffer(new_))
            ThrowTypeError(JSMSG_NON_ARRAY_BUFFER_RETURNED);

        isWrapped = true;

        // Step 14.
        if (callFunction(CallArrayBufferMethodIfWrapped, new_, "IsDetachedBufferThis"))
            ThrowTypeError(JSMSG_TYPED_ARRAY_DETACHED);
    }

    // Step 15.
    if (new_ === O)
        ThrowTypeError(JSMSG_SAME_ARRAY_BUFFER_RETURNED);

    // Step 16.
    var actualLen = PossiblyWrappedArrayBufferByteLength(new_);
    if (actualLen < newLen)
        ThrowTypeError(JSMSG_SHORT_ARRAY_BUFFER_RETURNED, newLen, actualLen);

    // Step 18.
    if (IsDetachedBuffer(O))
        ThrowTypeError(JSMSG_TYPED_ARRAY_DETACHED);

    // Steps 19-21.
    ArrayBufferCopyData(new_, O, first | 0, newLen | 0, isWrapped);

    // Step 22.
    return new_;
}

function IsDetachedBufferThis() {
  return IsDetachedBuffer(this);
}

function ArrayBufferStaticSlice(buf, start, end) {
    if (arguments.length < 1)
        ThrowTypeError(JSMSG_MISSING_FUN_ARG, 0, 'ArrayBuffer.slice');
    return callFunction(ArrayBufferSlice, buf, start, end);
}

// ES 2016 draft Mar 25, 2016 24.1.3.3.
function ArrayBufferSpecies() {
    // Step 1.
    return this;
}
