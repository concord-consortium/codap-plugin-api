// iframe-phone ships an index.d.ts, but it does not describe the library as this package uses it, so
// this replaces those types rather than fighting them. Removing the declaration below produces a type
// error at the `new IframePhoneRpcEndpoint(...)` call in codap-interface.ts.
//
// Checked against iframe-phone 1.4.0, the current release. Two mismatches remain in its index.d.ts:
//
//   1. `IframePhoneRpcEndpoint`'s constructor is declared as taking either 1 argument or 5, all
//      required. We pass 3, which the implementation accepts: the remaining positional parameters are
//      optional in the JavaScript, where targetOrigin defaults and the phone is derived.
//   2. `ListenerCallback` takes one argument. The reply callback is invoked with a second when the
//      library's own advisory 2s timer expires, and that argument is the only thing distinguishing
//      that probe from CODAP answering with no value -- a distinction this package depends on. See
//      the `connection` declaration in codap-interface.ts, which spells out the signature relied on.
//
// A third mismatch, `call(message: string, ...)` typing the payload as a string when a
// data-interactive request is an object, was corrected in 1.4.0.
//
// So the shape of the connection is declared here, at that `connection` variable, rather than
// imported. If the two remaining mismatches are corrected upstream, delete this file and use the
// published types.
declare module "iframe-phone";
