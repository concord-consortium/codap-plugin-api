import typescript from '@rollup/plugin-typescript';
import dts from "rollup-plugin-dts";
const config = [
  {
    input: 'build/codap-plugin-api.js',
    output: {
      file: 'codap-plugin-api.js',
      format: 'cjs',
      sourcemap: true,
    },
    // iframe-phone stays a runtime require rather than being inlined: it is a declared dependency,
    // so a consumer installs it themselves, and bundling it would duplicate the library for anyone
    // who also depends on it directly. Naming it here is also what silences rollup's
    // "unresolved dependencies" warning, which was rollup reporting that it had made this choice
    // without being told to.
    external: ['iframe-phone'],
    plugins: [typescript()]
  },

  {
    input: 'build/codap-plugin-api.d.ts',
    output: {
      file: 'codap-plugin-api.d.ts',
      format: 'es'
    },
    plugins: [dts()]
  }
];
export default config;