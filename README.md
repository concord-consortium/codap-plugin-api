# CODAP Plugin API

## Using as a library

This npm library provides two main files that will aid in interfacing with the CODAP Data Interactives API. `codapInterface.ts` sets up some basic functions for interfacing with CODAP, while `codap-helper.ts` contains more specialized functions utilizing the CODAP Data Interactive API for a variety of different purposes. Find the full documentation of the CODAP Data Interactive API [here](https://github.com/concord-consortium/codap/wiki/CODAP-Data-Interactive-Plugin-API).

### Installing and usage

In the directory of your plugin project, run `npm install codap-plugin-api`.

In myComponent.js:

```
import codapInterface from "codap-plugin-api"
import codapHelpers from "codap-plugin-api"

const myComponent = () => {

  useEffect(() => {
    const myOptions = {
      pluginName: myPlugin;
      version: 1.0.0;
      dimensions: {
        width: 300,
        height: 400
      };
    }
    codapHelpers.initializePlugin(myOptions);
  }, [])
}
```

For more examples of how to use the npm package, see the [CODAP Plugin Starter Project](https://github.com/concord-consortium/codap-plugin-starter-project).

## Development

### Building

If you want to build a local version run `npm build`, it will create the files in the `dist` folder.

### Notes

1. Make sure if you are using Visual Studio Code that you use the workspace version of TypeScript.
   To ensure that you are open a TypeScript file in VSC and then click on the version number next to
   `TypeScript React` in the status bar and select 'Use Workspace Version' in the popup menu.


## License

CODAP Plugin API are Copyright 2018 (c) by the Concord Consortium and is distributed under the [MIT license](http://www.opensource.org/licenses/MIT).

See license.md for the complete license text.
