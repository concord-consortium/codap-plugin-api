# CODAP Plugin API

## Using as a library

This npm library provides two main files that will aid in interfacing with the CODAP Data Interactives API. `codapInterface.ts` sets up some basic functions for interfacing with CODAP, while `codap-helper.ts` contains more specialized functions utilizing the CODAP Data Interactive API for a variety of different purposes. Find the full documentation of the CODAP Data Interactive API [here](https://github.com/concord-consortium/codap/wiki/CODAP-Data-Interactive-Plugin-API).

### Installing and usage

In the directory of your plugin project, run `npm install codap-plugin-api`.

In myComponent.js:

```
import codapInterface from "codap-plugin-api";
import codapHelpers from "codap-plugin-api";

const myComponent = () => {
  useEffect(() => {
    const myOptions = {
      pluginName: myPlugin;
      version: 1.0.0;
      dimensions: {
        width: 300,
        height: 400
      };
    codapHelpers.initializePlugin(myOptions);
  }, []);
}
```

For more examples of how to use the npm package, see the [CODAP Plugin Starter Project](https://github.com/concord-consortium/codap-plugin-starter-project).

### Request timeouts

A request waits up to 60 seconds for CODAP to respond before it is rejected. Requests over large
datasets can legitimately take many seconds — creating several thousand items, say — so the
deadline is deliberately generous, and exists only so that a CODAP which never responds at all
(page closed, iframe removed) cannot leave a caller waiting forever.

```js
codapInterface.getRequestTimeout();        // 60000
codapInterface.setRequestTimeout(120000);  // allow longer for very large requests
```

`setRequestTimeout` applies to requests issued after the call; requests already in flight keep the
value they were given. A non-finite or non-positive value falls back to the default.

`sendRequest` accepts an optional callback in addition to returning a promise. The callback
receives CODAP's response, or `undefined` when the request failed — note that this is distinct from
a response of `{ success: false }`, which means CODAP answered and declined.

In TypeScript the callback's parameter has to admit that absence. The exported `RequestCallback` type
is `(response?: IResult, request?: any) => void`, so a callback declared to take `IResult` alone does
not compile — it is the one that throws when a request fails:

```ts
codapInterface.sendRequest(message, (result?: IResult) => {
  if (!result) { return; }        // the request failed; the promise rejects with the reason
  if (result.success) { /* ... */ }
});
```

A batched request — an array of requests — is answered with an array of results, which does not fit
that type. Batch through the returned promise rather than a callback.

`sendRequest` returns a promise whether or not a callback is passed, and that promise rejects with
an `Error` on the same failures the callback reports as `undefined`: the request exceeded its
deadline, CODAP answered with no value, or there was no connection to send it on. A request issued
before `initializePlugin()` is called, or after `codapInterface.destroy()`, is refused rather than
sent, and rejects at once. A rejected promise with nothing attached to it becomes an unhandled
rejection, so handle the promise even when the callback is doing the real work:

```js
codapInterface.sendRequest(message, result => { /* ... */ })
              .catch(error => console.warn("request failed", error));
```

The deadline applies to each request separately, so a helper that chains several can take a multiple
of it. `createCollectionFromAttribute` is the case to know about: when it has to find an unused name
for the new collection it searches for one suffix at a time, up to 104 requests in sequence, so its
worst case is that multiple of the deadline. That worst case needs a document already holding a
hundred similarly-named collections; the ordinary path is four requests.

### Exceptions thrown by your callback

If the callback you pass to `sendRequest` throws, the exception is rethrown as an uncaught error
rather than being logged and discarded. By the time the callback runs its request has already
settled, so what it throws is a bug in the callback and not a failure of the request — it does not
reject the promise, and the request's outcome is unaffected.

It stays loud on purpose. Logging it instead would hide a bug in your plugin from `window.onerror`
and from whatever error reporting you rely on. If you pass callbacks that can throw, handle the error
inside the callback.

The classic version of this is reading `result.success` on the `undefined` a callback receives when a
request fails. In TypeScript `RequestCallback` makes that a compile error instead, which is the whole
reason the parameter is typed; in JavaScript it remains a `TypeError` at runtime, on whichever failure
path reaches it first.

## Development

### Building

If you want to build a local version run `npm build`, it will create the files in the `dist` folder.

### Notes

1. Make sure if you are using Visual Studio Code that you use the workspace version of TypeScript.
   To ensure that you are open a TypeScript file in VSC and then click on the version number next to
   `TypeScript React` in the status bar and select 'Use Workspace Version' in the popup menu.

### Releasing

To release a new version:

1. Make sure you have an npm publishing account under the concordconsortium namespace.

2. Update the version number in `package.json`.

3. Run `npm install` to update the version number in `package-lock.json`.

4. Run `npm run build` to build the new version.

5. Run `npm publish --access public` to publish the new version.

## License

CODAP Plugin API are Copyright 2018 (c) by the Concord Consortium and is distributed under the [MIT license](http://www.opensource.org/licenses/MIT).

See license.md for the complete license text.
