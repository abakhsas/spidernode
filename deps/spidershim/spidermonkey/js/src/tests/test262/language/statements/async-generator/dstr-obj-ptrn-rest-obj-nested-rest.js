// |reftest| skip-if(release_or_beta) -- async-iteration is not released yet
// This file was procedurally generated from the following sources:
// - src/dstr-binding/obj-ptrn-rest-obj-nested-rest.case
// - src/dstr-binding/default/async-gen-func-decl.template
/*---
description: When DestructuringAssignmentTarget is an object literal, it should be parsed parsed as a DestructuringAssignmentPattern and evaluated as a destructuring assignment and object rest desconstruction is allowed in that case. (async generator function declaration)
esid: sec-asyncgenerator-definitions-instantiatefunctionobject
features: [object-rest, async-iteration]
flags: [generated, async]
includes: [propertyHelper.js]
info: |
    AsyncGeneratorDeclaration : async [no LineTerminator here] function * BindingIdentifier
        ( FormalParameters ) { AsyncGeneratorBody }

        [...]
        3. Let F be ! AsyncGeneratorFunctionCreate(Normal, FormalParameters, AsyncGeneratorBody,
            scope, strict).
        [...]

---*/


var callCount = 0;
async function* f({a, b, ...{c, ...rest}}) {
  assert.sameValue(a, 1);
  assert.sameValue(b, 2);
  assert.sameValue(c, 3);

  assert.sameValue(rest.d, 4);
  assert.sameValue(rest.e, 5);

  verifyEnumerable(rest, "d");
  verifyWritable(rest, "d");
  verifyConfigurable(rest, "d");

  verifyEnumerable(rest, "e");
  verifyWritable(rest, "e");
  verifyConfigurable(rest, "e");

  callCount = callCount + 1;
};
f({a: 1, b: 2, c: 3, d: 4, e: 5}).next().then(() => {
    assert.sameValue(callCount, 1, 'invoked exactly once');
}).then($DONE, $DONE);
