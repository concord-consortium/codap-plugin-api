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
    external: ['react'],
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