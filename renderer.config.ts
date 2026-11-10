import {fileURLToPath} from 'node:url';
const local=(path:string)=>fileURLToPath(new URL(path,import.meta.url));
export const rendererAliases=[
 {find:/^use-sync-external-store\/shim\/with-selector(\.js)?$/,replacement:local('./vendor/use-sync-external-store/with-selector.js')},
 {find:/^react$/,replacement:local('./vendor/preact/compat/src/index.js')},
 {find:/^react-dom\/client$/,replacement:local('./vendor/preact/compat/client.mjs')},
 {find:/^react-dom$/,replacement:local('./vendor/preact/compat/src/index.js')},
 {find:/^react\/jsx(-dev)?-runtime$/,replacement:local('./vendor/preact/jsx-runtime/src/index.js')},
 {find:/^preact$/,replacement:local('./vendor/preact/src/index.js')},
 {find:/^preact\/compat$/,replacement:local('./vendor/preact/compat/src/index.js')},
 {find:/^preact\/hooks$/,replacement:local('./vendor/preact/hooks/src/index.js')},
 {find:/^preact\/test-utils$/,replacement:local('./vendor/preact/test-utils/src/index.js')},
];
